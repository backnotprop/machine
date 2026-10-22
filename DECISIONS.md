# Decisions

Each one states the need, the options looked at, what was checked, and the call. Sources are in the research notes at the bottom; versions were checked against npm and official docs on 2026-10-19.

## 1. Transition engine: our own thirty lines, not XState (yet)

**Need.** Given a definition, a run, and an event: is the event allowed, does the payload match, who may fire it, what is next.

**Looked at.** XState v5 (5.33) has a pure `transition(machine, snapshot, event)` and `getNextTransitions()`, 14.5 kB gzip, `meta` on states and transitions where our prose could ride. Hierarchy and parallel states would come free later. Snapshots are not plain JSON; you rebuild them with `machine.resolveState`. A v6 alpha is on npm, so the v5 API may move.

**What matters for us.** Everything that makes a run deterministic lives outside XState anyway: output-field validation, agent vs human actor, state kinds, preflight gating, the state card. XState would validate the one thing that is already a dictionary lookup (`states[current].on[event].to`), and add a mapping layer plus snapshot plumbing.

**Call.** Keep the engine in `src/engine/engine.ts`. The definition is deliberately XState-shaped (states, `on`, events to targets), so if hierarchy is ever needed we compile the definition to `createMachine` and swap the lookup. Revisit when a real machine needs nested or parallel states, not before.

## 2. Tool transport: MCP over Streamable HTTP, served by one local Bun process

**Need.** Claude Code (and other agents) must call begin / transition / note / fail / get, and the UI must see every call immediately.

**Looked at.** MCP spec 2026-07-28 is current and stateless; Streamable HTTP and stdio are the transports, the old SSE transport is deprecated. The TypeScript SDK v2 is split into packages; `@modelcontextprotocol/server` 2.3 exposes `createMcpHandler` returning a web-standard `fetch`, and `@modelcontextprotocol/hono` mounts it in Hono with the localhost DNS-rebinding check. Tools may declare an `outputSchema` and return `structuredContent` plus a text block. Claude Code registers it with `claude mcp add --transport http machine http://localhost:<port>/mcp`.

**Call.** One process, `machine serve`, Hono on `Bun.serve`: `/mcp` for agents, `/api` and `/events` for the UI, static files for the UI. HTTP rather than stdio because the UI and the agent need the same live state, and because several agent sessions can share one server. Tool results return the state card as `structuredContent` and as text, since the docs do not say how Claude Code surfaces structured content to the model.

## 3. Storage: `bun:sqlite`, WAL, one file

**Need.** Append-only run history, machine versions, concurrent appends from several agents, cheap queries for the UI.

**Looked at.** JSON files (what the reference uses): git-friendly, but concurrent appends and "runs that need me" queries get ugly. `bun:sqlite`: built in, synchronous transactions, prepared statements, WAL. Other embedded stores add a dependency for nothing.

**Call.** SQLite at `~/.machine/machine.db`. Tables: `machines(id, version, json)`, `runs(id, machine_id, version, status, state, inputs, error, created_at, updated_at)`, `events(run_id, seq, ts, type, actor, json)`. Publishing a machine writes `SKILL.md` and the definition JSON to a skills directory, so the agent-facing artifacts are still plain files on disk.

## 4. Live updates: Server-Sent Events

**Need.** A few browser tabs watching run timelines.

**Looked at.** Both SSE and WebSocket are native to `Bun.serve`; Hono has `streamSSE`. Bun closes idle streams after 10 s unless `server.timeout(req, 0)` or a heartbeat.

**Call.** SSE on `/events`, one stream per tab, event id = `events.seq`, so a reconnecting `EventSource` resumes from where it left off for free. WebSocket only if the UI ever needs to push collaborative edits, which it does not.

## 5. UI: React 19, Vite 8, Tailwind 4, hand-drawn SVG graph laid out by dagre

**Need.** The three screens in `DESIGN.md`: a runs table, a run view, a machine editor with an auto-laid-out graph. Quiet, keyboard-first, monospace.

**Looked at.** React Flow 12 (60 kB gzip) gives pan, zoom, drag, edge hit-testing; its docs recommend dagre (16 kB) for layout and warn off ELK (433 kB). Bun's own HTML bundler works but its docs still call it a work in progress. Your `planbridge` repo already uses React, Tailwind, radix-ui and IBM Plex Mono.

**Call.** React 19 + Vite 8 + Tailwind 4 to match what you already run. Graph: dagre for positions, our own `<svg>` for nodes and edges. The design says the graph is a map, not a canvas: no dragging, no panning, 5 to 20 nodes. That removes everything React Flow is for, and its default styling would fight the aesthetic. Font: JetBrains Mono with IBM Plex Mono fallback, self-hosted.

## 6. Evaluation: real Claude Code sessions, own harness, no unit tests

**Need.** Know whether a fresh agent follows a published skill, where it gets rejected, and whether the result is good.

**Looked at.** `claude -p` with `--output-format json` returns the result, cost and turn count; `--bare` is the recommended scripted mode and loads skills from `--add-dir`'s `.claude/skills`. The Agent SDK offers the same with callbacks we do not need. `claude plugin eval` runs cases in isolated sessions with regex, file, tool-order and LLM graders, and can mock or allow real MCP servers.

**Call.** `evals/run.ts` as written: a Bun script that renders the skill into a sandbox, runs `claude -p`, then asserts on the run's own history (final status and state, rejected calls, files produced). That is the ground truth, not the agent's chat output. Add an LLM-judge grader for output quality once there are machines worth judging; the API key for that lives in the workspaces-ops session. Move to `claude plugin eval` only if its graders start pulling their weight. The engine's unit tests were deleted; the eval cases cover the same ground against the real agent.

## 7. Guardrails: none until runs show they are needed

Loop caps, transition caps and timeouts were implemented and then removed. The eval history now records every rejected call, so the data to decide them will come from real runs.

## 8. Shape of the repository

One package, no workspace: `src/engine`, `src/server`, `src/ui`, `evals`, `examples`. The engine lives in `src/engine` behind a small store interface.

## Research notes

Full report with sources is at `docs/research-2026-10-19.md`.
