# machine

Processes you draw. Agents follow them. A tool keeps them on the rails.

A **machine** is a set of states with named events between them, drawn in a web UI or described to an agent in a sentence. Publishing one produces a skill (`SKILL.md`) an agent loads and a definition the server enforces. The agent drives a **run** through MCP tools; every transition is validated against the definition before it counts, and the UI shows runs live. Credentials a step needs are stored on the server and leased to the agent's commands for the length of the step, never pasted into the conversation.

Licence: FSL-1.1-MIT (see `LICENSE`). Not yet published; this is the source as it runs on the author's machine.

## Run it

Needs [Bun](https://bun.sh) 1.3 or later.

```
bun install
bun run build                                                # the UI into dist/
bun src/cli.ts serve                                         # http://localhost:7420, data in ~/.machine
bun src/cli.ts add examples/changelog-draft.machine.json     # or draw one in the UI
bun src/cli.ts publish changelog-draft                       # writes ~/.claude/skills/changelog-draft/
claude mcp add --transport http machine http://localhost:7420/mcp   # once, so the agent can drive runs
```

Then, in a Claude Code session: "run the changelog-draft skill on this repo, version 0.2.0". Watch it at http://localhost:7420.

Local mode has no sign-in: everything belongs to one team, "local". The server binds to localhost only.

## Describe a machine

Open New machine and say what the process is; an agent drafts the graph beside the conversation and you publish when it looks right. Two ways the agent can be yours:

- **Connect your agent.** Your own Claude Code, Pi or OpenCode, running in the repo the machine is about, with your login. Run `bun src/cli.ts login` once (the local server needs no key), then the lines the designer shows for your agent: install the byoa connector (`pi install npm:@plannotator/byoa-pi`, `opencode plugin add @plannotator/byoa-opencode`, or in Claude Code `/plugin marketplace add plannotator/byoa` and `/plugin install byoa@byoa`) and, in the agent, `/byoa connect http://localhost:7420`. The designer and your terminal then share one session.
- **Start it here** (local only). The server spawns an agent over ACP in a scratch folder: Claude Code through `@zed-industries/claude-agent-acp`, Gemini CLI `--acp`, `opencode acp`, or Codex through `@zed-industries/codex-acp`, whichever is installed. Pick it in the Agent menu. `curl localhost:7420/api/author/agents` lists what the server found.

Either way the agent only drafts. It never writes files or publishes; you do.

## Credentials

A step can declare credential slots (`credentials` on a state). On the machine page the team binds each slot to a stored credential; the engine refuses to enter the step until every slot is bound and verified. During the step the agent gets them three ways, strongest first:

```
bun src/cli.ts run <run_id> -- gh pr create ...     # leases the live credentials into that one command's environment
```

The `request` MCP tool makes an HTTP call with the credential attached server-side. The `credential` tool hands the raw fields over, only for slots the machine marks `handoff: true`, and the timeline records it. Stored values are encrypted with `MACHINE_SECRET_KEY` or a key file the server writes to `~/.machine` on first start.

## Hosted mode

Set `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `WORKOS_COOKIE_PASSWORD` and `MACHINE_PUBLIC_URL` and the same server runs for teams: AuthKit sign-in on the UI, `mk_` keys on `/mcp`, members see their team's runs. Publishing then bumps the version and the member runs `bun src/cli.ts login --url <url> <mk_key>` and `push` to get machines in. `docs/hosted/` has the design. Unset, none of it loads.

Other settings: `PORT` (7420), `MACHINE_HOME` (`~/.machine`), `MACHINE_SKILLS_DIR` (`~/.claude/skills`), `MACHINE_AUTHOR_MCP=stdio` to give ACP agents the MCP over stdio instead of HTTP.

## Check it

```
bun evals/run.ts                      # every case, each a fresh Claude Code session against the MCP server
bun evals/run.ts changelog-happy 5    # one case five times, with the LLM judge
bun evals/run.ts release-dry          # the Plannotator release machine against a stand-in repo with stub gh and npm
bun evals/run.ts tldraw-tick-red      # one red tick of the tldraw release loop: gate, fixer PR, land, re-gate, dispatch
bun evals/run.ts code-review-happy    # the code review loop: generate, self-verify, second agent, checks, ship
bun evals/run.ts changelog-unblocked  # a run blocks, a person unblocks it with a note, a fresh session resumes and obeys the note
bun evals/run.ts ship-fix-credentials-missing   # the engine refuses a step whose credential slot is unbound
bun evals/watch.ts live 7600 120      # one browser session watches a run arrive over SSE
bun evals/author.ts 7420              # Playwright authors a machine through the editor and publishes it
bun evals/describe.ts [claude|gemini|opencode|codex]   # an ACP agent drafts ship-a-bug-fix from one sentence, then adds a step on request
bun evals/describe-ui.ts 7420         # the same through the designer in a browser
```

Evals assert on the run's own history in SQLite (final state, rejected calls, files produced), not on what the agent says. Browser checks need Playwright with Chrome: `bunx playwright install chrome`.

## Read

- `SPEC.md` what it is and why the tool, not the model, owns state
- `DESIGN.md` the visual direction and tokens
- `DECISIONS.md` the stack, with the weighing and sources
- `PLAN.md` milestones and the check each one passed
- `docs/byoa/README.md` connect your agent, the wire and the three connectors
- `docs/hosted/` teams, sign-in, credentials, the hosted architecture
- `film/LOOK.md` the launch film's look and sound recipe

## Layout

```
src/engine      engine.ts (validation, tool surface), sqlite-store.ts, render-skill.ts, providers.ts (credential recipes), crypto.ts
src/server      main.ts: Hono on Bun, /mcp for agents, /api and /events for the UI, static UI
                byoa.ts + connect.ts: connect your agent (the BYOA wire)
                author.ts: the authoring tools and the ACP client behind "start it here"; author-prompt.md its preamble
                credentials.ts: slots, binding, lease, proxy, hand-off; auth.ts: hosted sign-in and keys
src/ui          Vite + React: runs, run, machines, editor, describe, credentials, team
src/cli.ts      serve | add | publish | render | runs | login | run | push
evals           run.ts (agent evals), describe.ts, describe-ui.ts, watch.ts, author.ts (browser checks), cases/, fixtures/
examples        machine definitions and their rendered skills
schema          JSON Schema for definitions and runs
docs            design rounds, screenshots, research, the byoa and hosted designs
film            the launch film: film.html draws every frame from time, render.mjs shoots it, mix.ts and music.ts the sound
```

Dev loop for the UI: `bun src/cli.ts serve` in one terminal, `bunx vite` in another (proxies `/api`, `/events`, `/mcp` to 7420). `bun run build` writes `dist/`, which the server serves. Restart the server after editing `src/server/` or `src/engine/`.

The BYOA wire and connectors live in [plannotator/byoa](https://github.com/plannotator/byoa); Machine uses the published `@plannotator/byoa-server` and `@plannotator/byoa-protocol`.
