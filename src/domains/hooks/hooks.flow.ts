import { checkbox } from '@inquirer/prompts';
import c from 'ansi-colors';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

import {
  formatCodePane,
  getHookMarkers,
  type HookDefinition,
  HOOKS,
  wrapScript,
} from '@/domains/hooks/hooks.constants.js';

export const runHooksFlow = async () => {
  console.log(c.cyan.bold('\n  Axon Hook Manager'));
  console.log(c.dim('  Select hooks to install. Use arrows to preview code.\n'));

  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot();
  } catch (err) {
    console.log(c.red('❌ Not a git repository or git not found.'), err);
    return;
  }

  const context = await getHookContext(repoRoot);

  const installedIds = new Set(
    HOOKS.filter((hook) =>
      isHookInstalled({
        hooksDir: context.axonHooksDir,
        hookFile: hook.hookFile,
        hookId: hook.id,
      }),
    ).map((hook) => hook.id),
  );

  const choices = HOOKS.map((hook) => {
    const installed = installedIds.has(hook.id);

    return {
      name: installed ? `${hook.name} ${c.dim('(installed)')}` : hook.name,
      value: hook,
      checked: installed,
      description: `${c.white(hook.description)}\n${formatCodePane(hook.script)}`,
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

  const selectedIds = new Set(selectedHooks.map((hook) => hook.id));
  const toUninstall = HOOKS.filter(
    (hook) => installedIds.has(hook.id) && !selectedIds.has(hook.id),
  );
  const toInstall = selectedHooks.filter((hook) => !installedIds.has(hook.id));

  for (const hook of toUninstall) {
    syncHookFile({
      axonHooksDir: context.axonHooksDir,
      hasHuskyShim: context.hasHuskyShim,
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
      axonHooksDir: context.axonHooksDir,
      hasHuskyShim: context.hasHuskyShim,
      hookFile: hook.hookFile,
      nextHookIds,
    });
    console.log(`${c.green('✔')} Installed: ${c.bold(hook.name)}`);
  }

  await reconcileLocalHooksPath(context);

  console.log(c.cyan('\n  Done! Your repository hooks are synchronized.'));
};

const getRepoRoot = async () => {
  const { stdout } = await execa('git', ['rev-parse', '--show-toplevel']);
  return stdout.trim();
};

const getHookContext = async (repoRoot: string) => {
  const currentHooksPath = await getLocalHooksPath(repoRoot);
  const axonHooksPath = '.git/axon-hooks';
  const axonHooksDir = path.join(repoRoot, '.git', 'axon-hooks');

  return {
    repoRoot,
    axonHooksDir,
    axonHooksPath,
    currentHooksPath,
    hasHuskyShim: fs.existsSync(path.join(repoRoot, '.husky', '_')),
  };
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

const syncHookFile = ({
  axonHooksDir,
  hasHuskyShim,
  hookFile,
  nextHookIds,
}: {
  axonHooksDir: string;
  hasHuskyShim: boolean;
  hookFile: string;
  nextHookIds: string[];
}) => {
  const filePath = path.resolve(axonHooksDir, hookFile);
  const hookDefinitions = HOOKS.filter(
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
    hasHuskyShim,
  });

  fs.writeFileSync(filePath, wrapper, { mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
};

const reconcileLocalHooksPath = async ({
  repoRoot,
  axonHooksDir,
  axonHooksPath,
  currentHooksPath,
  hasHuskyShim,
}: {
  repoRoot: string;
  axonHooksDir: string;
  axonHooksPath: string;
  currentHooksPath: string | null;
  hasHuskyShim: boolean;
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

  if (hasHuskyShim) {
    if (currentHooksPath !== '.husky/_') {
      await setLocalHooksPath({
        repoRoot,
        hooksPath: '.husky/_',
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
  hasHuskyShim,
}: {
  hookFile: string;
  hookDefinitions: HookDefinition[];
  hasHuskyShim: boolean;
}) => {
  const sections = ['#!/usr/bin/env sh'];

  if (hasHuskyShim) {
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
