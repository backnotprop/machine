---
name: changelog-draft
description: Turn the commits since the last tag into a reviewed CHANGELOG.md entry. Use the machine tool to run it; every step is reported and verified against the definition.
---

# Draft a changelog entry

Machine `changelog-draft` version 1. Turn the commits since the last tag into a reviewed CHANGELOG.md entry.

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
| `version` | string | yes | Version label for the entry, e.g. 0.4.0 |

## Requirements checked at preflight

- **git-repo**: repo_path is a git repository with at least one commit
  Check: Run `git -C <repo_path> log -1 --oneline`; ok if it prints a commit
- **author-set**: A file named .changelog-author in repo_path holds the preparer's name (used in the entry footer)
  Check: Run `cat <repo_path>/.changelog-author`; ok if it prints a non-empty name

## States

Start: `collect`

| state | kind | events → next |
|---|---|---|
| `collect` | task | `collected` → `draft`, `nothing_to_release` → `empty` |
| `draft` | task | `drafted` → `self_review` |
| `self_review` | decision | `ok` → `ready`, `revise` → `draft` |
| `ready` | final (success) | — |
| `empty` | final (success) | — |

### `collect` · Collect commits (task)

List commits since the latest tag (all commits if there is no tag) with `git log --oneline`. Count them. Do not write anything yet.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `commit_count` | number | yes |  |
| `range` | string | yes | The git range you used, e.g. v0.3.0..HEAD or HEAD |

Events:

- `collected` → `draft`: At least one commit found
- `nothing_to_release` → `empty`: No commits since the last tag

### `draft` · Write the entry (task)

Create CHANGELOG.md in repo_path (top heading `# Changelog`) or prepend to it a section `## <version>` with one bullet per user-visible change, grouped under Added / Changed / Fixed as appropriate. End the section with a line `Prepared by: <name from .changelog-author>`. Do not commit.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `path` | string | yes | Absolute path to the file you wrote |
| `bullets` | number | yes | Number of bullets in the new section (not lines in the file) |

Events:

- `drafted` → `self_review`

### `self_review` · Check the entry against the commits (decision)

Re-read the commit list and the entry. Every commit must be represented or deliberately omitted (merge commits, chores). If anything is missing or wrong, go back and fix it.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `verdict` | string (`ok` \| `revise`) | yes |  |
| `notes` | string | no |  |

Events:

- `ok` → `ready`
- `revise` → `draft`

### `ready` · Ready for human review (final)

Terminal state, outcome **success**. Nothing further to do.

### `empty` · Nothing to release (final)

Terminal state, outcome **success**. Nothing further to do.
