import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

import { formatCodePane, HOOKS } from '@/domains/hooks/hooks.constants.js';

export const runHooksFlow = async () => {
  console.log(chalk.cyan.bold('\n  Axon Hook Manager'));
  console.log(chalk.dim('  Select hooks to install. Use arrows to preview code.\n'));

  let gitDir: string;
  try {
    const { stdout } = await execa('git', ['rev-parse', '--git-path', 'hooks']);
    gitDir = stdout.trim();
  } catch (err) {
    console.log(chalk.red('❌ Not a git repository or git not found.', err));
    return;
  }

  const choices = HOOKS.map((h) => {
    const installed = isHookInstalled(gitDir, h.hookFile, h.id);

    return {
      name: installed ? `${h.name} ${chalk.dim('(installed)')}` : h.name,
      value: h,
      checked: installed,
      description: `${chalk.white(h.description)}\n${formatCodePane(h.script)}`,
    };
  });

  const selectedHooks = await checkbox({
    message: 'Which hooks would you like to have active?',
    choices,
    theme: {
      style: {
        highlight: (text: string) => chalk.cyan(text),
        renderSelectedChoices: (selected: unknown[]) =>
          chalk.green(`${selected.length} hook(s) selected`),
      },
    },
  });

  if (selectedHooks.length === 0) {
    console.log(chalk.gray('No hooks selected. Exiting...'));
    return;
  }

  for (const hookDef of selectedHooks) {
    const filePath = path.resolve(gitDir, hookDef.hookFile);

    let existingContent = '';
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, 'utf8');
    }

    if (existingContent.includes(`# Axon: ${hookDef.id}`)) {
      console.log(chalk.yellow(`⚠ Hook "${hookDef.name}" is already installed. Skipping.`));
      continue;
    }

    // Append to existing file or create new with shebang
    const finalContent =
      existingContent.length > 0
        ? `${existingContent.trim()}\n\n${hookDef.script}`
        : `#!/bin/bash\n\n${hookDef.script}`;

    fs.writeFileSync(filePath, finalContent, { mode: 0o755 });
    console.log(`${chalk.green('✔')} Installed: ${chalk.bold(hookDef.name)}`);
  }

  console.log(chalk.cyan('\n  Done! Your repository hooks are up to date.'));
};

/**
 * Helper to check if a specific Axon hook is already present in the filesystem
 */
const isHookInstalled = (gitDir: string, hookFile: string, hookId: string): boolean => {
  const filePath = path.resolve(gitDir, hookFile);
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(`# Axon: ${hookId}`);
};
