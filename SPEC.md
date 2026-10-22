# Machines: processes an agent follows, enforced by a tool

A **machine** is a process you author in a UI: states, the events that move between them, what the agent must produce at each step, and what must be true before it starts. The UI publishes two artifacts from one definition: a **skill** (markdown the agent loads) and a **schema** (the definition itself, validated). An agent starts a **run** through a tool, and every step it reports is checked against the definition before it is accepted. The UI shows runs live.

## The one decision that makes it deterministic

The model never tracks state. The tool does.

Instructions alone drift: the model skips a step, fires an event that does not exist, or declares victory early. So the server owns the run and **rejects** anything the definition does not allow: an event not listed on the current state, a payload missing a required field, an agent firing an event reserved for a human, a transition on a run that is blocked or finished. The rejection message tells the agent what *is* allowed. The skill is the map; the tool is the rails.

The second half of the same decision: after `begin` and every `transition`, the tool returns a **state card** with exactly what the agent needs for the next step (instructions, required output fields, allowed events). The agent does not need to keep the whole machine in context or remember where it is. A fresh session can call `get` and continue.

A card carries `your_move: true | false`. When it is false (run blocked, waiting on a human, or finished) the card has no instructions and no events, only a `stop_reason` saying what happens next. The first trial showed why: a blocked card that still listed instructions and events invited the agent to start working anyway.

## Artifacts

| artifact | produced by | consumed by | file |
|---|---|---|---|
| Machine definition (JSON) | the UI | server, renderer | `schema/machine.schema.json`, `examples/*.machine.json` |
| Skill (SKILL.md) | rendered from the definition | the agent (Claude Code skill, or any agent that reads markdown) | `examples/*/SKILL.md`, `src/engine/render-skill.ts` |
| Run (JSON) | the server | the UI, the agent via `get` | `schema/run.schema.json` |
| Tool | the server (MCP over HTTP) | the agent | `src/engine/engine.ts`, `src/server/main.ts` |

The definition is the single source of truth. The skill is derived and should never be hand-edited; if the prose needs to change, change the definition and re-render.

## Machine definition

```
machine
  id, version, name, description
  inputs        fields the run needs (validated at preflight and begin)
  requirements  preconditions the agent checks before begin
  initial       starting state
  states
    <id>
      kind          task | decision | wait | final
      title
      instructions  markdown the agent follows in this state
      requirements  extra checks on entering this state
      output        fields the agent must report when leaving (validated)
      on
        <event>     to, description (the guard, in words), actor (agent|human)
      outcome       success | failure (final only)
```

**State kinds.** `task`: the agent does work, then fires one event. `decision`: the agent evaluates something and the event *is* the answer (pass/fail, ok/revise). `wait`: only a human can fire the next event, from the UI; the run shows as `waiting`. `final`: terminal, with an outcome.

**Events, not "next".** Each state lists named events with a target. This is XState's shape and it forces the author to name the branches ("tests failed", "cannot reproduce") instead of leaving them implicit. The `description` on an event is the guard, written for the model: when to fire this one.

**Outputs are the reporting.** A state's `output` is what the agent must hand over to leave it. This is where the useful run data lives (the PR url, the test command, the count of commits), and the server validates type, required, enum, and rejects unknown fields. Pick outputs that are observable facts, not opinions.

**Versioning.** Every published edit bumps `version`. A run pins the version it began on, so editing a machine never changes an in-flight run.

The renderer refuses definitions that fail structural checks: unknown targets, unreachable states, final states with transitions or without an outcome, wait states with agent events, task states without instructions. The UI should run the same checks on save.

## Tool contract

| call | who | validated | result |
|---|---|---|---|
| `preflight(machine_id, inputs)` | agent | inputs against `inputs` fields | `inputs_ok`, input errors, list of requirements with how to check each. It does not run the checks; the agent does. |
| `begin(machine_id, inputs, preflight[])` | agent | inputs; every required requirement has a result; no unknown ids | a run. If any required check is `ok: false`, the run is created **blocked** with `error.needs` filled in, and the agent cannot transition. |
| `transition(run_id, event, payload?, note?)` | agent | run is running; event exists on current state; actor is agent; payload matches current state's `output`| next state card |
| `note(run_id, note, progress?)` | agent | run not finished; progress is 0-100 | ack. Shows in the UI timeline. |
| `fail(run_id, code, message, needs?, fatal?)` | agent | run is running | run becomes `blocked` (default) or `failed` (fatal) |
| `get(run_id)` | agent | | current state card (resume point) |
| `human.transition(run_id, event)` | UI | run waiting or running; event's actor is human | next state card |
| `human.unblock(run_id)` | UI | run blocked | state card; error cleared; same state |
| `human.cancel(run_id)` | UI | | |

Error codes the agent will see: `invalid_inputs`, `preflight_incomplete`, `unknown_requirement`, `run_not_running`, `invalid_event`, `wrong_actor`, `invalid_payload`, `invalid_progress`, `run_finished`. Each message names the fix.

The server exposes these as MCP tools over Streamable HTTP; the human-side calls are plain JSON endpoints under `/api` used by the UI.

## The agent loop

1. `preflight` → perform each check → `begin` with results.
2. Read the state card. Do the work. `note` as you go.
3. `transition` with an event and the output payload. Read the next card.
4. Stop on `succeeded`, `failed`, `waiting` (human's turn), or `blocked` (you reported you cannot continue).

The rendered skill says this in six lines plus six rules. Everything else in the skill is the map: inputs, requirements, a state table, and one section per state with its instructions, outputs, and events.

## "Does the agent have what it needs?"

Three layers, deliberately separated:

1. **Inputs** are validated by the server. Missing or mistyped inputs never produce a run.
2. **Requirements** are checked by the agent, because only the agent's environment can answer "is gh authenticated" or "does the database connection work". The server gates on the results: a failed required check yields a blocked run with a `needs` list. The human sees exactly what to fix and presses unblock; the agent (or a later session) continues from the same state. Requirements can also hang off a single state for things only needed later.
3. **Ad hoc failure** covers everything the author did not foresee. `fail` takes a code, a plain message, and `needs`. Blocked is the default because most failures are fixable by the human; `fatal` is for "this should not continue".

The skill rule that matters most: *do not work around the machine*. A failed check is reported, not patched. The blocked trial below tests exactly this.

## What the UI shows

- **Runs list**: machine, status, current state, last update, error if blocked. Blocked and waiting runs sort to the top because they need a human.
- **Run page**: the timeline rendered from `history` (begin, each transition with its payload, notes with progress, errors, human actions), the current state card, and for `waiting` states the human events as buttons; for `blocked` runs the `needs` checklist and an unblock button.
- **Machine editor**: a graph of states and events plus a form per state (instructions, outputs, events, requirements). Save runs the structural validation. Publish bumps the version and renders the skill; the skill and the JSON are both downloadable or installable into a skills directory.

Notifications for `waiting` and `blocked` are the natural place to plug into an inbox you already read, rather than a new surface.

## Validated so far

- The engine was exercised by scripted walks of the ship-fix machine (rejected events, rejected payloads, actor enforcement on a wait state, blocked-then-unblock, version pinning). Those scripts were removed in favour of end-to-end evaluations with a real agent; see `evals/`.
- Both example definitions and the runs produced by the trials validate against the JSON schemas (ajv, draft 2020-12).
- **Live trial.** Two fresh agents (no context beyond the task) were each given the rendered `changelog-draft` skill, the CLI, and a throwaway git repository with five commits and one tag. One repository had the `.changelog-author` file the machine requires; the other did not.
  - *Happy path*: preflight → begin → `collected` {commit_count: 3, range: v0.1.0..HEAD} → `drafted` {path, bullets: 2} → `ok` → `ready`, status `succeeded`. Zero rejected calls. The agent wrote a correct CHANGELOG.md, deliberately omitted the chore commit, and said so in the review notes.
  - *Blocked path*: preflight found the file missing, reported `author-set: ok: false` with the command output as detail, `begin` created the run as `blocked` with the need spelled out, and the agent stopped without transitioning and without creating the file to pass the check. It called `get` once to confirm persistence.
  - Both agents were asked what was unclear. Their feedback changed the design: `your_move` and `stop_reason` on cards, a skill rule against manufacturing what a requirement checks for, a rule that a tool-blocked run does not also need `fail`, `preflight.ok` renamed to `inputs_ok`, `progress` defined as 0-100 and validated, `detail` documented as human-facing, and the example's undescribed output field given a description. The trial runs are kept in `.machine-home/runs/` as evidence; the blocked one can be unblocked with `human:unblock`.

## Open decisions

These are yours; the reference does not pick.

- **Where runs live.** Local (a file store per machine, like here) or a hosted server. Hosted gets you the UI for runs from any machine and agent; local gets you zero setup.
- **Skill in context, or cards only.** The skill is ~100 lines for a five-state machine. For large machines you could install a short generic skill ("how to run machines") and rely on state cards for the rest.
- **Guardrails later.** Loop caps, transition caps, and timeouts were tried and removed. Decide them from observed runs, not up front.
- **Sub-machines and parallel states.** Deliberately out. A state's instructions can say "run machine X and report its run id" if needed.
- **Human-edited runs.** Whether a human can move a run to an arbitrary state from the UI (a reset) or only fire listed human events. Listed events only is safer and is what the reference does.

## Prior art this borrows from

XState / SCXML for states-with-events and guards. Amazon States Language for state kinds (Task, Choice, Wait, Succeed, Fail) and retry caps. Temporal for an append-only history as the record of truth and version pinning. Claude Code skills for the markdown shape and frontmatter.

## Layout

```
SPEC.md                         this document
DESIGN.md                       visual direction and tokens
DECISIONS.md                    stack decisions with the weighing
PLAN.md                         milestones, each with a real check
schema/machine.schema.json      definition schema (what the UI outputs)
schema/run.schema.json          run schema (what the server stores and the UI renders)
examples/*.machine.json         example definitions; examples/*/SKILL.md are their rendered skills
src/engine/engine.ts            validation + tool surface (storage-agnostic)
src/engine/sqlite-store.ts      runs, events, machines in SQLite (~/.machine/machine.db)
src/engine/render-skill.ts      definition → SKILL.md
src/server/main.ts              Hono on Bun: /mcp for agents, /api and /events for the UI, static UI
src/cli.ts                      machine serve | add | publish | render | runs
evals/run.ts                    end-to-end: real Claude Code session against a published skill over MCP
evals/cases/*.json              one case per file: machine, fixture setup, expected run outcome
docs/overview.html              explainer; docs/mock.html the screen mock in the target aesthetic
```

Run it: `bun src/cli.ts add examples/ship-fix.machine.json`, `bun src/cli.ts serve`, then
`claude mcp add --transport http machine http://localhost:7420/mcp` once, and `bun src/cli.ts publish ship-fix` to put the skill where Claude Code finds it.
