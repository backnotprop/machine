# machine

State machines for coding agents.

You write a workflow as a state machine. An agent runs it by calling MCP tools. The server checks every call against the machine and rejects any move the machine does not allow. You watch the run live.

Licence: FSL-1.1-MIT. Needs [Bun](https://bun.sh) 1.3+.

## The machine

A machine is JSON: states, and the events that move between them.

```json
{
  "id": "ship-fix",
  "initial": "reproduce",
  "credentials": [{ "id": "github", "provider": "github", "why": "push the branch, open the PR" }],
  "states": {
    "reproduce":    { "kind": "task",     "instructions": "Write a failing test that shows the bug.",
                      "on": { "reproduced": { "to": "fix" }, "cannot_reproduce": { "to": "needs_info" } } },
    "fix":          { "kind": "task",     "instructions": "Make the test pass. Do not touch unrelated code.",
                      "on": { "fixed": { "to": "verify" } } },
    "verify":       { "kind": "decision", "instructions": "Run the full suite.",
                      "on": { "pass": { "to": "open_pr" }, "fail": { "to": "fix" } } },
    "open_pr":      { "kind": "task",     "credentials": ["github"],
                      "on": { "opened": { "to": "await_review" } } },
    "await_review": { "kind": "wait",
                      "on": { "approved": { "to": "merged", "actor": "human" },
                              "changes_requested": { "to": "fix", "actor": "human" } } },
    "needs_info":   { "kind": "wait",     "on": { "info_provided": { "to": "reproduce", "actor": "human" } } },
    "merged":       { "kind": "final" }
  }
}
```

Four kinds of state:

| kind | who moves it | what it means |
|---|---|---|
| `task` | the agent | do the work, then report which event happened |
| `decision` | the agent | evaluate and pick an event |
| `wait` | a person | the run stops until someone picks the event in the UI |
| `final` | nobody | the run is over |

States can declare typed `output` the agent must return, `inputs` the run needs, `requirements` checked before the run starts, and `credentials` the step needs. The full shape is in `schema/machine.schema.json`.

## The run

Publishing a machine writes a skill the agent loads (`SKILL.md`, with the machine's instructions and the exact tool calls) and stores the definition the server enforces.

The agent drives a run with these MCP tools:

```
preflight    run the requirements checks and report them
begin        start a run with its inputs
transition   "event X happened in the current state", with the state's output
note         progress text for the timeline
fail         give up with a reason
get          the run's state, history and what is expected next
request      make an HTTP call with a credential attached server-side
credential   the raw fields of a credential, only where the machine allows handoff
```

The server rejects, and records the rejection, when the agent:

- names an event the current state does not have (`invalid_event`)
- picks a `human` event itself (`wrong_actor`)
- omits or mistypes the state's required output (`invalid_payload`)
- begins without finishing preflight, or with bad inputs
- enters a state whose credential slot is not bound to a working credential (`credential_not_live`)
- moves a run that is blocked, waiting, or finished

Every accepted transition and every rejection go into the run's history in SQLite. The UI shows the graph with the current state lit, the timeline, and the inputs and outputs so far. When a run reaches a `wait` state, the person picks the event in the UI; a fresh agent session can resume the run from there.

## Run it

```
bun install
bun run build
bun src/cli.ts serve                                         # http://localhost:7420, data in ~/.machine
bun src/cli.ts add examples/ship-fix.machine.json
bun src/cli.ts publish ship-fix                              # ~/.claude/skills/ship-fix/SKILL.md
claude mcp add --transport http machine http://localhost:7420/mcp
```

Then in Claude Code: "run the ship-fix skill on issue #42". Watch it at http://localhost:7420.

Local mode has no sign-in and binds to localhost.

## Make a machine

- **Draw it.** The editor: add states, connect them with events, set kinds, write instructions, publish.
- **Describe it.** Tell an agent the process in a sentence; it drafts the graph next to the conversation and you edit and publish. The agent can be your own Claude Code, Pi or OpenCode session running in your repo (install the byoa connector, then `/byoa connect http://localhost:7420`; the designer shows the exact lines), or, locally, one the server starts over ACP (Claude Code, Gemini CLI, OpenCode, Codex, whichever is installed).

## Credentials

A machine declares credential slots. The team binds each slot to a stored credential (GitHub App, npm token, AWS keys, any bearer token) on the machine page. The engine will not enter a state whose slot is unbound.

Inside the step, the agent gets the credential without seeing it:

```
bun src/cli.ts run <run_id> -- gh pr create ...     # leases it into one command's environment, then wipes it
```

or through the `request` tool, which attaches it server-side. The `credential` tool returns raw fields only where the machine sets `handoff: true`, and the timeline records every use. Stored values are encrypted with `MACHINE_SECRET_KEY`, or a key file the server writes to `~/.machine` on first start.

## Hosted mode

Set `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `WORKOS_COOKIE_PASSWORD` and `MACHINE_PUBLIC_URL`. The same server then has sign-in, teams, and `mk_` keys for agents. Members push machines with `bun src/cli.ts login --url <url> <mk_key>` then `bun src/cli.ts push <machine.json>`. Design notes in `docs/hosted/`.

Other settings: `PORT` (7420), `MACHINE_HOME` (`~/.machine`), `MACHINE_SKILLS_DIR` (`~/.claude/skills`).

## Evals

```
bun evals/run.ts                      # every case: a fresh Claude Code session runs a machine against the server
bun evals/run.ts changelog-happy 5    # one case, five times, with the LLM judge
bun evals/run.ts release-dry          # a release machine against a stand-in repo with stub gh and npm
bun evals/run.ts changelog-unblocked  # a run blocks, a person unblocks it, a fresh session resumes
bun evals/run.ts ship-fix-credentials-missing   # the engine refuses a step whose slot is unbound
bun evals/describe.ts [claude|gemini|opencode|codex]   # an agent drafts a machine from one sentence
bun evals/author.ts 7420              # Playwright draws a machine in the editor and publishes it
```

Evals assert on the run's history in SQLite, not on what the agent says.

## Layout

```
src/engine      engine.ts (validation, the tool surface), sqlite-store.ts, render-skill.ts, providers.ts, crypto.ts
src/server      main.ts (Hono: /mcp, /api, /events, the UI), author.ts, byoa.ts, connect.ts, credentials.ts, auth.ts
src/ui          Vite + React
src/cli.ts      serve | add | publish | render | runs | login | run | push
evals           cases/, fixtures/, run.ts, describe.ts, author.ts, watch.ts
examples        machines and their rendered skills
schema          JSON Schema for machines and runs
docs            design, byoa and hosted notes, screenshots
film            the launch film (film.html draws every frame from time; render.mjs shoots it)
```

Dev loop: `bun src/cli.ts serve` in one terminal, `bunx vite` in another. Restart the server after editing `src/server/` or `src/engine/`.

The byoa wire and connectors are in [plannotator/byoa](https://github.com/plannotator/byoa). Design: `SPEC.md`, `DESIGN.md`, `DECISIONS.md`.
