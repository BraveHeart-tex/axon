# `axon sb --mine` hardening plan

`axon sb --mine` rebases every open GitLab MR you own onto its target branch, then force-pushes it. This plan makes it safe (it never loses remote commits), consistent (the same rules and output every time), and fast (it skips work that isn't needed and runs in parallel). It also fixes the same data-loss bug in plain `axon sb`.

## How to use this plan

- **Work one phase at a time, in order.** Don't start a phase until the previous one meets its **Done when**.
- **This is a personal project with no MRs.** Each phase goes straight onto `main` as one or more conventional commits: `fix(sync): ...`, `feat(sync): ...`, `test(sync): ...`. Every commit must leave both `axon sb` and `axon sb --mine` working.
- **Loop for each phase:**
  1. Implement it.
  2. Review it.
  3. Fix the findings.
  4. Re-review.
  5. Commit.
- **Tick the `[ ]` boxes** as tasks land, so the next session knows where things stand.
- **Checks that must pass before a commit:**
  - `yarn test:run`
  - `yarn lint`
  - `yarn knip`
  - `yarn build`
- **Repo rules (from `AGENTS.md`):**
  - Imports use `@/` for `src/*` and keep `.js` specifiers (ESM).
  - Long-running work shows progress.
  - Ctrl+C and prompt cancellation exit cleanly.
  - Errors tell the user what to do.
- **Where things are:** the rules to follow are in the phases. The [Reference](#reference) section at the end explains why each rule exists.

## Terms

| Term                 | Meaning                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MR                   | A GitLab merge request in the repo where `axon` is being run (not this repo)                                                                                            |
| `<src>` / `<target>` | An MR's source branch and target branch                                                                                                                                 |
| Stacked MR           | An MR whose `<target>` is another listed MR's `<src>`. The other MR is its parent.                                                                                      |
| Local-only commits   | Commits on the local `<src>` that `origin/<src>` doesn't have, not counting rebased copies (`git rev-list --count --cherry-pick --right-only origin/<src>...<src>` > 0) |
| Lease                | `--force-with-lease=refs/heads/<b>:<sha>`: the push succeeds only if the remote branch is still at `<sha>`                                                              |
| Fork point           | `git merge-base --fork-point origin/<target> <branch>`: where the branch left its target, worked out from the reflog                                                    |
| `<gcd>`              | The output of `git rev-parse --git-common-dir`, the shared `.git` folder even inside a linked worktree                                                                  |

## Current code

| File                                                                                                                         | What it does today                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bin/cli.ts`                                                                                                             | Commander setup: `sync-branch` / `sb`, `--mine`, `-y/--yes`. A global `SIGINT` handler calls `process.exit(1)` immediately, and an `unhandledRejection` handler catches `ExitPromptError`. Both affect every command.                              |
| `src/commands/syncBranch.ts`                                                                                                 | Rejects `--mine` combined with a target, then calls `runSyncMineFlow` or `runSyncBranchFlow`                                                                                                                                                       |
| `src/domains/branch/syncMine.flow.ts`                                                                                        | Sequential loop: `checkoutOrCreateTrackingBranch`, then `performRebaseAndPush(..., { interactive: false })`. `checkoutBranch(original)` runs in a `finally`.                                                                                       |
| `src/domains/branch/syncBranch.flow.ts`                                                                                      | The single-branch flow and the shared `performRebaseAndPush`. It also holds the release guardrails: a `release/*` source onto a non-`main`/`master` target is unusual, and a non-release source onto `main`/`master` is unusual.                   |
| `src/domains/git/git.service.ts`                                                                                             | `execa` wrappers. `rebaseOntoRemoteBranch` runs `git rebase --fork-point origin/<target>`. `abortRebase` uses `reject: false`. `pushCurrentBranchWithLease` is a bare `git push --force-with-lease`. `isWorkingTreeDirty` ignores untracked files. |
| `src/domains/mr/glab.service.ts`                                                                                             | `listMyOpenMergeRequests` runs `glab mr list --assignee=@me --output json` (page size 30) and drops draft/WIP MRs                                                                                                                                  |
| `src/infra/logger.ts`                                                                                                        | `logger.info/success/warn/error`. `ora` is installed for spinners.                                                                                                                                                                                 |
| `tests/syncMineFlow.test.ts`, `tests/syncBranchFlow.test.ts`, `tests/syncBranchCommand.test.ts`, `tests/glabService.test.ts` | Vitest tests that mock `git.service`, `glab.service`, `@inquirer/prompts` and `logger` with `vi.mock`. Update them as the services change.                                                                                                         |

## Verified git behaviour (git 2.50)

These were tested against a bare origin in a scratch repo. Rely on them rather than retesting.

- **Plain `sb` loses remote commits (reproduced).** Your local `feat` is stale, and someone else pushed a commit to `origin/feat`. Plain `sb` runs `fetch`, then `rebase --fork-point origin/develop`, then a bare `push --force-with-lease`. The lease was just refreshed by the fetch, so it passes, and the other commit is removed from `origin/feat`.
- **`git replay` only prints updates for `refs/heads/*` tips.** A range that ends in `origin/<src>` or `refs/axon-sync/*` exits 0 but prints nothing.
  - Replay a temporary local branch instead: `git branch axon-sync/<iid> origin/<src>`.
  - The output is `update refs/heads/<tmp> <new-sha> <old-sha>`; the new SHA is field 3.
  - `replay` never updates refs itself. Delete the temporary branch when done.
- **`git replay` exits 1 with no output on a conflict.** Nothing needs aborting.
- **When there's no fork point,** `git merge-base --fork-point` exits non-zero. Fall back to `git merge-base origin/<target> <branch>`.
- **Push result lines:** `git push --porcelain` prints `<flag>\t<from>:<to>\t<summary>` for each ref. The flags mean:
  - `+`: a forced update
  - `=`: `[up to date]`
  - `!`: rejected, with `(stale info)` for a lease failure or `(atomic push failed)` for a sibling in an atomic group
  - The exit code is 1 if any ref was rejected.
- **Retrying a push is safe.** If the first push landed, rerunning it with the same lease prints `=` and exits 0.
- **A push updates the local `refs/remotes/origin/<src>` and its reflog.** So a stacked child's fork point still works after its parent is pushed.
- **A worktree inside `.git` works.** `git worktree add --detach <gcd>/axon-sync/<iid> origin/<src>` works, and the main worktree's `git status` stays clean.
- **`--force-with-lease=refs/heads/<b>:`** with an empty SHA means "the branch must not exist on the remote yet".

---

## Phase 1 - Stop losing commits

**Goal:** neither `sb` nor `sb --mine` can overwrite remote commits, and Ctrl+C or a failed rebase never leaves the repo broken. `--mine` stays sequential and still runs in your worktree.

### 1a. `sb --mine` rebases the remote branch, not the local one

For each MR, in order:

- [x] `git checkout --detach origin/<src>`
- [x] If a local `<src>` exists and has local-only commits, mark the MR `skipped (local-only commits)`, leave the branch alone, and move to the next MR.
- [x] `git rebase --fork-point origin/<target>`, with no interactive fallback.
- [x] If the rebase fails, run `git rebase --abort` with `reject: true`, and mark the MR `failed (conflict)`.
  - If the abort itself fails, stop the whole run. Mark the remaining MRs `not run`, print `git rebase --abort && git checkout <original>`, and exit 1.
- [x] Push with `git push --force-with-lease=refs/heads/<src>:<origin sha before rebase> origin HEAD:refs/heads/<src>`.
- [x] Update the local branch:
  - If a local `<src>` exists and isn't checked out in any worktree (`git worktree list --porcelain`), run `git update-ref refs/heads/<src> <new> <old-local>`.
  - If it is checked out, print `git reset --keep origin/<src>` as a hint instead.
  - Never create local branches. Remove the use of `checkoutOrCreateTrackingBranch`.
- [x] After the loop, check out the original branch. If that fails, still print the summary, followed by the error and the recovery command.

### 1b. Plain `sb` refuses to overwrite

In `syncBranch.flow.ts`, after the fetch and before the rebase:

- [x] If `origin/<current>` exists and `git rev-list --count <current>..origin/<current>` is greater than 0, stop with `origin/<current> has N commit(s) you don't have locally. Run git pull --rebase first.` and exit 1.
- [x] Record the SHA of `origin/<current>` before the rebase. Push with `git push --force-with-lease=refs/heads/<current>:<sha> origin HEAD:refs/heads/<current>`.
  - A branch that was never pushed uses `--force-with-lease=refs/heads/<current>:`.
- [x] Keep the interactive-rebase fallback unchanged.

### 1c. Ctrl+C and prompt cancel

- [x] Add a cancellation registry in `src/infra/` where a flow registers an async cleanup. It owns an `AbortController`, and its signal is passed as `cancelSignal` to `execa` git calls.
- [x] Change the `cli.ts` SIGINT handler:
  - With no cleanup registered, exit immediately as today, so other commands are unchanged.
  - With one registered, the first Ctrl+C runs the cleanup, prints a partial summary with `interrupted` rows, and exits 130. A second Ctrl+C exits immediately.
- [x] `--mine` cleanup runs `git rebase --abort` if a rebase is in progress, then checks out the original branch. Git may already have died from the same SIGINT, because it shares the terminal's process group.
- [x] In `runSyncMineFlow`, catch `error.name === 'ExitPromptError'`, log `Sync aborted.`, and exit 0 with no `[ERROR]` line.

### 1d. Tests

- [x] Add an integration test helper that builds real repos under a temp dir: a bare `origin`, a `user` clone, and an `other` clone that stands in for a second machine or person. Mock only `glab.service`.
- [x] `--mine`: `other` pushes to `<src>` while `user`'s copy is stale. The MR must be synced from `origin/<src>`, and `other`'s commit must still be on `origin/<src>`.
- [x] `--mine`: when `user` has local-only commits, the MR is skipped and nothing is pushed.
- [x] `--mine`: a conflict is aborted, the next MR still runs, and the original branch is restored.
- [x] `sb`: the same stale-copy scenario stops with the pull hint, and `origin/<current>` is unchanged.
- [x] `sb`: a branch that was never pushed, and a normal sync, both still work.
- [x] Cancelling the confirm prompt exits 0.
- [x] Update the existing mocked tests to match the new service functions.

**Done when:**

- The stale-copy tests for both `sb` and `sb --mine` prove the remote commit survives.
- A Ctrl+C mid-run leaves the repo on the original branch with no rebase in progress.
- All checks pass.

---

## Phase 2 - Same rules, clear output

**Goal:** `--mine` picks the right MRs, skips what doesn't need work, applies the same guardrails as `sb`, and reports every MR in one clear summary.

### 2a. Listing MRs (`glab.service.ts`)

- [x] Run `--assignee=@me` and `--author=<me>` in parallel, each with `--per-page 100`, looping through pages until one comes back short. Deduplicate by `iid`.
  - First check whether `--author=@me` works in the installed glab. If it doesn't, get `<me>` from the `username` field of `glab api user`.
  - Checked: `--author=@me` works in glab 1.116, so no `glab api user` fallback is needed.
- [x] Add `sourceProjectId`, `targetProjectId` and `draft` to `MyMergeRequest`. Stop filtering drafts here; the flow filters them so it can report them.
- [x] If `glab mr list` fails, say that a GitLab remote and `glab auth login` are needed, and include glab's stderr.

### 2b. Filtering and skipping (in the flow)

Every MR that doesn't get synced still appears in the summary, with a reason.

- [x] `skipped (fork)` when `sourceProjectId !== targetProjectId`
- [x] `skipped (draft)`
- [x] `skipped (guardrail)`: move the two release rules from `syncBranch.flow.ts` into a shared pure function, and use it in both flows.
- [x] Fetch only what's needed: `git fetch origin <every unique src and target>`, without `--prune`. Plain `sb` keeps `fetchOriginPrune`.
  - `git ls-remote --heads origin <refs>` runs first, and only the branches that exist are fetched. One missing ref would fail the whole fetch.
- [x] `failed (origin/<x> not found)` when `<src>` or `<target>` is missing after the fetch. The run continues.
- [x] `up-to-date` when `git merge-base --is-ancestor origin/<target> origin/<src>` is true. Check this before any checkout.
- [x] A conflict gets the hint `git checkout <src> && axon sb <target>`.

### 2c. Output

- [x] An `ora` spinner with the text `[i/N] !<iid> <src> -> <target>`.
- [x] Capture git output instead of inheriting it. Show the captured stderr only for failures.
  - Captured git runs with `GIT_TERMINAL_PROMPT=0`, so a missing credential fails with a hint instead of a hidden prompt under the spinner.
- [x] The summary groups MRs in this order: `synced`, `up-to-date`, `skipped`, `failed`, `interrupted`, `not run`. Every row that isn't a success has a reason.
- [x] Exit codes: 0 if nothing failed, 1 if anything failed or didn't run, 130 if interrupted.

### 2d. Tests

- [x] Listing: pagination beyond 100 results, author and assignee deduplicated. (No `glab api user` fallback, since `--author=@me` works.)
- [x] Filtering: fork, draft and guardrail MRs each show up as `skipped` with their reason.
- [x] An `up-to-date` MR never triggers a checkout, rebase or push.
- [x] Summary grouping, and each exit code.

**Done when:**

- Every listed MR appears exactly once in the summary with the correct status.
- An up-to-date MR costs no checkout.
- All checks pass.

---

## Phase 3 - Fast and parallel

**Goal:** `--mine` never touches your worktree, rebases several MRs at once, and pushes in as few round trips as possible.

### 3a. Startup

- [x] Remove the dirty-tree check and the original-branch restore from `--mine`.
- [x] Check the git version. At 2.44 or later, use `replay`; below that, use worktrees only.
- [x] Take the lock: open `<gcd>/axon-sync.lock` exclusively (`wx`) and write the PID into it.
  - If the file already exists and its PID isn't running (`process.kill(pid, 0)` throws), delete it and try again.
  - If that PID is running, exit 1 with `another sync is running (pid N)`.
  - Release the lock in the `finally` and in the Ctrl+C cleanup.
- [x] Clean up leftovers from a crashed run:
  - For each worktree under `<gcd>/axon-sync/`, run `git -C <wt> rebase --abort` (errors ignored), then `git worktree remove --force <wt>`.
  - Delete the `axon-sync/*` branches.
  - Run `git worktree prune`.
  - Print one info line if anything was removed.

### 3b. Stacks

- [x] Build a dependency graph with an edge from parent to child when a child's `<target>` equals another listed MR's `<src>`.
- [x] A parent that isn't in the list is treated as a normal target.
- [x] Mark MRs in a cycle `failed (cycle)`.

### 3c. Rebasing, up to `--concurrency` (default 4) at once

Run every git command as `git -c core.hooksPath=/dev/null ...`.

- [x] Work out the base:
  - For a child, the base is its parent's new local SHA, or `origin/<parent>` if the parent was `up-to-date`.
  - If the parent failed, mark the child `skipped (parent failed)`.
  - For any other MR, the base is `origin/<target>`.
  - Use the same base for the up-to-date check.
- [x] Rebase each MR:
  1. `git branch axon-sync/<iid> origin/<src>`
  2. `git replay --onto <base> <fork-point>..axon-sync/<iid>`, and parse the new SHA.
  3. If replay fails, fall back to a worktree:
     - `git worktree add --detach <gcd>/axon-sync/<iid> origin/<src>`
     - `git -C <wt> rebase --onto <base> <fork-point>` (the base can be a parent's new SHA, which `--fork-point` can't use)
     - On success, the new SHA is `git -C <wt> rev-parse HEAD`.
     - On failure, run `rebase --abort` and mark the MR `failed (conflict)`.
     - Remove the worktree unless `--keep-worktrees` is set.
  4. Delete `axon-sync/<iid>`.

### 3d. Pushing, after every rebase has finished

Every push uses `--porcelain --no-verify` and one lease per ref.

- [x] Put independent MRs into one non-atomic push.
- [x] Push each stack in its own `--atomic` push, with the parent and every descendant that rebased successfully. A parent can go without a failed child; a child never goes without its parent.
- [x] Map the result lines:
  - `+` or `=`: `synced`
  - `(stale info)`: `failed (remote changed)`
  - `(atomic push failed)`: `skipped (stack rejected)`
- [x] Retry: if a push fails with no per-ref lines and its stderr matches a network error (`Could not resolve host`, `Connection timed out`, `Connection reset`, `unable to access`, `early EOF`, `RPC failed`), wait about 2s and run it once more.
- [x] Update local branches the same way as in Phase 1a.

### 3e. Ctrl+C

- [x] Cancel queued work, abort in-flight git calls, and remove worktrees and `axon-sync/*` branches. Then release the lock, print the summary, and exit 130.
- [x] If Ctrl+C lands during the push, mark those MRs `interrupted - rerun to verify`. A rerun is safe because synced MRs come back `up-to-date`.

### 3f. CLI and docs

- [x] Add `--concurrency <n>` (a positive integer) and `--keep-worktrees`. Both are valid only with `--mine`, in the same way `syncBranch.ts` rejects a target combined with `--mine`.
- [x] State in `--help` and `README.md` that hooks are skipped during `--mine`.

### 3g. Tests

- [x] Your worktree's HEAD, index and `git status` are identical before and after a run.
- [x] A two-level stack syncs parent then child. When the parent conflicts, the child is `skipped (parent failed)`.
- [x] When replay hits a conflict, the worktree fallback runs.
- [x] A running lock blocks a second run, and a lock left by a dead PID is cleared.
- [x] Leftover worktrees and `axon-sync/*` branches from a crashed run are cleaned up at startup.
- [x] A stale lease inside a stack rejects the whole stack.
- [x] After Ctrl+C, no `axon-sync` worktree, branch or lock is left behind.

**Done when:**

- A run leaves your worktree untouched.
- Stacks, the fallback, the lock and Ctrl+C behave as described in the tests above.
- All checks pass.

---

## Reference

### Decisions

| #   | Topic                     | Decision                                                                                                                                                             |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Which MRs count as "mine" | MRs you authored or are assigned to, deduplicated by `iid`                                                                                                           |
| Q2  | Where rebases run         | Isolated worktrees, in parallel, from Phase 3 on. Your worktree is never touched.                                                                                    |
| Q3  | Local and remote differ   | The remote is the truth. Rebase `origin/<src>` and push with an explicit lease. Update the local branch only if it had no local-only commits; otherwise skip the MR. |
| Q4  | Already up to date        | Skip before any checkout                                                                                                                                             |
| Q5  | Stacked MRs               | Parents before children. Skip the children if a parent fails.                                                                                                        |
| Q6  | Conflicts                 | Abort and report, with the `axon sb` command to fix it                                                                                                               |
| Q7  | Filtering                 | Skip forks, drafts and guardrail violations, and report each one                                                                                                     |
| Q8  | Output                    | Progress, git output captured, grouped summary                                                                                                                       |
| Q9  | How each rebase runs      | `git replay` first (2.44 or later), falling back to a worktree rebase                                                                                                |
| Q10 | Concurrency               | Default 4, set with `--concurrency`. Scheduled as a dependency graph.                                                                                                |
| Q11 | Ctrl+C                    | First press: clean up, print the summary, exit 130. Second press: exit immediately.                                                                                  |
| Q12 | Updating the local branch | Compare-and-swap `update-ref`, skipped if the branch is checked out anywhere                                                                                         |
| Q13 | Two runs at once          | A lock file holding the PID, cleared automatically if that PID is no longer running                                                                                  |
| Q14 | Retries                   | Network failures only, once                                                                                                                                          |
| Q15 | Tests                     | Keep the mocks, and add integration tests against real repos                                                                                                         |
| Q16 | Delivery                  | Three phases committed straight to `main`, safety fixes first                                                                                                        |
| Q17 | Worktree location         | `<gcd>/axon-sync/<iid>`                                                                                                                                              |
| Q18 | Leftovers from a crash    | Cleaned up at startup. `--keep-worktrees` keeps them for debugging.                                                                                                  |
| Q19 | Git hooks                 | Skipped everywhere during `--mine`, and documented                                                                                                                   |
| Q20 | Pushing                   | Batched, with each stack atomic                                                                                                                                      |
| Q21 | Fetch                     | Only the refs that are needed                                                                                                                                        |
| Q22 | Fallback checkout mode    | Full `--detach` checkout, not sparse                                                                                                                                 |
| Q23 | Plain `sb` overwrite bug  | Fixed in Phase 1b                                                                                                                                                    |

Details decided without asking:

- `--mine` never creates local branches.
- `--concurrency` limits only local rebases, since the pushes happen once, at the end.
- If the parent MR isn't in the list, the child syncs against `origin/<target>` as normal.
- An `interrupted` run exits 130 even if some MRs failed.

### Audit findings (why each phase exists)

High (Phase 1):

- A stale local branch plus the lease refreshed by the fetch means remote commits get overwritten, in both `sb` and `sb --mine`.
- The SIGINT handler exits immediately, so the `finally` never restores the branch, and the repo can be left mid-rebase.
- `abortRebase` ignores its own failure. One stuck rebase then makes every later MR fail at checkout, and an error thrown in `finally` hides the summary.

Medium (Phases 2-3):

- There's no skip for up-to-date MRs.
- N branch switches in your worktree trigger IDE watchers and `node_modules` drift. A branch that's checked out in another worktree always fails.
- Stacked MRs run in arbitrary order.
- Fork MRs fail with an unclear error.
- The bare `git push` depends on the upstream config.
- The 30-MR page limit cuts off the list silently.
- The dirty check ignores untracked files.
- `--mine` has no release guardrails.
- A missing target only warns.
- Cancelling the prompt is logged as an error.

Low (Phase 2):

- There's no progress, and git output runs together.
- Drafts are dropped silently.
- `glab` errors aren't actionable.
- The fetch pulls every ref.
- Local commits that were never pushed get published without a warning.
