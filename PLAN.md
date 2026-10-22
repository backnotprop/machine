# Plan

Each milestone ends with one check that uses a real agent or a real browser, never a mock. The milestone is not done until the check passes.

## M0 · done

Engine, skill renderer, CLI, two example machines, JSON schemas, design direction, screen mock, eval harness with two cases. Caps and unit tests removed.

Check: `bun evals/run.ts` runs both cases through real Claude Code sessions. See `evals/last-*.json`.

## M1 · the server · done

- `src/server`: Hono on `Bun.serve`, SQLite store replacing the JSON files, MCP endpoint at `/mcp` with tools `preflight`, `begin`, `transition`, `note`, `fail`, `get`, `list_machines`.
- `/api/runs`, `/api/runs/:id`, `/api/machines`, human actions (`transition` as human, `unblock`, `cancel`), `/events` SSE.
- `machine serve` starts it; `machine publish <id>` writes `SKILL.md` and JSON to a skills directory.
- Register in Claude Code: `claude mcp add --transport http machine http://localhost:7420/mcp`.
- Eval harness switches from the CLI to the MCP endpoint via `--mcp-config`.

Check: both eval cases pass over MCP, and the rendered skill no longer mentions a CLI. Passed 2026-10-19: happy path 3 moves / 13 turns / 0 rejected / $0.80; blocked path stayed blocked, 0 rejected, no workaround.

## M2 · runs and run screens · done

- Vite + React + Tailwind in `src/ui`, served by the same process.
- Runs table and run view exactly as in `docs/mock.html`: now card, history, machine map. Human events and unblock work from the UI. SSE keeps it live.

Check: start the changelog eval, watch it move through the states in the browser as it happens. Then open a ship-fix run waiting at `await_review` and fire `approved` from the UI.
Passed 2026-10-19 with `evals/watch.ts`: one browser session, no reloads, saw collect → draft → self_review → ready as the agent worked; clicking `[ approved ]` moved the page and the server to `merged`, last history actor `human`. The ship-fix run was seeded over MCP rather than produced by an agent, because a real run would push a PR to GitHub.

## M3 · machine editor · done

- Outline editor with in-place editing, dagre-laid graph, validation line, publish.
- "View skill" pane showing the rendered markdown.

Check: build `changelog-draft` from an empty machine in the UI, publish it, run the eval case against the published skill, pass.
Authoring half passed 2026-10-19 with `evals/author.ts`: Playwright drives the real editor from a blank machine, publishes, and the published definition equals `examples/changelog-draft.machine.json` key for key. Two editor bugs found and fixed on the way: the graph crashed on events pointing at states not yet written (now drawn as dashed placeholders), and blank machines started at version 0.
Eval half passed on re-run: `EVAL_MACHINE=<published machine.json> bun evals/run.ts changelog-happy` → succeeded / ready, 3 moves, 12 turns, 0 rejected, $0.70. The first attempt had died with a Claude Code session exit (code 1, no stderr) at self_review; the second ran clean.

## M4 · make it earn its keep

- Author three machines for your own recurring work. Done, five in `examples/`: `changelog-draft`, `ship-fix`, `plannotator-release` (10 working states plus 4 finals, one human gate at a red pipeline), `tldraw-release-loop` (one tick of the desktop release loop from your screenshot: check, gate, dispatch, fixer, land, needs-a-person; the loop's "waiting" node is the gap between runs, so one run is one tick and the last processed head lives in `.git/release-loop-last`), and `code-review-loop` (generate, self-verify, second agent, checks, one all-clear decision, human review as a wait state). The release machine is drawn from how releases actually run, not just the skill: the release-plannotator skill, the big prompt you reuse with it (QA list at ~/QA/QA.md, notes pre-approved, smoke-test over an existing install then fresh, OpenCode and Pi), and the agent's own reports from 0.28.18 to 0.28.23. An earlier 18-state draft taken from the skill alone had no QA and no smoke step; it is deleted.
- Run each at least five times. Read every rejected call and every blocked run. Fix wording in the definition, not in the engine.
  changelog-draft, 5 runs on 2026-10-19 (`bun evals/run.ts changelog-happy 5`): 5/5 succeeded at ready, 3 moves each, 0 rejected calls, 13 or 14 agent turns, 50 to 109 s, about $1.15 per run including the judge; the judge passed every CHANGELOG.md (covers both user-visible commits, omits the chore, correct footer). No drift to act on yet.
  plannotator-release, 4 dry runs on 2026-10-19 (`bun evals/run.ts release-dry`, a stand-in monorepo with stub gh and npm, its own bare origin, an install script that installs into the fixture): run 1 blocked at `smoke`, correctly, because the fixture said not to touch the real OpenCode and Pi while the machine allows `skipped` only when they are not installed; the fixture prompt now says to record them skipped. Runs 2 to 4: 3/3 succeeded at shipped, 9 moves each on the same path, 0 rejected calls, 33 to 37 turns, 199 to 324 s, about $2.85 per run; the judge passed every notes file (terse, bump commit touched 7 files, tag on it, VS Code extension untouched). Not yet run for real: the next real release should go through it from the plannotator-ops session.
  tldraw-release-loop, 5 runs on 2026-10-19 (`bun evals/run.ts tldraw-tick-red`, a stand-in repo whose newest commit breaks `pnpm check`, stub gh whose `pr merge` really merges into the fixture's origin): 5/5 released, 7 moves each on the same path (tick, new_commit, red, pr_opened, merged, green, released), 0 rejected calls, 27 to 30 turns, 106 to 159 s, about $1.65 per run; the judge passed every fix (sub() restored, branch named huppy/release-fix-<sha>, landed by merge, nothing unrelated touched).
  code-review-loop, 5 runs on 2026-10-19 (`bun evals/run.ts code-review-happy`, a Bun project with tests and a lint script; the second reviewer is a `claude -p` with the diff): 5/5 shipped, 6 moves each on the same path, 0 rejected calls, 17 to 19 turns, 96 to 164 s, about $1.47 per run; the judge passed every result (clamp with the RangeError, re-export, tests including lo > hi, landed through a PR merge). The second reviewer found minor findings every time (NaN handling, test message); the all_clear decision took them as not worth a pass each time, which is a wording to watch when the loop runs on real work.
- Add an LLM-judge grader for output quality where the file-and-state checks are not enough. Done: a `judge` block on a case runs a tool-less Claude Code session over the produced files with a yes/no schema; see `evals/cases/changelog-happy.json`.
- Only now decide which guardrails, if any, the data asks for.

Check: three machines, five runs each, zero rejected calls on the final pass, and you reached for the UI instead of the terminal to see what an agent was doing.
  Found by the UI audit the same day: a person's note on unblock was stored but never reached the agent. Fixed in the engine: the next card after an unblock or a human-fired event carries `human_note`, the skill says to read it first, and `bun evals/run.ts changelog-unblocked` proves it (a run blocks on the missing author file, the harness unblocks it with a note asking for a different heading and only one of the two commits, a fresh session resumes from `get`: succeeded at ready, 3 moves, 0 rejected, 16 turns, 88 s, $1.52, judge passed on all four asks).
Status 2026-10-19: four machines at five runs each (changelog-draft, plannotator-release in dry run, tldraw-release-loop, code-review-loop), zero rejected calls in all 20; no guardrail asked for by the data. Open: a real plannotator release through the machine (you said not yet, you want hands on the system first), and the last part of the check, which only you can do.

## Not planned

Hosted multi-user service, auth, sub-machines, parallel states, a Stately-style canvas, notifications beyond the inbox.

## M5 · authoring for people, not form-fillers

Three ways to make a machine, in the order people should meet them. All three write the same definition, share the same validator and the same graph, and publish the same way.

1. **Describe it (primary).** The person types what they want in plain words; an agent drafts the machine and the graph builds on screen as it works; the person keeps talking and the draft changes in front of them. The app is an ACP client (Agent Client Protocol, agentclientprotocol.com): it spawns a local ACP agent as a subprocess over stdio (Claude Code through Zed's `claude-agent-acp` adapter, Gemini CLI, OpenCode, Codex through `codex-acp`), gives it this server's MCP with two authoring tools (`draft_machine`, `get_draft`), and streams its messages and each validated draft to the UI over SSE. The engine's `validateMachine` judges every draft, so what appears is always a legal machine. The person publishes from the UI; the agent never publishes.
2. **Draw it (secondary, for anyone).** On the graph: a plus on a node adds the next step already connected; drag from one node to another draws an event and names it inline; click a node to edit title and instructions in place. No groups, swimlanes or free canvas. The inspector stays for the rest.
3. **Edit the JSON (last resort).** The raw definition as a third face of the editor stage, validated as you type.

Assumptions until the owner says otherwise: default author is Claude Code when `claude` is installed, else the first of gemini, opencode, codex found on PATH; describing works for new machines and for revising a published one; node dragging is left out because the graph lays itself out.

Check: a person who has never seen the app describes a real process in two or three sentences and gets a runnable machine with no form filling, then adds one step by hand on the canvas, in a few minutes. Mechanically: `bun evals/describe.ts` drives the authoring API with a fixed description and asserts the final draft validates with zero problems, has the states, the human wait and the success final the description asked for, and that a second prompt revises it without breaking it; `evals/author.ts` keeps passing for the manual path.
Status 2026-10-20, describe-it backend: `src/server/author.ts` is an ACP client (`@agentclientprotocol/sdk` 2.0.0). Routes under `/api/author` (agents, sessions, prompt, cancel, delete); MCP tools `draft_machine` and `get_draft` on `/mcp`, tied to a session by `/mcp?author=<id>`; events `author.message`, `author.tool`, `author.draft`, `author.turn` on `/events`; preamble in `src/server/author-prompt.md`. All four agents are detected here and all advertise HTTP MCP. The stdio shim was checked separately by forcing it on Claude (`MACHINE_AUTHOR_MCP=stdio`). `bun evals/describe.ts` passed twice with Claude Code (the default) through claude-agent-acp 0.23.1. Last run: describe, 2 drafts (0 and 0 problems), 38 s, 8 states. Revise, 1 draft (0 problems), 24 s, 9 states, new state test → update_changelog → open_pr. The first draft was clean both times. The other agents start but cannot run a turn on this machine because of their accounts. Gemini: Google login refused upstream for ACP clients. OpenCode: expired API key. Codex: the configured model `gpt-6.1-sol` is not available on a ChatGPT account. `bun evals/run.ts changelog-happy` still passes (3 moves, 0 rejected, $1.12). Open: the UI panel, and the person-in-the-loop half of the check.

Status 2026-10-20, model and effort: the composer shows the agent's ACP session config options (`configOptions` from session/new; `session/set_config_option` to change one) for categories model and thought_level, plus an "effort" choice for Claude Code, whose adapter (claude-agent-acp 0.23.1) has no thought_level option and takes effort only at start-up (`_meta.claudeCode.options.effort`, the CLI's `--effort`). So the session starts when the screen opens, model changes any time between turns, and effort relaunches the agent before the first prompt and is fixed after it. Route `POST /api/author/sessions/:id/config {id, value}`; event `author.config`. Checked: the spawned CLI carries `--effort low`; the CLI's own transcript for the session shows `claude-haiku-5-5` after picking Haiku; `bun evals/describe.ts` (32.6 s / 20.6 s) and `bun evals/describe-ui.ts` (7 then 8 nodes) pass. The server now kills its agent processes on SIGINT/SIGTERM; five orphans from earlier restarts were found and killed.
