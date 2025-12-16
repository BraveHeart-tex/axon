import { Project, SourceFile, SwitchStatement, SyntaxKind } from 'ts-morph';

import { logger } from '@/infra/logger.js';

export const updateFeatureFlagHelper = (flagName: string) => {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath('utils/helpers/feature-flag-helper.ts');

  const logicalName = flagName.replace(/^NEXT_PUBLIC_/, '');

  updateFeatureFlagUnion(sourceFile, logicalName);
  updateFeatureFlagSwitch(sourceFile, logicalName);

  sourceFile.saveSync();
  logger.success('File saved');
};

const updateFeatureFlagUnion = (sourceFile: SourceFile, logicalName: string) => {
  const typeAlias = sourceFile.getTypeAlias('FeatureFlagName');
  if (!typeAlias) return;

  const typeNode = typeAlias.getTypeNode();
  if (!typeNode) return;

  const flags = extractUnionFlags(typeNode.getText());

  if (!flags.includes(logicalName)) {
    flags.push(logicalName);
  }

  flags.sort((a, b) => a.localeCompare(b));

  const newUnion = formatUnion(flags);
  typeAlias.setType('\n  ' + newUnion);
  logger.success('Updated FeatureFlagName union (sorted)');
};

const extractUnionFlags = (typeText: string): string[] => {
  const matches = typeText.matchAll(/'([^']+)'/g);
  const flags: string[] = [];
  for (const match of matches) {
    flags.push(match[1]);
  }
  return flags;
};

const formatUnion = (flags: string[]): string => flags.map((f) => `| '${f}'`).join('\n  ');

const updateFeatureFlagSwitch = (sourceFile: SourceFile, logicalName: string) => {
  const variableStatement = sourceFile.getVariableDeclaration('isFeatureFlagEnabled');
  if (!variableStatement) {
    logger.error('Variable declaration isFeatureFlagEnabled not found');
    return;
  }

  const switchStatements = sourceFile.getDescendantsOfKind(SyntaxKind.SwitchStatement);
  if (switchStatements.length === 0) {
    logger.error('No switch statement found');
    return;
  }

  const switchStatement = switchStatements[0];
  const cases = extractSwitchCases(switchStatement);

  if (!cases.find((c) => c.name === logicalName)) {
    cases.push({ name: logicalName, envVar: logicalName });
    logger.success(`Added new feature flag case for ${logicalName}`);
  } else {
    logger.info(`Case for ${logicalName} already exists.`);
  }

  cases.sort((a, b) => a.name.localeCompare(b.name));

  const newSwitchBody = buildSwitchBody(cases);
  switchStatement.replaceWithText(newSwitchBody);
  logger.success('Switch statement sorted alphabetically');
};

const extractSwitchCases = (
  switchStatement: SwitchStatement,
): Array<{ name: string; envVar: string }> => {
  const caseBlock = switchStatement.getCaseBlock();
  const clauses = caseBlock.getClauses();
  const cases: Array<{ name: string; envVar: string }> = [];

  for (const clause of clauses) {
    if (clause.getKind() !== SyntaxKind.CaseClause) continue;

    const caseClause = clause.asKind(SyntaxKind.CaseClause);
    if (!caseClause) continue;

    const expression = caseClause.getExpression();
    const caseName = expression.getText().replace(/'/g, '');

    const statements = caseClause.getStatements();
    if (statements.length === 0) continue;

    const returnStatement = statements[0];
    const statementText = returnStatement.getText();
    const envVarMatch = statementText.match(/NEXT_PUBLIC_([^\s)]+)/);
    const envVar = envVarMatch ? envVarMatch[1] : caseName;

    cases.push({ name: caseName, envVar });
  }

  return cases;
};

const buildSwitchBody = (cases: Array<{ name: string; envVar: string }>): string => {
  const indent = '    ';
  const casesText = cases
    .map(
      ({ name, envVar }) =>
        `${indent}case '${name}':\n${indent}  return process.env.NEXT_PUBLIC_${envVar} === 'true';`,
    )
    .join('\n');

  return `switch (featureFlagName) {
${casesText}
${indent}default:
${indent}  return false;
  }`;
};
