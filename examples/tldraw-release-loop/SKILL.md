---
name: tldraw-release-loop
description: One tick of the tldraw desktop release loop: when main has moved, gate it with pnpm check, dispatch the internal TestFlight build, and when something is red let a fixer open and land a PR, re-gate, and try again. A person is pulled in only when the loop stalls. Production promotion is a separate, manual tick. Use the machine tool to run it; every step is reported and verified against the definition.
---

# tldraw release loop

Machine `tldraw-release-loop` version 1. One tick of the tldraw desktop release loop: when main has moved, gate it with pnpm check, dispatch the internal TestFlight build, and when something is red let a fixer open and land a PR, re-gate, and try again. A person is pulled in only when the loop stalls. Production promotion is a separate, manual tick.

## Where the machine lives

- **Server:** `http://localhost:7420`. It is one local process; a human sees every run in the web UI at the same address.
- **Tools:** the `machine` MCP server at `http://localhost:7420/mcp` (Streamable HTTP). In Claude Code the tools appear as `mcp__machine__preflight`, `mcp__machine__begin`, and so on. If they are not available, the server is not connected: say so and stop. To connect, the human runs once: `claude mcp add --transport http machine http://localhost:7420/mcp`. Do not improvise the process without the tools.
- **The run page:** `http://localhost:7420/#/runs/<run_id>`. Print this link as soon as `machine.begin` returns a run_id, so the human can watch. Everything you report with the tools shows there as it happens; you do not need to post anything else anywhere.
- **Definition:** `machine.json` next to this file is the exact definition the server enforces. This skill is rendered from it.

## The contract: tools and what they return

| tool | arguments | returns |
|---|---|---|
| `list_machines` | none | the machines you can run, with their inputs |
| `preflight` | `machine_id`, `inputs` | input errors (if any) and the requirements to check |
| `begin` | `machine_id`, `inputs`, `preflight: [{id, ok, detail?}]`, `agent?: {name?, session?}` | the first state card; creates the run |
| `transition` | `run_id`, `event`, `payload?`, `note?` | the next state card, or an error naming what was rejected and why |
| `note` | `run_id`, `note`, `progress?` (0-100) | nothing; the note appears in the run's history |
| `fail` | `run_id`, `code`, `message`, `needs?: string[]`, `fatal?` | the card, now blocked (or failed when fatal) |
| `get` | `run_id` | the current state card; use it to resume after a human acted |

A **state card** is a JSON object:

```json
{ "run_id": "run_x", "status": "running", "state": "<state id>", "kind": "task", "title": "<state title>", "your_move": true,
  "instructions": "what to do in this state", "output": { "<field>": { "type": "string", "required": true } },
  "events": [ { "name": "<event>", "to": "<next state>", "actor": "agent" } ] }
```

When `your_move` is false the card carries `stop_reason` instead of instructions. When a human unblocked the run or fired an event and wrote a note, the next card carries it as `human_note`: it is addressed to you, read it before acting, and let it change what you do in this state. `status` is one of running, waiting (a human decides), blocked (a human must fix something), succeeded, failed, cancelled.

## How a run works

1. Call `machine.preflight` with the inputs. It returns the requirements below and any input errors.
2. Perform every check yourself and record the result for each requirement id.
3. Call `machine.begin` with the inputs, the preflight results, and `agent: { name, session }` so the UI shows who is running: `name` is the product you are (Claude Code, OpenCode, Pi, Codex, Cursor, Copilot), `session` your model and session id. Your `detail` strings are shown to the human, so say what you ran and what you saw. If a required check failed, the run is still created, but **blocked**: the card says `your_move: false` and lists what a human must fix. Print the run page link and stop there.
4. Otherwise you get a **state card** with `your_move: true`: the current state's instructions, the output fields you must produce, and the events you may fire. Do what it says. Use `machine.note` to report progress while you work (`progress` is a percentage, 0-100).
5. When the state's work is done, call `machine.transition` with one of the listed events and the output payload. You get the next state card. Repeat.
6. Stop whenever a card says `your_move: false`. Its `stop_reason` tells you why: the run finished, a human must decide, or the run is blocked.

## Rules

- Fire only events listed on the current state card. The tool rejects anything else; do not retry with a different event to "get past" a state.
- Produce every required output field honestly. Do not invent values to satisfy the schema.
- If you cannot complete the current state, call `machine.fail` with a code, a plain message, and `needs` (what a human must provide or fix). Then stop. Do not work around the machine.
- Never satisfy a requirement by creating the thing it checks for. A missing credential, file, or connection is reported, not manufactured.
- If the tool has already blocked the run (a card with `status: blocked`), do not also call `machine.fail`. Just stop.
- If the run is `waiting`, a human decides the next event in the UI. Stop and say so.
- If the run is `blocked`, stop. A human will unblock it; a new session will resume from `machine.get`, whose card carries their `human_note` if they wrote one.
- Never run two runs of this machine at once in one session.

## Inputs

| field | type | required | description |
|---|---|---|---|
| `repo_path` | string | yes | Absolute path to the checkout, on main |
| `action` | string (`tick` \| `promote`) | yes | tick: process new commits on main. promote: promote the current internal build to production |
| `build_workflow` | string | no | Workflow file that builds the internal TestFlight build, for `gh workflow run`. Default: the repo's internal build workflow |

## Requirements checked at preflight

- **on-main**: repo_path is on main with a clean tree
  Check: Run `git -C <repo_path> status --porcelain --branch`; ok if the first line starts with `## main` and nothing else prints
- **pnpm-ready**: pnpm runs and the repo has a `check` script
  Check: Run `pnpm --version` in repo_path and `grep '"check"' package.json`; ok if both print
- **gh-ready**: gh is logged in and can see the repository
  Check: Run `gh auth status` and `gh repo view --json nameWithOwner` in repo_path; ok if both succeed

## States

Start: `start`

| state | kind | events → next |
|---|---|---|
| `start` | decision | `tick` → `check`, `promote` → `promotion` |
| `check` | task | `new_commit` → `gate`, `nothing_new` → `idle` |
| `gate` | task | `green` → `dispatch`, `red` → `fix` |
| `dispatch` | task | `released` → `released`, `build_failed` → `fix`, `stalled` → `needs_person` |
| `fix` | task | `pr_opened` → `land` |
| `land` | task | `merged` → `gate`, `needs_review_or_red` → `needs_person`, `timed_out` → `needs_person` |
| `needs_person` | wait | `clear_attention` (human) → `check`, `stop` (human) → `stopped` |
| `promotion` | task | `promoted` → `verify` |
| `verify` | task | `verified` → `promoted`, `broken` → `needs_person` |
| `idle` | final (success) | — |
| `released` | final (success) | — |
| `promoted` | final (success) | — |
| `stopped` | final (failure) | — |

### `start` · Which tick is this (decision)

Read the action input and fire the matching event. Nothing else.

Events:

- `tick` → `check`: action = tick
- `promote` → `promotion`: action = promote

### `check` · Waiting for new commits (task)

`git fetch origin` and `git pull --ff-only`. The last head this loop processed is in `.git/release-loop-last` (a bare SHA; absent on the first run, which means everything is new). Compare it with `origin/main`. Report the new commits with `machine.note`. Do not write the file yet; it is written when a tick ends in released.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `head` | string | yes | Short SHA of origin/main now |
| `new_commits` | number | yes |  |

Events:

- `new_commit` → `gate`: main moved since the last processed head
- `nothing_new` → `idle`: main is where the last tick left it

### `gate` · Gate (task)

On main at head, run `pnpm check`. Green means exit 0. On red, keep the failing output; the fixer needs it. Do not fix anything here.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `head` | string | yes | Short SHA that was checked |
| `passed` | boolean | yes |  |
| `failure` | string | no | The first failing check and its key lines, when red |

Events:

- `green` → `dispatch`
- `red` → `fix`

### `dispatch` · TestFlight build (task)

Dispatch the internal build: `gh workflow run <build_workflow> --ref main`, then find the run (`gh run list --workflow=<build_workflow> --limit=1`) and watch it to the end, posting a note as jobs finish. Released means the workflow succeeded and the build reached internal TestFlight. If a job fails on the code (build or tests), fire build_failed with the failing lines. If the run never starts, hangs, or fails on infrastructure (runner, signing, upload), fire stalled; a fixer cannot help with that. When released, write the head SHA to `.git/release-loop-last`.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `run_id` | string | yes |  |
| `result` | string (`released` \| `build_failed` \| `stalled`) | yes |  |
| `detail` | string | no |  |

Events:

- `released` → `released`: Internal build is on TestFlight; .git/release-loop-last updated
- `build_failed` → `fix`: Build or tests failed on the code
- `stalled` → `needs_person`: Infrastructure failure or no progress

### `fix` · Fixer agent (task)

Branch from main as `huppy/release-fix-<head short SHA>`. Fix only what the gate or build reported, in the smallest change that makes it pass, with a test when one fits. Run `pnpm check` locally until it is green. Push the branch and open a PR with `gh pr create` whose body quotes the failure and says what changed. Do not merge here.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `branch` | string | yes |  |
| `pr` | string | yes | PR number or URL |
| `summary` | string | yes |  |

Events:

- `pr_opened` → `land`

### `land` · Land fix (task)

Wait for the PR's checks (`gh pr checks <pr> --watch`). When every check is green and nothing blocks the merge, merge it (`gh pr merge <pr> --squash --delete-branch`), switch back to main and pull. If a check is red, the PR needs a human review, or a reviewer asked for changes, fire needs_review_or_red with the reason. If nothing has moved after a reasonable wait (about 30 minutes), fire timed_out.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `merged_sha` | string | no | Short SHA of main after the merge |
| `reason` | string | no | Why the fix did not land, when it did not |

Events:

- `merged` → `gate`: Main moved; gate the new head
- `needs_review_or_red` → `needs_person`
- `timed_out` → `needs_person`

### `needs_person` · Needs a person (wait)

The loop is paused. Say in a note exactly what a person has to do (merge, review, fix the runner, decide) and where.

A human fires the next event from the UI. Report what they need to know with `machine.note`, then stop.

Events:

- `clear_attention` → `check` _(human only)_: The person handled it; look at main again
- `stop` → `stopped` _(human only)_: Stop the loop for now

### `promotion` · Production promotion (task)

Promote the current internal build to production the way the repo does it (its promote script or workflow). Record which build went out.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `build` | string | yes | Version or build number promoted |

Events:

- `promoted` → `verify`

### `verify` · Verify production (task)

Confirm the production build is live and opens: the store or update feed shows the promoted build, and a fresh install or update launches to the main screen. Record what you checked.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `checks` | string | yes |  |

Events:

- `verified` → `promoted`
- `broken` → `needs_person`

### `idle` · Nothing new on main (final)

Terminal state, outcome **success**. Nothing further to do.

### `released` · Released to internal TestFlight (final)

Terminal state, outcome **success**. Nothing further to do.

### `promoted` · Promoted to production and verified (final)

Terminal state, outcome **success**. Nothing further to do.

### `stopped` · Loop stopped by a person (final)

Terminal state, outcome **failure**. Nothing further to do.
