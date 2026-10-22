---
name: plannotator-release
description: Take main from the last tag to a shipped, smoke-tested Plannotator release: scope what ships, QA for regressions, write terse notes, bump the seven version files, build, tag, watch the pipeline, publish the notes, then smoke-test the installs. Use the machine tool to run it; every step is reported and verified against the definition.
---

# Release Plannotator

Machine `plannotator-release` version 1. Take main from the last tag to a shipped, smoke-tested Plannotator release: scope what ships, QA for regressions, write terse notes, bump the seven version files, build, tag, watch the pipeline, publish the notes, then smoke-test the installs.

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
| `repo_path` | string | yes | Absolute path to the Plannotator checkout, on main |
| `version` | string | yes | Version to ship, e.g. 0.28.24 (no leading v) |
| `include_prs` | string | no | PR numbers to merge before shipping, comma-separated. Empty: ship main as it is |

## Requirements checked at preflight

- **on-main-clean**: repo_path is on main with a clean tree (untracked RELEASE_NOTES_*.md files are fine, they stay untracked by design)
  Check: Run `git -C <repo_path> status --porcelain --branch`; ok if the first line starts with `## main` and every other line starts with `?? RELEASE_NOTES_`
- **main-up-to-date**: Local main matches origin/main
  Check: Run `git -C <repo_path> fetch origin` then `git -C <repo_path> rev-list --left-right --count main...origin/main`; ok if it prints `0 0`
- **version-is-new**: The version is not already tagged and is higher than the latest tag
  Check: Run `git -C <repo_path> tag -l v<version>` (must print nothing) and `git -C <repo_path> tag --sort=-v:refname | head -1` (must be lower than v<version>)
- **gh-ready**: gh is logged in and can see the repository
  Check: Run `gh auth status` and `gh repo view --json nameWithOwner` in repo_path; ok if both succeed
- **bun-pinned**: Local bun is the version the release workflow pins (builds made with a newer bun have shipped broken before)
  Check: Compare `bun --version` with the `bun-version:` value in <repo_path>/.github/workflows/release.yml; ok if equal
- **aws-creds** (optional): AWS credentials for the install-scripts bucket (only needed when scripts/install.* changed)
  Check: Run `aws sts get-caller-identity`; ok if it prints an account

## States

Start: `scope`

| state | kind | events → next |
|---|---|---|
| `scope` | task | `scoped` → `qa`, `nothing_to_ship` → `empty` |
| `qa` | task | `clean` → `notes`, `regressions_found` → `patch` |
| `patch` | task | `patched` → `qa` |
| `notes` | task | `drafted` → `bump` |
| `bump` | task | `bumped` → `build` |
| `build` | task | `built` → `tag`, `build_broken` → `patch` |
| `tag` | task | `tagged` → `pipeline` |
| `pipeline` | task | `green` → `publish`, `red` → `pipeline_red` |
| `pipeline_red` | wait | `rerun` (human) → `pipeline`, `give_up` (human) → `pipeline_failed` |
| `publish` | task | `published` → `smoke` |
| `smoke` | task | `passed` → `shipped`, `broken` → `shipped_broken` |
| `shipped` | final (success) | — |
| `empty` | final (success) | — |
| `pipeline_failed` | final (failure) | — |
| `shipped_broken` | final (failure) | — |

### `scope` · Scope the release (task)

Find the latest tag (`git tag --sort=-v:refname | head -1`) and list `git log --oneline <tag>..HEAD`. If include_prs names PRs: for each, wait for its CI and review to finish, merge it on GitHub in a sensible order, then `git pull`. A PR that is not clean waits for the next release; say which and why with `machine.note`. Record whether `scripts/install.sh`, `install.ps1` or `install.cmd` changed since the tag (`git diff --stat <tag>..HEAD -- scripts/install.*`) and whether dependencies changed (`package.json`, `bun.lock`, any `*/package.json`). Do not change code here.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `last_tag` | string | yes |  |
| `commit_count` | number | yes | Commits between last_tag and HEAD after merging |
| `prs_merged` | number | yes |  |
| `install_scripts_changed` | boolean | yes |  |
| `deps_changed` | boolean | yes |  |

Events:

- `scoped` → `qa`: There is something to ship
- `nothing_to_ship` → `empty`: No commits since the last tag

### `qa` · QA for regressions (task)

The checklist is ~/QA/QA.md. Its purpose is one thing: nothing breaks for existing users when this ships. Pick the checks that the diff since last_tag actually touches, and always run these: builds and the main commands; the Pi and OpenCode packages (OpenCode 1 and 2 share one code base); prompt caching unchanged for Pi and OpenCode; npm installs (Pi, OpenCode) behave like the script installs; annotate toolbar keeps every button; remote users still see output URLs. When install_scripts_changed is true, exercise the scripts against an existing install and a clean one. When the diff is large, run three independent sweeps with different angles so nothing is missed. Report each check with `machine.note` as it finishes. Do not grow the list, do not redevelop anything, do not fix here: record what is broken and move on. A regression is a behaviour that worked at last_tag and does not now.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `checks_run` | number | yes |  |
| `regressions` | number | yes | Regressions found in this pass |
| `summary` | string | yes | One line per check: name, result |

Events:

- `clean` → `notes`: No regressions: regressions = 0
- `regressions_found` → `patch`: At least one regression to fix before shipping

### `patch` · Patch what QA found (task)

Fix only the regressions QA listed, in the smallest clean change, with a test where one fits. Land each fix on main the way the repo does it (PR with green CI, or a direct commit when that is the norm), then pull so local main is up to date again. If a fix is not small and clean, do not force it: call `machine.fail` with needs saying what the owner must decide (drop the change, revert the PR, or accept the risk). Then go back to QA; it re-runs only the affected checks.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `fixed` | array | yes | One line per regression fixed, with the commit or PR |

Events:

- `patched` → `qa`: Fixes landed; QA re-checks the affected areas

### `notes` · Write the release notes (task)

Write `RELEASE_NOTES_v<version>.md` at the repo root (if it exists from an earlier pass, update it). Keep it untracked; never `git add` it. The notes are pre-approved: do not wait for review. Follow the release-plannotator skill's structure (follow link, missed-releases table, What's New, install block copied from the previous notes, What's Changed, New Contributors, Community, Full Changelog link) and its writing rule: succinct and terse. Per feature a short heading, one to three sentences on what it does for the user, the PR link. Fixes are one line each under Additional Changes. Credit every contributor, reporter and commenter with bare @mentions, in short lines. No backstory, no hype, no punchlines.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `path` | string | yes | Absolute path of the notes file |
| `features` | number | yes | Number of What's New subsections |

Events:

- `drafted` → `bump`

### `bump` · Bump the version (task)

Set the version in exactly these seven files and no others: `package.json`, `apps/opencode-plugin/package.json`, `apps/pi-extension/package.json`, `apps/hook/.claude-plugin/plugin.json`, `apps/copilot/plugin.json`, `openpackage.yml`, `packages/server/package.json`. Not the VS Code extension. First confirm all seven show the same current version; if they already show <version> from an earlier pass, verify and skip the commit. Commit the seven files alone as `chore: bump version to <version>`. Do not push yet.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `files_changed` | number | yes | Files in the bump commit; must be 7 |
| `commit` | string | yes | Short SHA of the bump commit |

Events:

- `bumped` → `build`

### `build` · Build and check Pi parity (task)

If deps_changed, run `bun install` first. Then, in order: `bun run build:review`, `bun run build:hook`, `bun run build:opencode`, `bun run build:pi`. All four must succeed. Then the Pi parity gate: every local import from the Pi extension's server files is covered by the `files` array of `apps/pi-extension/package.json`; every `../generated/*` import has a copy loop in `vendor.sh`; `cd apps/pi-extension && bun pm pack --dry-run` lists every file the server imports; `generated/` holds every expected file. Fix a parity gap in place (vendor.sh, files array, import path) and commit it. A failing build or a gap you cannot fix in place is a regression: fire `build_broken`.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `builds_ok` | boolean | yes |  |
| `pi_parity` | string (`ok` \| `fixed` \| `not_applicable`) | yes | not_applicable only when the repo has no Pi extension |

Events:

- `built` → `tag`: Four builds green, parity ok
- `build_broken` → `patch`: A build or the parity gate failed and needs a real fix

### `tag` · Push and tag (task)

`git push origin main`, then `git tag v<version>` and `git push origin v<version>`. The tag push starts the release workflow. Releases are immutable: never delete or move a tag, whatever goes wrong after this point. A bad release is fixed by shipping the next version.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `tag` | string | yes |  |
| `commit` | string | yes | Short SHA the tag points at |

Events:

- `tagged` → `pipeline`

### `pipeline` · Watch the release pipeline (task)

Find the run for the tag with `gh run list --workflow=release.yml --limit=3` and watch it to the end (`gh run watch <id>` or poll `gh run view <id>`), posting a `machine.note` as jobs finish. Green means: every job passed, including test, build, smoke-binaries, release-security, attest, release and npm-publish; the GitHub release exists with the binaries, their .sha256 sidecars and the release SBOM; `npm view @plannotator/opencode version` and `npm view @plannotator/pi-extension version` both print <version> (the registry can lag a few minutes; retry before calling it red). On a failure, read the failing job's log and put the job name and the key lines in the note so the owner can decide.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `run_id` | string | yes |  |
| `jobs_green` | boolean | yes |  |
| `npm_versions` | string | yes | e.g. opencode 0.28.24, pi-extension 0.28.24 |

Events:

- `green` → `publish`
- `red` → `pipeline_red`: A job failed; the owner decides whether to rerun or give up

### `pipeline_red` · Pipeline failed: owner decides (wait)

Report the failing job and why in a note. Do not touch the tag.

A human fires the next event from the UI. Report what they need to know with `machine.note`, then stop.

Events:

- `rerun` → `pipeline` _(human only)_: Rerun the failed jobs (`gh run rerun <id> --failed`) and watch again
- `give_up` → `pipeline_failed` _(human only)_: Leave this version unreleased; the fix ships as the next version

### `publish` · Publish the notes and served scripts (task)

Replace the auto-generated release body: `gh release edit v<version> --notes-file RELEASE_NOTES_v<version>.md`. If install_scripts_changed: copy `scripts/install.sh`, `install.ps1`, `install.cmd` to the `plannotator-install-scripts` S3 bucket with the content types the release-plannotator skill lists, invalidate `/install.sh /install.ps1 /install.cmd` on CloudFront distribution E284ON0A27O2H6, then confirm `curl -fsSL https://plannotator.ai/<file> | md5 -q` equals `md5 -q scripts/<file>` for all three. There is no CI sync for that bucket; this is the only way the served scripts update.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `notes_published` | boolean | yes |  |
| `install_scripts` | string (`unchanged` \| `synced`) | yes |  |

Events:

- `published` → `smoke`

### `smoke` · Smoke-test the installs (task)

Two installs, in this order, each followed by a smoke test (`plannotator --version` prints <version>; `plannotator help`, `plannotator review` and `plannotator annotate` start; an existing Inbox store still opens): first install over the existing install with the published install script, then remove Plannotator from the machine and install fresh. Then the agents: load the OpenCode plugin at <version> (OpenCode 1, and 2 if installed here) and the Pi extension from npm; mark one `skipped` only when that agent is not installed on this machine. Set `PLANNOTATOR_BROWSER=none` so no tabs open (`NO_BROWSER` is a test-helper name and does nothing). Leave the machine on <version> and tell the owner to restart Claude Code and the Inbox.

Output payload required on transition:

| field | type | required | description |
|---|---|---|---|
| `upgrade_install` | string (`pass` \| `fail`) | yes |  |
| `fresh_install` | string (`pass` \| `fail`) | yes |  |
| `opencode` | string (`pass` \| `fail` \| `skipped`) | yes |  |
| `pi` | string (`pass` \| `fail` \| `skipped`) | yes |  |
| `summary` | string | yes |  |

Events:

- `passed` → `shipped`: Nothing failed
- `broken` → `shipped_broken`: Something failed on the released build

### `shipped` · Shipped and smoke-tested (final)

Terminal state, outcome **success**. Nothing further to do.

### `empty` · Nothing to ship (final)

Terminal state, outcome **success**. Nothing further to do.

### `pipeline_failed` · Release abandoned at the pipeline (final)

Terminal state, outcome **failure**. Nothing further to do.

### `shipped_broken` · Released, but smoke tests failed: open an issue and start the next version (final)

Terminal state, outcome **failure**. Nothing further to do.
