# Axon - Personal Workflow Assistant

Axon is a command-line tool I built to automate my daily development workflows. It streamlines common Git operations, code reviews, branch management, and feature flag handling through AI-powered assistance.

> **Note**: I created this tool for my personal use to eliminate repetitive tasks and standardize my development workflow. Feel free to use it if you find it helpful!

## Features

- **AI-Powered Commit Messages**: Generate meaningful commit messages using AI based on your staged changes
- **Branch Management**: Create feature and release branches with proper naming conventions
- **Backport Bracnh Flows**: Sync commits between main and develop branches
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

### Development Mode

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

## Usage

### Generate AI Commit Message

Create a meaningful commit message based on your staged changes:

```bash
axon commit-ai
```

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
