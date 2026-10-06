import { checkbox, confirm } from '@inquirer/prompts';
import c from 'ansi-colors';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

import {
  buildHookCatalog,
  getHookMarkers,
  type HookDefinition,
  HOOKS,
  wrapScript,
} from '@/domains/hooks/hooks.constants.js';
import type { ProjectContext } from '@/domains/project/project.types.js';

export const runHooksFlow = async (project: ProjectContext) => {
  const catalog = buildHookCatalog(project);
  const available = catalog.filter((hook) => hook.flows.includes(project.flow.name));
  console.log(c.cyan.bold('\n  Axon Hook Manager'));
  console.log(c.dim('  Choose which safeguards should run in this repository.\n'));

  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot();
  } catch (err) {
    console.log(c.red('❌ Not a git repository or git not found.'), err);
    return;
  }

  const context = await getHookContext(repoRoot);
  const obsoleteBlocks = getObsoleteHookBlocks(context.axonHooksDir);

  const installedIds = new Set(
    HOOKS.filter((hook) =>
      isHookInstalled({
        hooksDir: context.axonHooksDir,
        hookFile: hook.hookFile,
        hookId: hook.id,
      }),
    ).map((hook) => hook.id),
  );

  const incompatible = catalog.filter(
    (hook) => installedIds.has(hook.id) && !hook.flows.includes(project.flow.name),
  );
  const removeIncompatible =
    incompatible.length > 0 &&
    (await confirm({
      message: `Remove hooks incompatible with ${project.flow.name}: ${incompatible.map((hook) => hook.name).join(', ')}?`,
      default: true,
    }));

  const choices = available.map((hook) => {
    const installed = installedIds.has(hook.id);
    const installedLabel = installed ? `  ${c.green('●')} ${c.dim('installed')}` : '';

    return {
      name: `${c.bold(hook.name)}${installedLabel}\n      ${c.dim(hook.description)}`,
      value: hook,
      checked: installed,
    };
  });

  const selectedHooks = await checkbox({
    message: 'Which hooks would you like to have active?',
    choices,
    theme: {
      style: {
        highlight: (text: string) => c.cyan(text),
        renderSelectedChoices: (selected: unknown[]) =>
          c.green(`${selected.length} hook(s) selected`),
      },
    },
  });

  for (const { hookFile, ids } of obsoleteBlocks) {
    syncHookFile({
      catalog,
      axonHooksDir: context.axonHooksDir,
      usesHusky: context.usesHusky,
      hookFile,
      nextHookIds: getInstalledHookIdsForFile({
        hooksDir: context.axonHooksDir,
        hookFile,
      }),
    });
    for (const id of ids) {
      console.log(`${c.red('✘')} ${c.bold(id)}: removed (obsolete)`);
    }
  }

  const selectedIds = new Set(selectedHooks.map((hook) => hook.id));
  const toUninstall = catalog.filter(
    (hook) =>
      installedIds.has(hook.id) &&
      !selectedIds.has(hook.id) &&
      (hook.flows.includes(project.flow.name) || removeIncompatible),
  );
  const toInstall = selectedHooks;

  for (const hook of toUninstall) {
    syncHookFile({
      catalog,
      axonHooksDir: context.axonHooksDir,
      usesHusky: context.usesHusky,
      hookFile: hook.hookFile,
      nextHookIds: getInstalledHookIdsForFile({
        hooksDir: context.axonHooksDir,
        hookFile: hook.hookFile,
      }).filter((id) => id !== hook.id),
    });
    console.log(`${c.red('✘')} Removed: ${c.bold(hook.name)}`);
  }

  for (const hook of toInstall) {
    const nextHookIds = getInstalledHookIdsForFile({
      hooksDir: context.axonHooksDir,
      hookFile: hook.hookFile,
    });

    if (!nextHookIds.includes(hook.id)) {
      nextHookIds.push(hook.id);
    }

    syncHookFile({
      catalog,
      axonHooksDir: context.axonHooksDir,
      usesHusky: context.usesHusky,
      hookFile: hook.hookFile,
      nextHookIds,
    });
    console.log(`${c.green('✔')} Installed: ${c.bold(hook.name)}`);
  }

  await reconcileLocalHooksPath(context);

  console.log(c.dim('  re-run axon hooks after changing jira.projectKeys'));
  console.log(c.cyan('\n  Done! Your repository hooks are synchronized.'));
};

const HUSKY_HOOKS_PATH = '.husky/_';

const getRepoRoot = async () => {
  const { stdout } = await execa('git', ['rev-parse', '--show-toplevel']);
  return stdout.trim();
};

const getGitCommonDir = async (repoRoot: string) => {
  const { stdout } = await execa('git', ['rev-parse', '--git-common-dir'], { cwd: repoRoot });
  return path.resolve(repoRoot, stdout.trim());
};

const getHookContext = async (repoRoot: string) => {
  const currentHooksPath = await getLocalHooksPath(repoRoot);
  const gitCommonDir = await getGitCommonDir(repoRoot);
  const axonHooksDir = path.join(gitCommonDir, 'axon-hooks');

  return {
    repoRoot,
    axonHooksDir,
    axonHooksPath: axonHooksDir,
    currentHooksPath,
    usesHusky: detectHusky({ repoRoot, gitCommonDir, currentHooksPath }),
  };
};

const detectHusky = ({
  repoRoot,
  gitCommonDir,
  currentHooksPath,
}: {
  repoRoot: string;
  gitCommonDir: string;
  currentHooksPath: string | null;
}) => {
  if (currentHooksPath === HUSKY_HOOKS_PATH) return true;
  if (fs.existsSync(path.join(repoRoot, '.husky'))) return true;

  const mainWorktree = path.basename(gitCommonDir) === '.git' ? path.dirname(gitCommonDir) : null;
  return mainWorktree !== null && fs.existsSync(path.join(mainWorktree, HUSKY_HOOKS_PATH));
};

const getLocalHooksPath = async (repoRoot: string) => {
  try {
    const { stdout } = await execa('git', ['config', '--local', '--get', 'core.hooksPath'], {
      cwd: repoRoot,
    });

    return stdout.trim() || null;
  } catch {
    return null;
  }
};

const setLocalHooksPath = async ({
  repoRoot,
  hooksPath,
}: {
  repoRoot: string;
  hooksPath: string;
}) => {
  await execa('git', ['config', '--local', 'core.hooksPath', hooksPath], {
    cwd: repoRoot,
  });
};

const unsetLocalHooksPath = async (repoRoot: string) => {
  try {
    await execa('git', ['config', '--local', '--unset', 'core.hooksPath'], {
      cwd: repoRoot,
    });
  } catch {
    return;
  }
};

const ensureAxonHooksDir = (axonHooksDir: string) => {
  fs.mkdirSync(axonHooksDir, { recursive: true });
};

const isHookInstalled = ({
  hooksDir,
  hookFile,
  hookId,
}: {
  hooksDir: string | null;
  hookFile: string;
  hookId: string;
}) => {
  if (hooksDir === null) return false;

  const filePath = path.resolve(hooksDir, hookFile);
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const { start } = getHookMarkers(hookId);
  return content.includes(start);
};

const getInstalledHookIdsForFile = ({
  hooksDir,
  hookFile,
}: {
  hooksDir: string;
  hookFile: string;
}) =>
  HOOKS.filter((hook) =>
    isHookInstalled({
      hooksDir,
      hookFile,
      hookId: hook.id,
    }),
  ).map((hook) => hook.id);

const HOOK_START_MARKER = /^# AXON_START: (.+)$/gm;

const getObsoleteHookBlocks = (axonHooksDir: string) => {
  if (!fs.existsSync(axonHooksDir)) return [];

  const catalogIds = new Set(HOOKS.map((hook) => hook.id));

  return fs
    .readdirSync(axonHooksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const content = fs.readFileSync(path.join(axonHooksDir, entry.name), 'utf8');
      const ids = [...content.matchAll(HOOK_START_MARKER)]
        .map((match) => match[1].trim())
        .filter((id) => !catalogIds.has(id));
      return { hookFile: entry.name, ids };
    })
    .filter(({ ids }) => ids.length > 0);
};

const syncHookFile = ({
  catalog,
  axonHooksDir,
  usesHusky,
  hookFile,
  nextHookIds,
}: {
  axonHooksDir: string;
  usesHusky: boolean;
  hookFile: string;
  nextHookIds: string[];
  catalog: HookDefinition[];
}) => {
  const filePath = path.resolve(axonHooksDir, hookFile);
  const hookDefinitions = catalog.filter(
    (hook) => hook.hookFile === hookFile && nextHookIds.includes(hook.id),
  );

  if (hookDefinitions.length === 0) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  ensureAxonHooksDir(axonHooksDir);

  const wrapper = buildHookWrapper({
    hookFile,
    hookDefinitions,
    usesHusky,
  });

  fs.writeFileSync(filePath, wrapper, { mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
};

const reconcileLocalHooksPath = async ({
  repoRoot,
  axonHooksDir,
  axonHooksPath,
  currentHooksPath,
  usesHusky,
}: {
  repoRoot: string;
  axonHooksDir: string;
  axonHooksPath: string;
  currentHooksPath: string | null;
  usesHusky: boolean;
}) => {
  if (hasRemainingAxonHooks(axonHooksDir)) {
    if (currentHooksPath !== axonHooksPath) {
      await setLocalHooksPath({
        repoRoot,
        hooksPath: axonHooksPath,
      });
    }
    return;
  }

  if (usesHusky) {
    if (currentHooksPath !== HUSKY_HOOKS_PATH) {
      await setLocalHooksPath({
        repoRoot,
        hooksPath: HUSKY_HOOKS_PATH,
      });
    }
    return;
  }

  if (currentHooksPath !== null) {
    await unsetLocalHooksPath(repoRoot);
  }
};

const hasRemainingAxonHooks = (axonHooksDir: string) => {
  if (!fs.existsSync(axonHooksDir)) return false;

  return fs.readdirSync(axonHooksDir, { withFileTypes: true }).some((entry) => entry.isFile());
};

const buildHookWrapper = ({
  hookFile,
  hookDefinitions,
  usesHusky,
}: {
  hookFile: string;
  hookDefinitions: HookDefinition[];
  usesHusky: boolean;
}) => {
  const sections = ['#!/usr/bin/env sh'];

  if (usesHusky) {
    sections.push(
      `if [ -x ".husky/_/${hookFile}" ]; then\n  ".husky/_/${hookFile}" "$@" || exit $?\nfi`,
    );
  }

  sections.push(
    hookDefinitions
      .map((hook) =>
        wrapScript({
          id: hook.id,
          script: hook.script,
        }).trim(),
      )
      .join('\n\n'),
  );

  return `${sections.join('\n\n')}\n`;
};
