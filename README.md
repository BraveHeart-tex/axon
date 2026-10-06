# Axon - Personal Workflow Assistant

Axon is a command-line tool I built to automate my daily development workflows. It streamlines common Git operations, code reviews, branch management, and feature flag handling through AI-powered assistance.

> **Note**: I created this tool for my personal use to eliminate repetitive tasks and standardize my development workflow. Feel free to use it if you find it helpful!

## Features

- **AI-Powered Commit Messages**: Generate meaningful commit messages using AI based on your staged changes
- **Branch Management**: Create feature and release branches with proper naming conventions
- **Secure Configuration**: Store API keys securely using your system's credential

## Installation

### From Source

1. Clone the repository:

```bash
git clone https://github.com/BraveHeart-tex/axon
cd axon
```

2. Install dependencies:

```bash
yarn install
```

3. Build the project:

```bash
yarn run build
```

4. Link the CLI globally (optional):

```bash
yarn link
```

#Under classified, `--mine` skips QA-passed MRs (by default, `qa::passed`) and
checks approved MRs for conflicts without rebasing them. `--all` allows rebasing
approved MRs; `--include-qa` allows rebasing QA-passed MRs. Use both to include
MRs with both protections. Pushing rewritten commits resets approvals. Develop
targets, develop commits and unsafe ancestry are skipped with a reason. Staging
presence is informational. Under gitflow, `--all` and `--include-qa` have no effect.

## Development Mode

Run in development mode without building:

```bash
yarn run dev
```

## Configuration

Before using AI-powered features, configure your API key:

```bash
axon config
```

This will securely store your API key using your system's credential manager.

The same config command also manages saved Jira settings used by `axon feature`,
including the JQL query used to fetch selectable issues:

```bash
axon config
```

Set or inspect the default AI model:

```bash
axon ai-model --list
axon ai-model meta-llama/llama-4-scout-17b-16e-instruct
axon ai-model
```

For one-off tests, you can override the saved model with an environment variable:

```bash
AXON_AI_MODEL=qwen/qwen3-32b axon commit-ai
```

### Per-project workflow

Run `axon init` inside a repository to configure its workflow, branch names,
branch template and Jira settings. Re-run it to edit existing settings. Config
stays private in `~/.axon/projects/<slug>.json` (or under
`$AXON_CONFIG_DIR/projects/`); you can also edit the file by hand.

- `gitflow`: feature branches start from develop when available, otherwise main;
  release branches ship changes from develop to main.
- `classified`: feature branches start from the configured main branch; each MR
  targets main and ships through the merge train. Develop is assembled for
  staging. `axon release` is unavailable. `axon sb` autosquashes fixups and
  refuses develop commits and develop targets.

Without project config, Axon keeps the default gitflow behavior. Branch names
such as main and develop above follow your configured names. Project settings
override global defaults; `AXON_AI_MODEL` overrides the saved model.

## Usage

### Generate AI Commit Message

Create a meaningful commit message based on your staged changes:

```bash
axon commit-ai
```

Under classified, when the branch has non-fixup commits outside
`origin/<main>`, the first prompt offers **New commit** or **Fix up an existing
commit**. New commit generates an AI message for staged changes. Fix up lets you
pick a commit, then commits staged changes with `git commit --fixup=<sha>`
without calling AI or requiring an AI key.

The fixup flow asks **Squash into <subject> and push now?** Accepting autosquashes
on the selected commit's parent, keeping the branch's existing base, then pushes.
Declining keeps the fixup for `axon sb`. A failed squash aborts the rebase and
keeps the fixup; run `axon sb` to squash and rebase.

Both flows push explicitly to `origin HEAD:refs/heads/<branch>` with a lease,
even without an upstream. A new remote branch uses an empty-SHA lease. If origin
has commits missing locally, Axon refuses the push with a `git pull --rebase`
hint. The fixup flow checks this before rewriting history.

### Branch Management

#### Create Feature Branch

Create a new feature branch with proper naming:

```bash
axon feature
```

#### Create Release Branch

Create a new release branch:

```bash
axon release
```

#### Sync Branches

Rebase the current branch onto its target and push with `--force-with-lease`:

```bash
axon sb [target]
```

Rebase and push every open MR you authored or are assigned to:

```bash
axon sb --mine [-y] [--all] [--include-qa] [--concurrency <n>] [--keep-worktrees]
```

`--mine` never touches your worktree. It rebases in the background (up to `--concurrency` MRs at once, default 4), pushes stacked MRs together, and prints a summary. **Git hooks are skipped** for every git command it runs, including `pre-push`. `--keep-worktrees` keeps the fallback rebase worktrees under `.git/axon-sync/` for debugging.

Under classified, `--mine` skips QA-passed MRs (by default, `qa::passed`) and
checks approved MRs for conflicts without rebasing them. `--all` allows rebasing
approved MRs; `--include-qa` allows rebasing QA-passed MRs. Use both to include
MRs with both protections. Pushing rewritten commits resets approvals. Develop
targets, develop commits and unsafe ancestry are skipped with a reason. Staging
presence is informational. Under gitflow, `--all` and `--include-qa` have no effect.

## Development

### Scripts

- `yarn run dev` - Run in development mode
- `yarn run build` - Build the TypeScript project
- `yarn run format` - Format code with Prettier
- `yarn run lint` - Lint and fix code with ESLint

### Project Structure

```
src/
├── bin/
│   └── cli.ts              # Main CLI entry point
├── commands/               # Command implementations
│   ├── config.ts          # API key configuration
│   ├── feature.ts         # Feature branch creation
│   ├── release.ts         # Release branch creation
├── constants/             # Constants and prompts
│   ├── config.ts          # Configuration constants
│   ├── jira.ts            # JIRA-related constants
│   └── prompts.ts         # AI prompts
└── utils/                 # Utility functions
    ├── ai.ts              # AI service integration
    ├── config.ts          # Configuration management
    ├── git.ts             # Git operations
    ├── indexStore.ts      # Index storage utilities
    └── logger.ts          # Logging utilities
```

### Dependencies

- **AI Integration**: `@ai-sdk/groq`, `ai`
- **CLI Framework**: `commander`
- **User Interface**: `inquirer`, `ora`, `ansi-colors`
- **Git Operations**: `execa`
- **Security**: `keytar` (for secure credential storage)
- **Development**: TypeScript, ESLint, Prettier, Husky

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test them
4. Commit your changes: `git commit -m 'Add some amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## AI Models

Axon uses AI models for:

- Generating commit messages based on code changes
- Providing code review feedback
- Understanding context and providing relevant suggestions

The AI integration supports multiple providers and can be configured through the `config` command.
