import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

import {
  formatCodePane,
  getHookMarkers,
  HOOKS,
  wrapScript,
} from '@/domains/hooks/hooks.constants.js';

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

  const installedIds = new Set(
    HOOKS.filter((h) =>
      isHookInstalled({
        gitDir,
        hookFile: h.hookFile,
        hookId: h.id,
      }),
    ).map((h) => h.id),
  );

  const choices = HOOKS.map((h) => {
    const installed = installedIds.has(h.id);

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

  const selectedIds = selectedHooks.map((h) => h.id);

  const toUninstall = HOOKS.filter((h) => installedIds.has(h.id) && !selectedIds.includes(h.id));

  const toInstall = selectedHooks.filter((h) => !installedIds.has(h.id));

  for (const hook of toUninstall) {
    removeHook({
      gitDir,
      hookFile: hook.hookFile,
      hookId: hook.id,
    });
    console.log(`${chalk.red('✘')} Removed: ${chalk.bold(hook.name)}`);
  }

  for (const hook of toInstall) {
    const filePath = path.resolve(gitDir, hook.hookFile);
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';

    const wrapped = wrapScript({
      id: hook.id,
      script: hook.script,
    });

    const finalContent =
      existing.length > 0 ? `${existing.trim()}\n${wrapped}` : `#!/bin/bash\n${wrapped}`;

    fs.writeFileSync(filePath, finalContent, { mode: 0o755 });
    console.log(`${chalk.green('✔')} Installed: ${chalk.bold(hook.name)}`);
  }

  console.log(chalk.cyan('\n  Done! Your repository hooks are synchronized.'));
};

const isHookInstalled = ({
  gitDir,
  hookFile,
  hookId,
}: {
  gitDir: string;
  hookFile: string;
  hookId: string;
}): boolean => {
  const filePath = path.resolve(gitDir, hookFile);
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const { start } = getHookMarkers(hookId);
  return content.includes(start);
};

const removeHook = ({
  gitDir,
  hookFile,
  hookId,
}: {
  gitDir: string;
  hookFile: string;
  hookId: string;
}) => {
  const filePath = path.resolve(gitDir, hookFile);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const { start, end } = getHookMarkers(hookId);

  const regex = new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, 'g');
  const newContent = content.replace(regex, '').trim();

  if (newContent === '#!/bin/bash' || newContent === '') {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, newContent, { mode: 0o755 });
  }
};
