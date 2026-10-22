---
name: code-review-loop
description: Take a change from task to shipped through four checks: the author self-verifies, a second agent with no memory of the work reviews the diff, the automated checks run, and one decision sends it to ship, back to the author when the findings are resolvable, or to a person when something novel came up. Use the machine tool to run it; every step is reported and verified against the definition.
---

# Code review loop

Machine `code-review-loop` version 1. Take a change from task to shipped through four checks: the author self-verifies, a second agent with no memory of the work reviews the diff, the automated checks run, and one decision sends it to ship, back to the author when the findings are resolvable, or to a person when something novel came up.

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
| `repo_path` | string | yes | Absolute path to the git repository |
| `task` | string | yes | What to build or change, in plain words |
| `base_branch` | string | no | Branch to start from and ship into. Default: main |

## Requirements checked at preflight

- **clean-tree**: repo_path is a git repository with a clean tree on the base branch
  Check: Run `git -C <repo_path> status --porcelain --branch`; ok if the first line names the base branch and nothing else prints
- **checks-exist**: The repo has automated checks to run (test, lint, typecheck or build scripts, or a CI config)
  Check: Look at package.json scripts, a Makefile, or .github/workflows; ok if at least one check command exists. Say which

## States

Start: `generate`

| state | kind | events → next |
|---|---|---|
| `generate` | task | `generated` → `self_verify` |
| `self_verify` | task | `verified` → `second_review` |
| `second_review` | task | `reviewed` → `checks` |
| `checks` | task | `checked` → `all_clear` |
| `all_clear` | decision | `yes` → `ship`, `resolvable` → `generate`, `novel` → `human_review` |
| `human_review` | wait | `approved` (human) → `ship`, `changes_requested` (human) → `generate`, `rejected` (human) → `abandoned` |
| `ship` | task | `shipped` → `shipped` |
| `shipped` | final (success) | — |
| `abandoned` | final (failure) | — |

### `generate` · Agent generates code (task)

On the first pass, branch from the base branch with a short descriptive name and implement the task. On a later pass (back from all_clear or from a person), you are already on the branch: address every item in the list you were given and nothing else. Commit as you go with plain messages. Do not open a PR here.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `branch` | string | yes |  |
| `files_changed` | number | yes |  |
| `summary` | string | yes | What was done this pass, two lines at most |

Events:

- `generated` → `self_verify`

### `self_verify` · Agent self-verifies (task)

Read your whole diff against the base branch as if someone else wrote it. Trace the logic, look for bugs, edge cases, duplication, dead code, and anything the task asked for that is missing. Fix what you find and commit. Report what you found, including nothing.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `issues_found` | number | yes |  |
| `fixed` | string | yes | One line per issue fixed, or 'none' |

Events:

- `verified` → `second_review`

### `second_review` · Second agent reviews (task)

Hand the diff and the task to a reviewer that has no memory of your work: a fresh agent (the Agent tool, or `claude -p` with the task and `git diff <base>...HEAD`). Ask for blocking issues and minor findings as a list, each with file and line. Do not fix anything in this state; record the findings verbatim.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `blocking` | number | yes |  |
| `minor` | number | yes |  |
| `findings` | array | yes | Every finding as the reviewer stated it |

Events:

- `reviewed` → `checks`

### `checks` · Automated checks (task)

Run every check the repo has: tests, typecheck, lint, build. Record each command and whether it passed. Do not fix anything here.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `commands` | array | yes |  |
| `passed` | boolean | yes | True only when every check passed |
| `failures` | string | no |  |

Events:

- `checked` → `all_clear`

### `all_clear` · All clear? (decision)

Decide from the review findings and the checks. yes: no blocking findings, every check passed, minor findings either fixed or not worth a pass. resolvable: something is wrong, and you know what to do about it; write the list for the next generate pass. novel: a finding or failure that changes the task's shape, needs a product decision, or you could not understand; a person must look.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `verdict` | string (`yes` \| `resolvable` \| `novel`) | yes |  |
| `todo` | string | no | The list for the next pass, or the question for the person |

Events:

- `yes` → `ship`
- `resolvable` → `generate`: Fix the list and come back through the checks
- `novel` → `human_review`: A person decides

### `human_review` · Human review (wait)

Give the person what they need to decide: the diff, the findings, the checks and your question. Use the repo's review path (a Plannotator guided review, or a draft PR). Then stop.

A human fires the next event from the UI. Report what they need to know with `machine.note`, then stop.

Events:

- `approved` → `ship` _(human only)_
- `changes_requested` → `generate` _(human only)_: The person's notes become the next pass's list
- `rejected` → `abandoned` _(human only)_

### `ship` · Ship (task)

Push the branch and open a PR against the base branch with `gh pr create` (title from the task, body: summary, findings addressed, checks run). Merge it the way the repo does, or leave it open when the repo expects a person to merge; say which.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `pr` | string | yes | PR number or URL |
| `merged` | boolean | yes |  |

Events:

- `shipped` → `shipped`

### `shipped` · Shipped (final)

Terminal state, outcome **success**. Nothing further to do.

### `abandoned` · Rejected by the person (final)

Terminal state, outcome **failure**. Nothing further to do.
