# Per-project workflow config plan

Axon assumes one git workflow everywhere, gitflow: `develop` → `release/*` → `main`. The Classified project moved to a different one:

- Every ticket gets one branch from `main` and one MR into `main`.
- A bot assembles `develop` (staging) from `main` plus the MRs labelled `staging`.
- Merges are rebase-only, and the merge train ships to production.

This plan adds a private config file per project. Each command then follows that project's flow. Projects without a config keep today's behavior unchanged.

Sources for the Classified rules, both on Confluence:

- _Development workflow: from branch to production_
- _How staging assembly works_

## How to use this plan

- **Work one phase at a time, in order.** Don't start a phase until the previous one meets its **Done when**.
- **This is a personal project with no MRs.** Each phase goes straight onto `main` as one or more conventional commits, such as `fix(hooks): ...`, `feat(config): ...` or `feat(sync): ...`.
  - Every commit must leave every command working for `gitflow` repos and for repos with no config.
- **Loop for each phase:**
  1. Implement it.
  2. Review it.
  3. Fix the findings.
  4. Re-review.
  5. Commit.
- **Tick the `[ ]` boxes** as tasks land.
- **Checks that must pass before a commit:**
  - `yarn test:run`
  - `yarn lint`
  - `yarn knip`
  - `yarn build`
- **Repo rules (from `AGENTS.md`):**
  - Imports use `@/` and keep their `.js` specifiers.
  - Long-running work shows progress.
  - Cancellation exits cleanly.
  - Errors tell the user what to do.
- **Where things are:** the phases hold the rules. [Reference](#reference) explains why.

## Terms

| Term                 | Meaning                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow                 | The workflow a project follows. `gitflow` is today's behavior. `classified` is the one-MR-into-`main` flow.                                                                                                                                                                                                                                       |
| Project config       | `~/.axon/projects/<slug>.json`. It is private and never committed to the project repo.                                                                                                                                                                                                                                                            |
| Global config        | `~/.axon/config.json` as it is today. Every key in it is a default that a project config can override.                                                                                                                                                                                                                                            |
| `ProjectContext`     | The merged, validated config for the current repo. It is resolved once per run and passed into flows.                                                                                                                                                                                                                                             |
| Remote key           | The normalized `origin` URL, `<host>/<path>` with no scheme, user, port or `.git`. For example, `gitlab.com/letgo-turkey/classifieds/frontends/pwa/classified`.                                                                                                                                                                                   |
| Develop commit       | A commit on the branch that `origin/<main>` doesn't have, and that is either reachable from `origin/<develop>` or carries a `Staging-MR:` trailer                                                                                                                                                                                                 |
| Fixup commit         | A commit whose subject starts with `fixup! `, `squash! ` or `amend! `                                                                                                                                                                                                                                                                             |
| Foreign commit       | A commit in `origin/<main>..<branch>` whose author email isn't `git config user.email`                                                                                                                                                                                                                                                            |
| Ancestry parent      | For a branch B, a remote head H (not `main`/`develop`, not B itself) where H is in `origin/<main>..B`. The nearest parent is the candidate that every other candidate is an ancestor of. If no candidate fits, the ancestry is ambiguous. The test is a set lookup: build `git rev-list origin/<main>..B` once, then check each head's SHA in it. |
| Approved             | The MR has at least one approval (`approved_by` is not empty). Any push resets approvals.                                                                                                                                                                                                                                                         |
| Autosquash in place  | `GIT_EDITOR=: git -c sequence.editor=: rebase -i --autosquash <base>`, where `<base>` doesn't move the branch onto a newer `main`                                                                                                                                                                                                                 |
| `<main>`/`<develop>` | The branch names from the project config. The defaults are `main` and `develop`.                                                                                                                                                                                                                                                                  |

## Current code

| Area              | Files                                                                                                     | Workflow assumptions today                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config            | `src/infra/store/configStore.ts`, `src/infra/config/configManager.ts`, `src/infra/store/keyStore.ts`      | <ul><li>Flat global JSON: `mode`, `jiraCloudUrl`, `jiraJql`, `jiraEmail`, `aiModel`.</li><li>A corrupt file silently falls back to defaults.</li><li>`keys.json` is always in the home dir and ignores `AXON_CONFIG_DIR`.</li><li>Nothing is per-repo.</li></ul>                         |
| `feature`         | `src/domains/feature/feature.service.ts:20`, `flows/*`, `feature.constants.ts`, `feature.formatter.ts:15` | <ul><li>The base is `develop` if it exists on origin, otherwise `main`. **This is wrong for Classified, which has a `develop`.**</li><li>Branch names are `<type>/<KEY>-<slug>`.</li><li>The picker drops any status not in `STATUS_ORDER`.</li></ul>                                    |
| `release`         | `src/domains/release/*`                                                                                   | It cherry-picks from `develop` onto `release/<title>`, cut from `main`, and the MR URL targets `main`.                                                                                                                                                                                   |
| `commit-ai`       | `src/domains/ai/commit/*`, `src/domains/ai/ai.prompts.ts`                                                 | <ul><li>Branch-type inference covers only `feat\|fix\|refactor\|docs\|chore`. The formatter covers those plus `test\|perf`.</li><li>The optional push is a bare `git push`, which needs an upstream. `feature` never sets one.</li></ul>                                                 |
| `sb`              | `src/domains/branch/syncBranch.flow.ts`, `resolveSyncTarget.flow.ts`, `syncGuardrail.ts`                  | <ul><li>Auto-detect prefers the closest of `develop`, `main` and `master`.</li><li>The guardrail asks for a confirm on a feature branch onto `main`.</li></ul>                                                                                                                           |
| `sb --mine`       | `src/domains/branch/syncMine.flow.ts`, `syncStack.ts`, `src/domains/mr/glab.service.ts`                   | <ul><li>**It skips feature-branch-onto-`main` MRs as guardrail violations, so in Classified it skips every MR.**</li><li>Stacks are detected by "child target = parent source", which never happens when every MR targets `main`.</li><li>It rebases every MR that's behind.</li></ul>   |
| `hooks`           | `src/domains/hooks/hooks.constants.ts`, `hooks.flow.ts`                                                   | <ul><li>`block-amend` and `suggest-sync` only act on `release/*`.</li><li>`suggest-sync` points to the removed `axon sync`.</li><li>The Jira keys are baked in at install time.</li><li>The hooks dir is `path.join(repoRoot, '.git', ...)`, which breaks in linked worktrees.</li></ul> |
| Jira              | `src/domains/jira/jira.constants.ts`                                                                      | Project keys, `IN_PROGRESS_STATUS` and `JIRA_REGEX` are hardcoded.                                                                                                                                                                                                                       |
| MR URL            | `src/domains/mr/mr.service.ts:17-27`                                                                      | `isGitLabProject` uses `new URL(origin)`, so SSH remotes fail.                                                                                                                                                                                                                           |
| Branch type lists | `feature.constants.ts:1-16`, `inferFromBranch.ts`, `commitMessageFormatter.ts:3`, `ai.prompts.ts:20`      | Four lists that don't match                                                                                                                                                                                                                                                              |

`zod` (4.x) is already a dependency.

## Verified git behaviour (git 2.50)

These were tested in a scratch repo:

- `rebase --autosquash` without `-i` works on 2.44 and later. To keep one code path that also works on older git, use `GIT_EDITOR=: git -c sequence.editor=: rebase -i --autosquash ...`.
  - It folds in `fixup!`, `squash!` and `amend!`.
  - No `*!` subject is left behind.
  - `squash!` bodies are merged into the target's message.
- `git replay` doesn't autosquash. It replays fixup commits as they are.
- `git log --format='%(trailers:key=Staging-MR,valueonly)'` prints the trailer value, or an empty line when there isn't one.
- `glab mr list --output json` returns the raw API objects, including `labels`, `has_conflicts` and `detailed_merge_status`. Approvals need `glab api projects/:id/merge_requests/:iid/approvals`.

---

## Phase 0 - Bugfixes first

**Goal:** fix the bugs found by the audit before any config work, so the config diffs stay about config.

- [x] **Hooks in worktrees:** build the hooks dir from `git rev-parse --git-common-dir` and set `core.hooksPath` to that absolute path.
  - Migration: if the stored relative `.git/axon-hooks` path exists, rewrite it.
  - Test from a linked worktree.
- [x] **Remove `suggest-sync`.** `hooks.flow` removes installed blocks whose id isn't in the catalog any more, and reports `removed (obsolete)`.
- [x] **One remote parser:** `src/infra/git/remote.ts` exports `parseRemote(url) → { host, path } | null`.
  - It handles `https://`, `ssh://`, scp-style `git@host:path` and a trailing `.git`.
  - `isGitLabProject` uses it.
  - Phase 1 reuses it for the remote key.
- [x] **One branch type list:** `BRANCH_TYPES` in `src/domains/branch/branch.constants.ts`. `feature`, `inferFromBranch`, `commitMessageFormatter` and `ai.prompts` all read it.
  - `hotfix` and `security` map to the commit type `fix`.
- [x] **`keyStore` honors `AXON_CONFIG_DIR`.**
- [x] **README:** drop the "Backport Bracnh Flows" line.

**Done when:**

- [x] Each fix has a test.
- [x] The checks pass.

## Phase 1 - Config infrastructure and `axon init`

**Goal:** every run resolves a `ProjectContext`. With no project config it matches today's behavior exactly.

### 1a. Identity and file

- [x] Project id:
  - If `git config --get axon.project` is set, use that name.
  - Otherwise use the remote key of `origin`.
  - With no `origin` or no repo, there is no project, and the context comes from global config only.
- [x] File: `~/.axon/projects/<slug>.json`, or under `$AXON_CONFIG_DIR/projects/`.
  - Build the slug from the id by replacing `/` with `__` and dropping anything outside `[A-Za-z0-9._-]`.

### 1b. Schema (`src/domains/project/project.schema.ts`, zod)

```json
{
  "version": 1,
  "flow": "classified",
  "classified": {
    "mainBranch": "main",
    "developBranch": "develop",
    "qaPassedLabel": "qa::passed"
  },
  "branchTemplate": "{type}/{key}-{slug}",
  "jira": {
    "projectKeys": ["PRD", "FE"],
    "inProgressStatus": "In Progress",
    "statusOrder": ["Blocked", "In Progress", "In Review", "To Do", "Done"],
    "jql": "..."
  },
  "mode": "jira",
  "aiModel": null
}
```

- [x] Use a discriminated union on `flow`:
  - `gitflow` takes `{ mainBranch, developBranch, releasePrefix }` with the defaults `main`, `develop` and `release/`.
  - `classified` takes the block shown above.
- [x] Every other key is optional and falls back to global config, then to today's constants.
- [x] `branchTemplate` must contain `{key}`, and may contain `{type}` and `{slug}`.
- [x] `version` must be `1`. An unknown version is an error that names the version axon supports.
- [x] A bad file throws `ProjectConfigError`, listing each problem as `<path>: <key>: <expected>, got <actual>`.
  - `cli.ts` prints it and exits 1.
  - It never falls back silently.

### 1c. Resolution (`src/domains/project/project.service.ts`)

- [x] `resolveProjectContext()` merges the sources in this order: env (`AXON_AI_MODEL`), then project, then global, then defaults. It returns:

  ```ts
  { id, configPath, source: 'project' | 'global', flow, branchTemplate, jira, mode, aiModel }
  ```

- [x] Resolve it once in a commander `preAction` hook, memoize it, and expose `getProjectContext()` to the command handlers.
  - Handlers pass it into flows as a parameter. Domains never read config files directly.
  - Commands that don't need a repo (`config`, `ai-model`) must still work outside a git repo.
- [x] Route the current readers through the context:
  - `getCliModeConfig`
  - the Jira JQL, URL and email getters
  - the AI model resolution
- [x] **Flow banner:** `feature`, `release`, `sb`, `commit-ai` and `hooks` print one dim line before they start, such as `flow: classified · ~/.axon/projects/…json`.
  - With no project config, the line is `flow: gitflow (default) · run axon init to configure this repo`.

### 1d. `axon init`

- [x] It reads `origin` and shows the remote key.
- [x] It suggests a flow: `classified` when the remote path ends in `letgo-turkey/classifieds/frontends/pwa/classified`, otherwise `gitflow`. The user confirms or changes it.
- [x] It asks for:
  - the branch names, with the flow defaults prefilled
  - the branch template
  - the Jira keys, JQL and mode, prefilled from global config
- [x] If a file already exists, init prefills from it, so a re-run is the edit flow.
- [x] It writes the file with 2-space indentation and prints the path, plus a note that the file can be edited by hand.
- [x] Cancelling a prompt writes nothing and exits cleanly.

### 1e. `axon mode`

- [x] If a project config exists, `axon mode` writes to it. Otherwise it writes to global config.
- [x] It prints which file it wrote.

### 1f. Tests

- [x] Remote parsing for each URL form.
- [x] Slugging.
- [x] The `axon.project` override.
- [x] Merge precedence.
- [x] Each validation error message.
- [x] No-config parity: resolution with no project config gives today's values.
- [x] `init` writes the expected file, re-runs prefilled, and writes nothing on cancel.

**Done when:**

- [x] Every existing test passes unchanged.
- [x] `axon init` works in a scratch repo.

## Phase 2 - `feature`, `release`, `hooks`, Jira

**Goal:** the non-sync commands follow the flow.

### 2a. Branch template (`src/domains/branch/branchTemplate.ts`)

- [x] `buildBranchName(template, { type, key, slug })`:
  - With an empty slug, drop `{slug}` and the separator in front of it.
- [x] `parseBranchName(template, name) → { type?, key?, slug? } | null`:
  - It compiles the template into a regex, where `{type}` is one of `BRANCH_TYPES`, `{key}` matches the project keys, and `{slug}` is `[a-z0-9-]+`.
- [x] `feature` builds names with `buildBranchName`.
- [x] `inferFromBranch` and `resolveCommitContext` parse names with `parseBranchName`.
  - When the template has no `{type}`, the type comes from the AI only.

### 2b. `feature`

- [x] `classified`: the base is always `<main>`, with no `develop` probe.
- [x] `gitflow`: unchanged. The base is `<develop>` if it exists on origin, otherwise `<main>`.

### 2c. `release`

- [x] `classified`: exit 1 with `axon release isn't used in the classified flow. MRs ship to main via the merge train.`
- [x] `gitflow`: use `mainBranch`, `developBranch` and `releasePrefix` from the context instead of literals.

### 2d. `hooks`

- [x] Each `HookDefinition` gets `flows: Flow[]`.
  - `block-amend` is gitflow only, and `warn-jira-mismatch` is both.
  - The `release/` checks in the scripts use `releasePrefix`.
- [x] The picker offers only the hooks for the current flow.
  - If a hook from another flow is installed, offer to remove it.
- [x] `warn-jira-mismatch` bakes in the project's keys.
  - `hooks` prints `re-run axon hooks after changing jira.projectKeys`.

### 2e. Jira

- [x] Build `JIRA_REGEX` from `jira.projectKeys` through a function that takes the context. Remove the module constant.
- [x] `inProgressStatus` and `statusOrder` come from the context.
- [x] The picker puts any status that isn't listed into an `Other` group at the end, instead of dropping it.

### 2f. Tests

- [x] Template build and parse, including an empty slug and a template with no `{type}`.
- [x] `feature` base for each flow, including classified when `develop` exists.
- [x] `release` refusal under classified.
- [x] Hook catalog filtering and the offer to remove hooks from another flow.
- [x] The Jira `Other` group.
- [x] Custom project keys in both the regex and the hook script.

**Done when:**

- [x] In a classified scratch repo that has `develop`, `axon feature` branches from `origin/main`.
- [x] `axon release` refuses.
- [x] `axon hooks` offers only `warn-jira-mismatch`.

## Phase 3 - Plain `sb` under classified

**Goal:** `axon sb` can never produce a branch that Danger fails, and it never targets `develop`. Everything in this phase applies to `classified` only, and `gitflow` is unchanged.

### 3a. Target

- [ ] **With an explicit argument:** use it. If it's `<develop>`, refuse and exit 1 with `Classified MRs never sync onto develop. Use axon sb (onto main) or a teammate's branch.`
- [ ] **Auto-detect:**
  1. If the current branch has an ancestry parent among `refs/remotes/origin/*`, offer it as the default, with the reason `contains <branch> head`.
     - Get the candidates with `git for-each-ref --merged HEAD --no-merged origin/<main> refs/remotes/origin`, excluding `<main>`, `<develop>` and `origin/<current>`.
     - The fetch has already run with `--prune`, so these refs are current.
     - If the ancestry is ambiguous, offer `<main>` and warn which branches are in the history.
  2. Otherwise offer `<main>`.
- [ ] Best effort: when `glab` is authenticated and an MR exists for the branch, look up its target with `glab mr view <branch> -F json`.
  - If the target is `<develop>`, refuse with `Retarget !<iid> to main in GitLab`.
  - If glab isn't available, skip this check silently.
- [ ] Remove the release and feature-onto-main confirms under classified. Keep `findSyncGuardrail` for gitflow only.

### 3b. Pre-rebase checks (`src/domains/branch/classifiedGuards.ts`)

- [ ] **Develop commits:** list `origin/<main>..HEAD` with the `Staging-MR` trailer. Also intersect it with `origin/<main>..origin/<develop>`.
  - If either finds a commit, refuse and exit 1. Print the commits and the fix:
    1. `git rebase -i origin/main`
    2. Drop the listed commits.
    3. `axon sb`
- [ ] **Foreign commits** when the target is `<main>`: warn and confirm (`N commits by other authors will be rebased onto main - is this branch based on a teammate's?`).
  - If the user declines, exit 0.

### 3c. Rebase

- [ ] Always autosquash: `GIT_EDITOR=: git -c sequence.editor=: rebase -i --autosquash --fork-point origin/<target>`.
  - Keep the existing fallback to an interactive rebase when it fails.
- [ ] Merge commits are dropped by the rebase, since axon never uses `--rebase-merges`. Add a test that proves it.
- [ ] After the rebase, check that no fixup commit and no merge commit is left in `origin/<target>..HEAD` before pushing.
  - If one is, stop without pushing and explain.
- [ ] The push is unchanged, using the explicit lease from the hardening plan.

### 3d. Tests (integration, temp repos)

- [ ] An explicit `develop` target is refused.
- [ ] An MR into `develop` is refused, with glab mocked.
- [ ] A branch carrying a commit with the `Staging-MR` trailer is refused, and so is a branch carrying a commit reachable from `origin/develop`.
- [ ] Fixup, squash and amend commits are folded in, and the result is pushed.
- [ ] A branch built on a teammate's branch auto-detects that branch.
- [ ] A teammate's commit rebased onto `main` needs a confirm.
- [ ] A merge commit is gone after `sb`.

**Done when:** every scenario above passes, and the gitflow `sb` tests are unchanged.

## Phase 4 - `sb --mine` under classified

**Goal:**

- `--mine` keeps pre-approval MRs current with `main`.
- It never resets approvals or QA without being asked.
- It handles stacks built from teammates' branches.

Everything in this phase applies to `classified` only.

### 4a. CLI

- [ ] `--all`: rebase approved MRs too.
- [ ] `--include-qa`: also rebase MRs that carry `qaPassedLabel`.
- [ ] Under gitflow, both flags are accepted with the note `has no effect in the gitflow flow`.

### 4b. Listing and filters

- [ ] Add `labels` to `MyMergeRequest` from the existing list payload.
- [ ] Replace `findSyncGuardrail` with a classified filter:
  - If the target is `<develop>`, skip with `skipped (targets develop - retarget to main)`.
  - Every other target is allowed.
- [ ] If an MR has develop commits (the same check as 3b, run on `origin/<src>`), skip it with `skipped (develop commits)` and the 3b hint.

### 4c. Stacks by ancestry (`syncStack.ts`)

- [ ] Get every head with one `git ls-remote --heads origin`, without fetching objects.
- [ ] For each MR, find its ancestry parent among those heads, ignoring any head whose object isn't local.
  - **The parent is another listed MR:** it's a stack edge. The child is rebased onto the parent's new head, and they're pushed atomically, as today.
  - **The parent is someone else's branch:** fetch that ref and rebase the child onto `origin/<their-branch>`. It's never pushed.
  - **Ambiguous:** skip with `skipped (ambiguous base: <branches>)`.
- [ ] Foreign commits with no parent found: skip with `skipped (contains others' commits - run axon sb in that branch)`.
  - This covers a teammate who force-pushed, so the old head isn't visible any more.
- [ ] Keep the existing target-equals-source edges for gitflow.

### 4d. Policy (Q17b, Q19, Q24)

For each MR, after the up-to-date check:

1. If it's up to date with no fixup commits, mark it `up-to-date`, as today.
2. If it carries `qaPassedLabel` and `--include-qa` wasn't given, skip it with `skipped (qa passed)`.
3. If `--all` wasn't given, fetch its approvals. Only fetch them for MRs that would otherwise be rebased, and keep that inside `--concurrency`.
   - If the MR is approved, do a trial `git replay` onto the base, then:
     - Clean: `skipped (approved - no conflict)`.
     - Conflict: `failed (conflict - rebase manually, approvals will reset)`.
   - If the approvals call fails, treat the MR as approved and add `(approvals unknown)`.
4. Otherwise rebase.
   - With fixup commits in `<fp>..origin/<src>`, use the worktree engine with autosquash: `GIT_EDITOR=: git -c sequence.editor=: rebase -i --autosquash --onto <base> <fp>`.
   - Without them, use `git replay` first, as today.
5. Summary: add a column `staging` that is `yes` when `refs/staging/<iid>` exists.
   - Get it with one `git ls-remote origin 'refs/staging/*'`. It's informational only.

A parent that's skipped by the policy counts as "not rebased". Its children rebase onto its current `origin/<src>`, which is unchanged.

### 4e. Tests

- [ ] A develop-target MR is skipped.
- [ ] An MR with develop commits is skipped.
- [ ] A `qa::passed` MR is skipped, and rebased with `--include-qa`.
- [ ] An approved MR with no conflict is skipped, an approved MR with a conflict fails with the hint, and `--all` rebases it.
- [ ] A failed approvals call counts as approved.
- [ ] An MR with fixup commits uses the worktree engine and pushes without any `*!` subject.
- [ ] Ancestry stacks:
  - [ ] My parent MR forms a stack.
  - [ ] A teammate's parent branch rebases onto that branch.
  - [ ] An ambiguous parent is skipped.
  - [ ] Foreign commits with no parent are skipped.
- [ ] Gitflow `--mine` behavior is unchanged.

**Done when:** all of the above pass, and the integration-test summary output has been reviewed by hand.

## Phase 5 - `commit-ai` fixups and push

**Goal:** QA and review fixes go into the commit they belong to, and pushing works without an upstream.

- [ ] Classified, when `origin/<main>..HEAD` has non-fixup commits: the first prompt is `New commit` or `Fix up an existing commit`.
- [ ] **Fix up:**
  1. Pick a commit from `origin/<main>..HEAD`. Fixup commits aren't listed.
  2. Run `git commit --fixup=<sha>`. There's no AI call.
  3. Ask `Squash into <subject> and push now?`.
     - **Yes:** autosquash in place with base `<sha>^`, so the branch isn't moved onto a newer `main`.
       - On failure, run `rebase --abort`, keep the fixup commit, and print `run axon sb to squash and rebase`.
       - Then push.
     - **No:** stop. The next `axon sb` folds the fixup in, per Q16.
- [ ] **Push, for both flows:** replace the bare `git push` with the explicit lease push from `sb`, `origin HEAD:refs/heads/<b>`.
  - First check that origin isn't ahead, as in `sb` 1b. If it is, refuse with the pull hint.
  - A branch that was never pushed gets an empty-SHA lease.
- [ ] **Tests:**
  - [ ] The fixup prompt appears only under classified, and only when there are commits.
  - [ ] Fix up, squash and push leaves a single commit with an unchanged base.
  - [ ] A squash failure keeps the fixup commit.
  - [ ] Push without an upstream works.
  - [ ] Push when origin is ahead is refused.

**Done when:**

- [ ] All of the above pass.
- [ ] The README documents `init`, the flows, `--all` and `--include-qa`.

---

## Reference

### Decisions

| #   | Topic                       | Decision                                                                                                                                                                                                                                                            |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Config location             | User-local and private: `~/.axon/projects/<slug>.json`. Never committed to project repos.                                                                                                                                                                           |
| Q2  | Config model                | A preset (`flow`) plus a typed block per preset, as a discriminated union                                                                                                                                                                                           |
| Q3  | Flows                       | Two presets, `gitflow` and `classified`, with the union open to more                                                                                                                                                                                                |
| Q4  | No config                   | Gitflow, plus an init hint. Auto-detection is only a suggestion inside `init`.                                                                                                                                                                                      |
| Q5  | Global settings             | Layered: env, then project, then global, then defaults                                                                                                                                                                                                              |
| Q6  | `axon mode`                 | A project-overridable key. The command writes to the project file when one exists.                                                                                                                                                                                  |
| Q7  | Scope                       | Adapt the existing commands now. Classified-specific helpers come later.                                                                                                                                                                                            |
| Q8  | Editing                     | `axon init` plus hand-editing, validated by a schema with errors that name the path and key                                                                                                                                                                         |
| Q9  | Repo identity               | The normalized `origin` URL, overridden by `git config axon.project`                                                                                                                                                                                                |
| Q10 | Layout                      | One file per project                                                                                                                                                                                                                                                |
| Q11 | Resolution                  | Once per run, into a `ProjectContext` that's passed into flows                                                                                                                                                                                                      |
| Q12 | Branch names                | A template per project. The default is `{type}/{key}-{slug}`.                                                                                                                                                                                                       |
| Q13 | `release` under classified  | Refuses with an explanation                                                                                                                                                                                                                                         |
| Q14 | `sb` target                 | The ancestry parent or `main`. `develop` is refused. An explicit teammate branch is allowed. No feature-onto-`main` confirm.                                                                                                                                        |
| Q15 | Develop commits             | Refuse and print the fix commands. Never drop commits automatically.                                                                                                                                                                                                |
| Q16 | Fixup commits in `sb`       | Always autosquash under classified                                                                                                                                                                                                                                  |
| Q17 | `--mine` policy (revised)   | <ul><li>MRs that are behind get rebased.</li><li>Approved MRs only get a conflict check. A rebase of one of them needs a manual `sb`, or `--all`.</li><li>The doc says to rebase when `main` moves, and a push resets 3 approvals plus a Release Manager.</li></ul> |
| Q18 | Classified stacks           | <ul><li>Detected by ancestry, using `ls-remote` heads.</li><li>A teammate parent means rebasing onto their branch.</li><li>An ambiguous base, or foreign commits with no parent, means a skip.</li></ul>                                                            |
| Q19 | `qa::passed`                | Skipped unless `--include-qa`                                                                                                                                                                                                                                       |
| Q20 | `commit-ai` rewrites        | A fixup commit for a picked commit, then autosquash. The push uses the explicit lease.                                                                                                                                                                              |
| Q21 | Hooks                       | The catalog is filtered by flow. No hooks that duplicate the Classified repo's own.                                                                                                                                                                                 |
| Q22 | Jira constants              | Keys, status order and in-progress name move into config. Statuses that aren't listed go into `Other`.                                                                                                                                                              |
| Q23 | Audit bugs                  | Fixed first, in Phase 0                                                                                                                                                                                                                                             |
| Q24 | Conflict detection          | A local trial `git replay`. The API fields can be stale.                                                                                                                                                                                                            |
| Q25 | Autosquash in `--mine`      | When fixup commits are present, use the worktree engine with `rebase -i --autosquash`                                                                                                                                                                               |
| Q26 | `commit-ai` squash and push | Autosquash in place on `<sha>^`, so the base doesn't move                                                                                                                                                                                                           |
| Q27 | Branch parsing              | Comes from the same template that builds the name                                                                                                                                                                                                                   |
| Q28 | "Post-QA"                   | The `qa::passed` label. "On staging" is only an informational column.                                                                                                                                                                                               |
| Q29 | Schema                      | As in 1b, with `version: 1`                                                                                                                                                                                                                                         |
| Q30 | `init` re-run               | Edit flow, prefilled with the current values                                                                                                                                                                                                                        |
| Q31 | Flow banner                 | One dim line on workflow commands                                                                                                                                                                                                                                   |
| Q32 | Remote name                 | Stays `origin`. Not configurable.                                                                                                                                                                                                                                   |
| Q33 | Tests                       | Unit tests for config and templates. Integration tests in temp repos for every classified rule.                                                                                                                                                                     |
| Q34 | Delivery                    | This doc, phases 0-5, conventional commits on `main`                                                                                                                                                                                                                |
| Q35 | Plain `sb` stacked          | The ancestry parent is the default target, and the prompt shows the reason                                                                                                                                                                                          |

Details decided while writing the plan:

- **For approved MRs, "rebase only on conflict" means "report the conflict".** `--mine` can't resolve conflicts, so a conflicting approved MR fails with a manual-rebase hint, and a clean one is skipped. The trial replay exists so the summary says which is which.
- **Stack detection under classified uses `ls-remote` heads, not the MR list.** A Scenario 3 parent is usually a teammate's MR, which isn't in "mine".
- **A foreign-commit check covers what ancestry misses.** If a teammate force-pushes, their old head disappears from `ls-remote`, but the child still carries their commits. Rebasing it onto `main` would publish diverged copies of their work.
- **The rebase command always uses `-c sequence.editor=:` with `GIT_EDITOR=:`.** That gives one autosquash path for all git versions, and `squash!` messages merge without opening an editor.
- **`commit-ai`'s push fix applies to gitflow too.** The bare push without an upstream was broken there as well.

### Classified rules and where axon enforces them

| Rule (Development workflow doc)                                               | Enforced by                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Branch from `main`, never `develop`                                           | `feature` (2b)                                           |
| Never merge or rebase `develop` into a branch                                 | `sb` target refusal (3a), develop-commit check (3b, 4b)  |
| Never open an MR into `develop`                                               | `sb` glab check (3a), `--mine` filter (4b)               |
| Never add `staging` yourself                                                  | axon never touches labels                                |
| No merge commits                                                              | rebase without `--rebase-merges`, post-rebase check (3c) |
| No `fixup!`/`squash!`/`amend!` commits                                        | autosquash (3c, 4d, Phase 5)                             |
| Fixes go into the commit they belong to, push with lease                      | `commit-ai` fixup (Phase 5), lease push                  |
| Rebase when `main` moves                                                      | `sb`, `--mine` (4d)                                      |
| Approvals and `qa::passed` must be on the final commits                       | `--mine` approved/QA skip (4d)                           |
| A Scenario 3 child carries its parent's commits and rebases onto their branch | ancestry target (3a, 4c)                                 |
| Release branches don't exist                                                  | `release` refusal (2c), hook filter (2d)                 |
