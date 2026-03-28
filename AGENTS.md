# AGENTS.md

## 1. Stack

| Area             | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| Runtime          | Node.js CLI application                                     |
| CLI framework    | Commander                                                   |
| Language         | TypeScript                                                  |
| TypeScript mode  | `strict: true`                                              |
| Module system    | ESM (`"type": "module"`)                                    |
| Styling          | None for UI layout; `ansi-colors` for terminal text styling |
| State management | None                                                        |
| Monorepo tooling | None                                                        |
| Build tooling    | `tsc` + `tsc-alias`                                         |
| Dev runner       | `tsx`                                                       |
| Linting          | ESLint + `typescript-eslint` + `simple-import-sort`         |
| Package manager  | Yarn 1                                                      |
| Path alias       | `@/*` -> `src/*`                                            |

## 2. Review Output Format

### First-pass schema

- One short paragraph summarizing the PR intent.
- Findings grouped by severity.
- Findings include file references and concise impact statements.
- A summary table appears at the end.

### Follow-up schema

- One short paragraph summarizing the delta since the previous review.
- Prior findings are re-audited.
- Each prior finding is labeled `Fixed`, `Partial`, or `Still open`.
- New findings are grouped by severity.
- A follow-up summary table appears at the end.

## 3. Severity Levels

| Level  | Meaning                                                                                               | Merge effect     |
| ------ | ----------------------------------------------------------------------------------------------------- | ---------------- |
| High   | Behavior, safety, or UX regressions that materially break command execution or operator trust         | Blocking         |
| Medium | Layering, error-handling, or consistency issues that should be corrected before relying on the change | Usually blocking |
| Low    | Minor maintainability or polish issues with limited immediate risk                                    | Non-blocking     |

- `High` covers incorrect side-effect placement, missing failure handling around git/network/file operations, broken cancellation or exit behavior, and major prompt/output UX regressions.
- `Medium` covers semantic misplacement between command, flow, service, writer, prompt, or infra layers, plus incomplete loading-state or spinner handling.
- `Low` covers naming drift, minor output inconsistencies, and review notes that improve clarity without changing behavior.

## 4. What to Check

### Architecture

- Command entrypoints in `src/bin` and `src/commands` stay thin and delegate work.
- Flows own end-to-end orchestration for a command path.
- Services own external side effects such as git, HTTP, AI SDK, config, credential, and filesystem operations.
- Prompt modules in `src/ui/prompts` stay focused on interaction and input collection.
- File writers stay isolated to file-generation responsibilities.
- Layers stay co-located and narrowly scoped rather than absorbing adjacent responsibilities.

### Data Fetching And Side Effects

- Git operations are centralized in `src/domains/git/git.service.ts`.
- Jira access is performed through `src/domains/jira/jira.service.ts`.
- AI generation is performed through `src/domains/ai/ai.service.ts`.
- Side effects do not occur during command registration or module import.
- Prompt helpers do not perform hidden network calls or shell operations.

### Error Handling And CLI UX

- User-facing flows handle failure states cleanly.
- Long-running operations provide spinners or clear progress feedback.
- Prompt cancellation and interrupt paths exit cleanly.
- Success and failure output stay legible and consistent in tone.
- Errors surface actionable messages rather than raw noisy traces unless a trace is genuinely useful.

### Performance

- Normal I/O hygiene is preserved for shell, network, and file operations.
- Repeated expensive git or network calls are justified by the flow.
- Work that can be deferred until after user confirmation is not performed too early.

### Exports And API Shape

- Named exports are the default project convention.
- Default exports are exceptions, mainly where toolchain config already uses them.

## 5. Codebase-Specific Rules

| Rule Area                    | Rule                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Command registration         | Raw command strings are used directly; there is no shared command-path constants layer.        |
| Branch and argument literals | Raw string branch names and command arguments are acceptable.                                  |
| Routing/navigation           | The project has no frontend routing layer; review focuses on command wiring and flow dispatch. |
| Naming                       | Semantic, descriptive filenames are preferred over rigid suffix-driven taxonomy alone.         |
| `*.flow.ts`                  | A flow file represents the orchestration path for a command or subflow.                        |
| `*.service.ts`               | A service file contains operational logic and side effects for a domain.                       |
| `*.writer.ts`                | A writer file is responsible for file-writing behavior only.                                   |
| Prompts                      | Prompt helpers live under `src/ui/prompts` and are interaction-focused.                        |
| Gotchas                      | No project-specific legacy traps or deprecated paths are currently documented.                 |
| UX bar                       | Prompt UX, loading states, cancellation, and terminal output quality are part of correctness.  |

## 6. File Path Rule

Application imports use the `@/` alias for `src/*` and keep `.js` specifiers in TypeScript source under the ESM setup.

Example from the codebase:

```ts
import {
  deleteCredential,
  listCredentials,
  setCredential,
  viewCredential,
} from '@/domains/config/config.service.js';
import {
  promptApiKey,
  promptConfigAction,
  promptCredentialName,
} from '@/ui/prompts/config.prompts.js';
```

## 7. Summary Table Schema

### First-pass variant

| Column   | Meaning                                   |
| -------- | ----------------------------------------- |
| Severity | `High`, `Medium`, or `Low`                |
| File     | File path for the finding                 |
| Issue    | Short finding title                       |
| Impact   | User, behavior, or maintainability impact |
| Status   | `Open`                                    |

### Follow-up variant

| Column            | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| File              | File path for the finding                         |
| Original issue    | Short title from the prior review                 |
| Previous severity | Severity from the prior review                    |
| Current status    | `Fixed`, `Partial`, or `Still open`               |
| Notes             | Short explanation of what changed or what remains |
