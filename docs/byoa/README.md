# Connect your agent (BYOA) · design, 2026-10-21

Status: proposed. Nothing built yet. The clickable mock is `mock.html` (open in a browser); screenshots in `shots/`.

## The promise

Your own agent, where it already runs, with your login and your repo, draws the machine in the designer. Nothing runs on our server. Works the same on the local server and on the hosted one.

Today "Describe it" spawns an agent on the server over ACP. That is fine on a laptop and impossible hosted (the server would be running every team's agents with one login). It also gives the agent a scratch folder instead of your repo. Connect your agent replaces that transport: the designer talks to a session you already have open.

## What the person does

1. In the terminal, once per computer: `machine login <url> <mk_key>` (the local server needs no key), then install the plugin for their agent (one line, below), then start the agent in the repo the machine is about.
2. In the designer, New machine shows "Connect your agent" with Claude Code, Pi, OpenCode (and "Other, MCP: soon"). Picking one shows the two lines to run and "Waiting for Claude Code…".
3. The plugin's first poll turns that into `Claude Code · ~/code/acme · connected`. The composer wakes up.
4. They type "triage the issue, fix it, run the tests, open a PR; a person approves; merged is the end". The message enters their agent's session as a turn. The agent calls `draft`; the graph draws beside the chat, exactly as today. Its short notes come back through `say`. Tool rows read "Drafted · 5 states · clean".
5. They keep talking from the designer or from the terminal; both reach the same session and the same draft. Publish from the designer when it looks right.

If the terminal is closed, the status dims to "last seen 2 min ago" and a message waits until the agent polls again. Two terminals on the same machine: the picker lists both with their folders; the person picks.

## How it works

```
designer (browser)  ──SSE /events──▶  machine server  ◀──long-poll /api/connect/poll (bearer)──  plugin in the agent
      │ POST prompt                        │                                                        │
      └────────────────────────────────────┤ holds the message ≤ 25 s, hands it to the poll ───────▶│ enters the session as a turn
                                           │                                                        │
                                           │ ◀── MCP tools/call draft | get_draft | say ────────────┘ (the plugin's one tool, proxied)
                                           └── checks the draft, emits author.draft → graph redraws
```

Same shape as the Plannotator Inbox connection the owner pointed at, which has been reviewed and proven live on all three hosts (`research/reviews/REVIEW-PLANNOTATOR-INBOX-{claude-code,pi-opencode}-2026-10-07.md` in the workspaces repo). Rules carried over from those reviews:

- Never interrupt a running turn: a message waits until the session is idle, then goes in as a turn. Nothing aborts.
- Exactly one delivery per message (a claim), and the process the person used last is the one that delivers when two share a session.
- The tool is registered once at session start and never changes under a running session. With no `machine login`, nothing is registered and no request is made: a person who never connected sees byte-identical model requests.
- The poll is held at most 25 s; backoff 5 to 60 s, never giving up; credentials re-read on every call, never cached.

### Each host, with the facts from the Plannotator code

| Host | Mechanism | Install | Tool | Wake (message → turn) |
| --- | --- | --- | --- | --- |
| Claude Code (CLI 2.1.287+) | plugin with a hooks module (`hooks.json` "modules") | `/plugin install machine --marketplace backnotprop/machine` (Claude Code 2.1.275+), restart | `$.tool.register("machine", …)`, calls proxied with `$.http.fetch` | `$.prompt.submit(text)` when idle; `$.session.append` to drop into a running turn (2.1.301+) |
| Pi | extension package | `pi install npm:@backnotprop/pi-machine` | `pi.registerTool`, inactive until the first interactive `session_start` | `pi.sendUserMessage(text, { deliverAs: "followUp" })` once `ctx.isIdle()`; `pi.on` listeners registered once at load |
| OpenCode 2 | plugin in `opencode.json`: `"plugin": ["@backnotprop/opencode-machine"]` | `tool()` registration | `client.session.prompt({ id, text, delivery: "queue" })` once idle; OpenCode 1 gets the tool only, no wake |
| Other agents | plain MCP (`claude mcp add`-style) | works for `draft` today | no wake until the MCP Events spec lands; shown as "soon" |

The three plugins share one small link (`plugins/shared/link.ts`: poll, claim, wake text, tool shape), like Plannotator's `agent-link.ts`; the Claude Code one re-implements it over the engine's `$` because a hooks module can import only its own folder.

## What changes in the product

- `src/server/connect.ts` (new, ~250 lines): connected agent sessions (host, name, folder, last poll, busy) in memory; a per-session message queue; `POST /api/connect/poll` and `POST /api/connect/event` behind the same bearer as `/mcp`; the designer binds to one agent session.
- `src/server/author.ts`: a session gets a transport, `acp` (today) or `connected`. `prompt()` enqueues instead of calling ACP; the MCP tools `draft_machine`, `get_draft` and a new `say` find the designer session by the calling agent session instead of `?author=`. Events to the UI are unchanged.
- `src/ui/describe.tsx`: the agent pick becomes the connection pick (connected sessions first, with folder and a green dot; in local mode also "Start Claude Code here" for the ACP path); a connect card in the empty chat; a dimmed state when the agent has not polled for 30 s. Graph, tool rows, hand edits and Publish untouched.
- Hosted: describe-it unhidden, since nothing spawns on the server any more.
- `plugins/claude-code`, `plugins/pi`, `plugins/opencode` in this repo, each proven with a live run of the real host (PTY for Claude Code, RPC for Pi, the packed plugin for OpenCode 2), no mocks.

## Order of work

1. Server + UI with the connect flow, proven by a fake plugin (a 30-line script that polls and drafts). The mock becomes real.
2. Claude Code plugin, live in a real session, end to end: type in the designer, watch the graph.
3. Pi and OpenCode.
4. Hosted: unhide, the connect card shows the login line with a key.

## Decisions for the owner

1. **Keep "Start one here" (the ACP spawn) on the local server?** Recommendation: keep it in local mode only as the second item of the picker; hosted shows connected agents only.
2. **Other agents over MCP now or later?** Recommendation: list as "soon" and wait for MCP Events, as you said. A polling `wait_for_designer` tool would be about 40 lines if you want a stopgap.
3. **Package names and the marketplace.** The Claude Code plugin needs a GitHub repo for `/plugin marketplace add`, and Pi and OpenCode need an npm org. This repo is not on GitHub yet.

## Built (2026-10-21, afternoon)

What exists now, all proven against the real hosts, nothing mocked:

| Piece | Where | Proof |
| --- | --- | --- |
| Server: connected agents, queue, poll, event; MCP tools find the designer session by `?host=&session=` | `src/server/connect.ts`, `src/server/author.ts`, `src/server/main.ts` | `docs/byoa/scripts/e2e.mjs` (Playwright, with `plugins/fake/poll.ts`), shots `docs/byoa/shots/live-*.png` |
| UI: connect card, picker with connected sessions, "waiting for … · last seen", queued messages drain on reconnect | `src/ui/describe.tsx`, `src/ui/api.ts`, `src/ui/styles.css` | same |
| Claude Code plugin (hooks module) | `plugins/claude-code/` | `docs/byoa/scripts/live-claude.py`: real Claude Code 2.1.306 in a pty; prompt typed in the designer → turn in Claude Code → two `draft_machine` calls → 7 states drawn + a note, 43 s |
| Pi extension | `plugins/pi/` | `docs/byoa/scripts/live-pi.py`: real Pi 0.85.1; the session connects in 2 s and the designer's message enters it as a turn. The model step failed on this machine: every Codex model answers "not supported when using Codex with a ChatGPT account", which is the owner's Pi login, not the extension |
| OpenCode plugin (OpenCode 1 entry + OpenCode 2 entry, shared `link.ts`) | `plugins/opencode/` | `docs/byoa/scripts/live-opencode.py`: real `opencode serve` 1.18.23 loads the plugin from `.opencode/plugin/`, the tool is listed, the session connects in 2 s, the designer's message enters it as a prompt. The model step failed: the OpenCode Zen key on this machine has expired. OpenCode 2 is typechecked against `@opencode/plugin` 2.1.2 only; no OpenCode 2 binary is installed here |

Rules carried into the code, from the Plannotator reviews: one tool per host (`machine_designer` with `action`), long-poll 20 s against a 25 s server hold, 1 s tick, 5–60 s backoff that never gives up, a message enters only after two idle ticks, never into a running turn, silent without `~/.machine/credentials.json`. Not carried: claim/lease files for exactly-once across two processes on one session (v1 has one process per session).

Two things to know:
- **The tool is always on.** Pi and OpenCode send every tool definition with every request; ours is one small tool, so it stays registered rather than toggling per session.
- **"Looks busy forever".** A host that drops its end-of-turn event would leave the designer showing "drawing". The server only trusts `busy` from the plugin's own poll and events; the UI falls back to "last seen" after 30 s without a poll, so a dead plugin never looks alive.

Still open: the owner's three decisions above (ACP keep, MCP-only agents, names/org/GitHub), publishing the packages, LICENSE and icon for the Claude Code plugin, and the hosted unhide.

## Decided (2026-10-21, later)

- ACP spawn: kept, local only, as the second item of the picker ("Or let machine start Claude Code here" on the card).
- Other agents over MCP: "soon", until MCP Events lands.
- Names: GitHub `backnotprop/machine` holds the Claude Code marketplace (`.claude-plugin/marketplace.json` at the repo root; install is one line, `/plugin install machine --marketplace backnotprop/machine`), npm `@backnotprop/pi-machine` and `@backnotprop/opencode-machine`.
- The connect card follows the Interfere system: Card (subtle surface, `--s-default`, 12px), host tiles as Choice cards (1px `border-default`, 10px), the install lines as one Code Card (container surface, header with "Copy all", 0.5px dividers, transparent 24px copy buttons, mono 12/20), and the system's Classic spinner for "Waiting for …". Shots: `docs/byoa/shots/card-{light,dark}[-lines].png`.

## Changed (2026-10-21, evening): where the conversation sits

The owner does not want the chat as a side column. Now (`src/ui/describe.tsx`, `dock-*` in `styles.css`): the conversation is a popup floating over the bottom of the stage, centred, by default (popup surface, `--s-extra-large`, 12px); the graph is centred in what is left above it. "Move to side" puts it back in the 420px column; "Manual" removes it (no agent is started, the graph is drawn by hand; "Start with a first step" on an empty stage; the problems alone float when there are any; "Ask an agent" in the page actions brings it back). The choice is kept in `localStorage` (`machine:describe:dock`). Screenshots: `shots/dock-{float,side,off}[-empty].png` from `scripts/shot-dock.mjs`; `scripts/e2e.mjs` still passes.

## Changed (2026-10-21, evening): connecting from the agent menu

The connect card (four host tiles, then the lines) took most of the floating panel and said what the agent picker already says. Now the picker in the composer is the one place: its menu lists the connected agents, the local ones machine can start, then under "Connect your agent" the hosts (Claude Code, Pi, OpenCode; Other (MCP) marked soon). Picking a host shows only the two lines (Code Card with copy) and "Waiting for Claude Code…" with Cancel where the intro text was; when the plugin polls in, the picker itself shows the agent, a green dot and its folder. With nothing connected the trigger reads "Connect your agent" and the intro says to pick it below. `scripts/e2e.mjs` and `scripts/shot-card.mjs` drive the menu (`.agent-menu button[data-host=…]`).

## Changed (2026-10-21, evening): model and effort for a connected agent

The pickers the ACP path always had (model, effort) now exist for a connected agent too. Contract: the plugin's poll carries `options: [{ id, name, value, options: [{ value, name }] }]` (what its host lets it set, and what is in force); a delivery carries `set: { model?, effort? }` (what the person picked in the designer), applied by the plugin right before the message enters. Server: `connect.ts` keeps the options on the agent and tells `author.ts` (`hooks.options`), which turns them into the session's `config`; `configure()` on a linked session records the choice (`chosen`) and the next hand-off sends it. Per host: Claude Code runs `/model <alias>` and `/effort <level>` through `$.command.run` (it cannot read what is in force, so the picker shows the name until the designer sets one); Pi offers every model its registry can reach plus the seven thinking levels and applies them with `pi.setModel` / `pi.setThinkingLevel`; OpenCode 1 offers the models of its providers and puts the chosen one on the prompt (no effort there); OpenCode 2 offers nothing yet. `scripts/e2e.mjs` proves it with the stand-in: Sonnet shows, Opus is picked, the plugin prints `set model=opus` before drawing.


## Changed: Machine is on the BYOA wire (server side)

`src/server/byoa.ts` mounts `@byoa/server` (linked from /Users/ramos/byoa, `bun link`) on Hono: `/.well-known/byoa`, `/byoa/*`
(pairing, sessions, the connector's long poll) and `/mcp/author` (the authoring tools, draft_machine / get_draft / say, for a
connected agent: its connection token names the person, `_meta["dev.byoa/session"]` the session). Pairings and connections
are in Machine's database (a restart keeps them; the connector registers its session again under the same id). Local: a
pairing is approved on the spot, so `/byoa connect http://localhost:7420` in the agent is one command. Hosted: the person
BYOA sees is the signed-in member's team, so the whole team sees the team's agents.

`src/server/connect.ts` is one list from two wires: BYOA sessions (from the SDK's subscribe; a message goes out with
`byoa.send()`, the hub keeps it even for an agent that stopped polling, and the connector holds it until the session is
idle; the message's own events end the designer's turn: done, error, interrupted, withdrawn; Stop is `byoa.interrupt()`)
and, until the byoa connectors for Claude Code, Pi and OpenCode land, the machine plugins on `/api/connect/poll`. The
designer tells them apart by the id (`ses_…` is BYOA). Settings arrive as choices with names, so the pickers show what the
host shows.

Proof: `docs/byoa/scripts/fake-connector.ts`, a stand-in agent on the real `@byoa/connector-core` with a scripted host, and
`docs/byoa/scripts/e2e.mjs` driving the designer against it: pair in one command, auto-pick, the model choice applied before
the turn, the draft through the proxied `machine` tool, away (60 s) → the message waits → back with the same session id →
it goes out. Shots `docs/byoa/shots/live-*.png`. Still to do: the setup lines in the designer's connect strip name the old
plugins; they change to the byoa connector's install commands once those exist.

Live on real Claude Code 2.1.306 with the byoa connector (`docs/byoa/scripts/live-claude.py`, log in /tmp/live-claude.log):
`/byoa connect http://localhost:7420` connects in one command; after `/clear` the proxied `machine` tool is in the session;
a designer session bound to it with haiku and low effort picked; the prompt enters as a turn, Claude Code asks permission
for the tool twice (draft_machine, say), both land, the draft has six states and no problems, and the status line reads
`[Haiku 5.5] … low · /effort` with the `BYOA · Machine` band. The Claude Code plugin (plugins/claude-code) and the fake
plugin are retired; plugins/pi and plugins/opencode stay on `/api/connect/poll` until their byoa connectors pass.

Pi and OpenCode 2 live on the byoa connectors, offline (`docs/byoa/scripts/live-pioc.ts pi|opencode`, with Machine's echo
model `docs/byoa/scripts/echo-machine-model.ts` standing in for a logged-in model; logs `docs/byoa/live-pi-byoa.log`,
`docs/byoa/live-opencode-byoa.log`): Pi 0.85.1 connects in one command, `/new` brings the tool, the pickers show Pi's own
setting names (Off … Extra high), a setting picked here is applied, draft and note land in 2 s, the provenance line is on
screen. OpenCode 2.1.2 (`--standalone`, the connector folder in `plugins`): connect, a restart and a first prompt bring the
tool, the model picker lists OpenCode's models by name, draft and note land in 2 s. OpenCode 1 is not supported by the byoa
connector (a plugin there cannot start a turn); the old Machine plugin did support it, so an OpenCode 1 install has to move
to OpenCode 2 to connect.

All plugins are gone (`plugins/*`, the `/api/connect` poll, the `?agent=` MCP binding); `src/server/connect.ts` is the wire
only. The designer's connect strip prints the local connector lines per host until byoa-ops publishes.
