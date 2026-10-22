---
name: ship-fix
description: Take a bug report to a merged pull request: reproduce, fix, prove it with tests, open the PR, wait for review. Use the machine tool to run it; every step is reported and verified against the definition.
---

# Ship a bug fix

Machine `ship-fix` version 2. Take a bug report to a merged pull request: reproduce, fix, prove it with tests, open the PR, wait for review.

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
| `issue_url` | string | yes | Link to the bug report or issue |
| `repo_path` | string | yes | Absolute path to the checked-out repository |
| `base_branch` | string | no | Branch to open the PR against (default main) |

## Requirements checked at preflight

- **clean-tree**: Working tree has no uncommitted changes
  Check: Run `git status --porcelain` in repo_path; ok if output is empty
- **tests-run**: The test suite can be executed
  Check: Find the test command (package.json scripts, Makefile, CI config) and run it once; ok if it starts and finishes, even with failures

## Credentials

The team stores these on the server and binds one to each slot. A run uses them; you never see a value.

| slot | provider | live in | why |
|---|---|---|---|
| `github` | GitHub | `open_pr` | push the fix branch and open the pull request |

- To run a command that needs one, prefix it: `machine run <run_id> -- gh pr create --fill`, `machine run <run_id> -- git push origin HEAD`, `machine run <run_id> -- npm publish`. The `machine` CLI puts the credential in that command's environment and nowhere else. For a plain API call use the `request` tool with the slot id. Each state card lists the slots live in that state under `credentials`, with the exact form to use.
- Never ask the human for a token or password. If a slot is not connected, `machine.begin` blocks the run with a connect link in `needs`; print the run page link and stop, as for any blocked run.
- Never print a credential or run a command whose point is to show one (`env`, `printenv`, `cat ~/.npmrc`). Every use is recorded on the run's timeline with the command it ran.

## States

Start: `reproduce`

| state | kind | events → next |
|---|---|---|
| `reproduce` | task | `reproduced` → `fix`, `cannot_reproduce` → `needs_info` |
| `fix` | task | `fixed` → `verify` |
| `verify` | decision | `pass` → `open_pr`, `fail` → `fix` |
| `open_pr` | task | `opened` → `await_review` |
| `await_review` | wait | `approved` (human) → `merged`, `changes_requested` (human) → `fix` |
| `needs_info` | wait | `info_provided` (human) → `reproduce`, `wont_fix` (human) → `abandoned` |
| `merged` | final (success) | — |
| `abandoned` | final (failure) | — |

### `reproduce` · Reproduce the bug (task)

Read the issue. Write a failing test, or find a command, that demonstrates the bug on the current code. Do not change production code yet.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `repro` | string | yes | Test name or command that fails because of the bug |
| `summary` | string | yes | One sentence: what is wrong and where |

Events:

- `reproduced` → `fix`: You have a failing test or command that shows the bug
- `cannot_reproduce` → `needs_info`: The report is not enough to reproduce it

### `fix` · Write the fix (task)

Make the smallest change that fixes the cause, not the symptom. Keep the reproduction test. Commit on a branch named fix/<short-slug>.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `branch` | string | yes |  |
| `files_changed` | array | yes | Paths touched by the fix |

Events:

- `fixed` → `verify`

### `verify` · Run the full test suite (decision)

Run the whole suite, not just the new test. Report the exact command and result.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `command` | string | yes |  |
| `result` | string (`pass` \| `fail`) | yes |  |
| `failing` | array | no | Names of failing tests, if any |

Events:

- `pass` → `open_pr`: Everything passes
- `fail` → `fix`: Something fails; go back and fix.

### `open_pr` · Open the pull request (task)

Push the branch and open a PR against base_branch (default main): `machine run <run_id> -- git push -u origin <branch>` then `machine run <run_id> -- gh pr create --fill` (the github slot is live only here). Body: what was wrong, what changed, how it was verified, link to issue_url.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `pr_url` | string | yes |  |

Events:

- `opened` → `await_review`

### `await_review` · Wait for human review (wait)

A human fires the next event from the UI. Report what they need to know with `machine.note`, then stop.

Events:

- `approved` → `merged` _(human only)_
- `changes_requested` → `fix` _(human only)_: Reviewer wants changes; the comment thread says what

### `needs_info` · Need more information from the reporter (wait)

A human fires the next event from the UI. Report what they need to know with `machine.note`, then stop.

Events:

- `info_provided` → `reproduce` _(human only)_
- `wont_fix` → `abandoned` _(human only)_

### `merged` · Merged (final)

Terminal state, outcome **success**. Nothing further to do.

### `abandoned` · Abandoned (final)

Terminal state, outcome **failure**. Nothing further to do.
