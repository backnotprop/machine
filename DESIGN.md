> **2026-10-21: the visual layer now follows the Interfere Design System.** Tokens, type, radii, surfaces and components are in `docs/design/DESIGN.md`, which supersedes the Tokens and component styling sections below. The principles here (graph as hero, no tables, colour on blocks, newest first) still hold.

# Design

Rewritten 2026-10-20 (UI v5: the v4 direction made into one system). The earlier admin shell (sidebar, bordered cards, tables, status pills with coloured dots) is gone. The owner asked for something specific to this product: the machine graph as the hero, a blocked run shown *on the machine*, no ping dots or red/green circles, no tables, history newest first, and a layout that uses the width. v5 keeps that direction and closes the gaps an audit found (`docs/ui-v5/audit/`): one token set, one component per job, one status language, one container.

The idea under every decision: **a run is a path through the machine, and the screen shows it the way the mark does: blocks on a path, one lit.** The same picture works at three sizes:
- the full graph on the run page and in the editor,
- a glyph on every run row,
- a silhouette on every machine row.

Screens are in `docs/ui-v5/after/`.

## Principles

1. **The machine is the stage.** On the run page and in the editor, the graph is the largest object. It sits in a framed surface called the frame. The graph never draws type smaller than its tokens: when a machine is wider than the frame, the frame pans instead of shrinking it.
2. **One thing asks for you per screen.** Runs: the runs that need you. Run: the ask, inside the frame. Machines: the list. Editor: the graph and the selected state.
3. **Colour lives on blocks, not on words.** Colour appears only on:
   - blocks and glyphs;
   - the graph's lit node and walked edge;
   - the HUD;
   - the light at the left edge of a row that needs you.

   Text is ink everywhere. The one exception is the status word in the readout (`.readout .rs`), which keeps the tone.

   What each colour means: blue = the agent is working (and the editor's selection), red = blocked, amber = a person decides (and, in the editor, unwritten or invalid states), white block = succeeded, muted red = failed. Everything else is graphite and ink.
4. **Soft, not boxed.** Layered near-black surfaces, large radii, pill controls. No 1px boxes around content. The one hairline (`--color-hair`) appears only as a divider inside a surface and under the bar once the page scrolls.
5. **Motion only for change.** A step arriving over SSE draws its edge and pulses the lit block once. The HUD fades in when a run blocks and fades out in the colour it came in with. Pages settle in 6 px. Nothing loops. Under reduced motion everything is instant, including scrolling.

## Tokens (`src/ui/styles.css`, `:root`)

Plain CSS custom properties. There is no Tailwind; the file starts with a small reset.

```
surfaces   page #08080a · stage #0e0e11 (the frame) · raise #15151a (surfaces inside the frame, row hover)
           raise-2 #1c1c22 (fields, controls) · raise-3 #25252c (control hover, selected) · field-focus #202027
           hair #ffffff0d (rare divider)
ink        ink #ededef · ink-2 #a3a3ad · ink-3 #85858f (lowest ink for text: 4.6:1 on raise-2)
           ink-4 #4a4a53 (marks only: separators, ellipsis dots, ticks, never text) · on-light #0a0a0c
graphite   graphite-lo #2e2e35 (finished walks, thumb edges) · graphite #3a3a42 (walked blocks) · graphite-hi #55555e
status     blue #3b82f6 / hi #93c2ff · red #ff5d62 / hi #ffa3a5 · amber #f2b45a / hi #ffd9a1
           done #e9e9ee / hi #fff (succeeded) · failed #b8494d / hi #d77a7d · cancelled: dashed hollow block
graph      g-node, g-node-final, g-node-walked, g-node-edit · g-stroke, g-stroke-walked, g-stroke-edit
           g-edge #45454e (not taken) · g-edge-walked #7d7d88 · dash-sm 2.5 2 · dash-lg 5 4
type       Geist Sans, five sizes: t-xs 12 · t-sm 13 · t-md 14.5 (body) · t-lg 18 · t-xl 30 (page title)
           Geist Mono, two sizes: t-mono 12 · t-mono-sm 11 (for what the tool names: ids, events, keys, the readout)
           weights 400 · 500 · 600. Tracking: xl -0.03em, lg -0.015em, mono caps +0.06em, otherwise 0
           (the 15px wordmark is the one exception)
radii      frame 30 · card 22 · item 16 · field 12 · chip 7 · controls 999 (pills)
motion     ease cubic-bezier(.22, 1, .36, 1); d-1 .15s (hover, press) · d-2 .32s (settle, graph) · d-3 .7s (HUD, draw, ring)
ring       one focus ring: 1px ink-2 at 55% + 4px at 14%, as a box-shadow; never changes an element's shape
layout     maxw 1680 · gutter 40 (28 at ≤1240) · row padding 22
```

A tone is a run's status. Any element with `data-tone="blocked"` or class `t-blocked` sets `--tone` and `--tone-hi`, and everything inside it (graph, glyph, HUD, leader, Block) reads those two variables. The editor uses `data-tone="select"` (blue) for its selection.

## Components

One implementation each. Use these; do not restyle per screen.

| Component | Where | What it is |
|---|---|---|
| `Pill` (`.pill`, `.pill.sm`) | everywhere | md 40px, sm 32px. Variants: default (raise-2), `primary` (ink on light), `quiet`, `ghost` (translucent, on the stage), `danger` (raise-2 with a red Block). All have hover, `:active` scale .97, the ring, and a disabled state. |
| `.pills` | full screen zoom | A group of pill buttons (− 95% +). |
| `Switch` (`.switch`) | top bar, editor stage | 36px: 3px inset, 30px items, t-sm/500; `.on` is raise-3. |
| `Label` (`.label`) | — | t-xs/500/ink-3, sentence case. Used above every field, for group headings and "Report from `x`". |
| `SectionHeading` (`.section-h`) | — | t-lg/600. History, Inputs, Checks, Run. |
| Readout (`.readout`, `.kind`) | — | mono t-mono-sm/500. `.kind` is all caps in ink-2. The readout puts the status word in the tone (caps) and the state id in its own case. |
| `Sep` | — | The 3px block between phrases in sans text. Inside mono lines and syntax hints, a literal "·" is used. |
| `Rich` | — | Prose with `` `backtick` `` spans as code; `"quoted"` engine ids become code in problem and refusal lines. |
| `Clamp` | — | CSS line clamp with "Read all" / "Show less". Nothing is truncated in JS. |
| `KV` | — | `inset` for payloads (recessed surface; raise-2 inside the ask, stage elsewhere), `stacked` for the facts column. Keys are mono (the tool's names). Values with no spaces (ids, paths, URLs, numbers, flags) are mono; sentences are sans. |
| `Facts` | — | Sentence-case labels over values. |
| `Quiet` | — | ink-3 t-sm: "Nothing yet in this step.", "No report at the end.", "Nothing to fix." |
| `Quote` | — | Your words, in curly quotes. |
| `Count` | — | A 22px chip on `--r-chip` for numbered needs. |
| `Block` / `PathGlyph` / `Progress` / `EmptyPath` | `glyph.tsx` | The status language. |
| `PageHead` | `page.tsx` | Back link, one 30px title, one quiet line, actions aligned to the last baseline. |

## The status language: blocks, not dots

There are no status pills and no dots. Status is drawn as the run's own path.

- **Path glyph** (`PathGlyph`), on every run row.
  - Small graphite blocks are the steps the run walked, in order.
  - The **lit block**, larger, is where it is now, in the tone colour.
  - **Hollow blocks** after it are the shortest way still ahead to a successful end.
  - A long walk folds its start into an ellipsis.
  - On a list, every glyph puts its lit block at the same x, so status scans down one column.
  - A blocked lit block gets a faint glow in its tone.
  - While a run's history loads, the row shows hollow blocks (`EmptyPath`), not a bar.
- **Block** (`Block`), one square, in one of these forms:
  - lit in a tone: the nav counts, the readout, the current chapter, checks, the "needs you" link, error and problem lines;
  - graphite: past chapters;
  - hollow: Reconnecting.
- **Progress** (`Progress`) is ten blocks. They are blue in the live "Latest from the agent" and graphite in the history.
- **Thumb** (`Thumb`), on machine rows: the machine's shape as 7px blocks and forward edges only. A step where a live run stands is a 10px block in that run's tone. A big machine packs its ranks closer; its blocks never shrink. Thumbs are right-anchored, so the status column ends at the same x as the run glyphs.
- **Words stay ink.** Examples: "Blocked at `smoke`", "Your decision at `await_review`", "Shipped · took 1m 55s".

### One name per status

The same map (`statusWord` in `glyph.tsx`) feeds the readout, the subtitle, the rows and the nav:

| Status | Word |
|---|---|
| running | Running |
| waiting | Your decision |
| blocked | Blocked |
| succeeded | Succeeded |
| failed | Failed |
| cancelled | Cancelled |

The group of runs that are blocked or waiting is **Needs you**. Its count reads "1 needs you" / "3 need you" (`needsYouPhrase`).

## The graph (`graph.tsx`)

- **Layout.** dagre, drawn as our own SVG.
  - For each frame, both directions (left to right, top to bottom) are laid out, and the one that reads largest is used.
  - Inline, the scale is between 1 and 1.2. If even the better direction would need less than 1, the graph is laid out left to right at 1 and the frame pans sideways. The edges fade, and it scrolls to the current or selected step.
  - Edge labels take no rank. Each label sits on its edge's midpoint with a halo in the stage colour. It is then nudged along its edge, across it, or around it until it clears nodes, other labels and other edges' lines.
  - Labels that cannot fit on a short edge are shortened. The full name is in the tooltip and in full screen.
- **Nodes are blocks.**
  - Task: a block with radius 0.3 × its height. Decision: a diamond glyph before the id. Wait (a person decides): dashed outline and an arc glyph. Final: a capsule.
  - A missing target (half-written machine) is dashed amber. In the editor, states named in a problem get an amber dashed outline.
- **Walked vs not.**
  - Walked nodes are lifted (lighter fill, full-ink label).
  - Walked edges are 1.8px `g-edge-walked`; unwalked edges are 1.3px `g-edge`, with ink-3 labels.
  - The edge into the current node is drawn in the tone and draws itself when the step arrives. A person's dashed edge keeps its dash instead.
  - Arrowheads are one size (`markerUnits="userSpaceOnUse"`).
  - A step visited more than once carries a small `2×` badge.
- **The current node** is filled with a vertical gradient from tone-hi to tone, with an on-light label. When it becomes current, it gets one ring that grows evenly outward. Blocked adds a glow. There is no ring in the editor.
- **Editor mode** (`edit`): the whole machine at reading contrast. The selected state is lit blue and its ways out are drawn in blue. Nodes are buttons: Tab reaches them, and Enter or Space selects.
- **Full screen everywhere a graph appears** (run page, editor):
  - Open it with the `Full screen` pill at the frame's top right, or press `f`.
  - The whole window becomes the stage. Nodes show their id and title.
  - Drag to pan; pinch or ⌘-scroll to zoom; `+` `-` zoom; `0` fits; Escape or `f` leaves.
  - It opens at a readable zoom (about 95%) centred on the current step. On each axis it centres what fits and clamps what does not, so no side is left empty while the drawing runs off the other.
  - The legend sits bottom left (walked / not taken / a person decides; in the editor: ways out / an event / a person decides). Focus starts on Close.
  - When the run needs you, the bottom right carries **Answer the agent** / **Decide**. It closes full screen and focuses the answer field.

## The HUD

The frame (`.frame`) is the stage surface that holds the graph and the ask. When a run is **blocked**:

- the frame's edges take the tone as light falling inward: a tone hairline plus two inset glows (36px and 140px), not a border;
- four corner arcs (2px, 30px boxes 6px from the frame edge, radius 24 following the frame's 30) slide in from 6px out, like a viewfinder. They clear the ask surface and the frame's tools;
- a mono readout top left: `■ BLOCKED at smoke for 16h 48m`;
- the blocked node is lit red with a glow;
- a dotted leader drops from that node to a small socket on the ask surface below, so what the agent needs is attached to the step it stopped on. If a node or label sits in the way (top-to-bottom layouts), only the socket is drawn.

**Waiting** uses the same system, calmer: amber, a thinner single inset glow, corners at half strength, and the node lit amber. **Running** has no HUD. Only the readout's status word and the lit node are blue. **Finished** shows a white final block and an ink readout. In full screen the HUD covers the whole window's edges.

The HUD carries its own `data-tone`. It fades in over `d-3`. It fades out the same way after you resume, still in the tone it had, together with the leader, as the SSE update arrives. The graph's height and the tools do not move when the HUD comes or goes.

**Tools** (`.tools`) sit 18px from the top and right of every frame: run page and editor alike. The editor's Switch sits top left on the same centre line.

## The ask

One surface inside the frame, under the graph. It has two columns: what the agent says on the left, your part on the right.
- The primary action sits at the bottom right of the field it sends, where the hand ends up after typing.
- Buttons never sit on labels; every label sits above its field.
- `.kind` (mono caps, ink-2) opens each one.

- **Blocked:**
  - Left: `BLOCKED · THE AGENT NEEDS 2 ANSWERS`, the state title, the agent's `needs` as numbered questions (`Count`), then "Why `error_code`" with the message clamped to two lines.
  - Right: **Your answer** (the placeholder is pre-numbered `1.` `2.` for multiple needs), the hint "The agent reads this first when it resumes.", and **Resume the run** ("Resume without a note" while the field is empty).
  - Sends `api.unblock(id, note)`; the engine hands the note to the agent as `human_note`.
- **Waiting:**
  - Left: `YOUR DECISION · 2 CHOICES`, the state title, the agent's last note, and "Report from `open_pr`" as an inset KV.
  - Right: the human events as side-by-side choice cards (name, "then `target` · title", description) in a radio group (the arrow keys move the choice). Pick one, add an optional note, then **Send "Approved"**.
  - Sends `api.transition(id, event, note)`.
- **Running:**
  - Left: the state's instructions (with inline code).
  - Right: **Latest from the agent**, with blue progress blocks, and "It can leave by" as plain `event → target` lines.
- **Finished:**
  - Left: the outcome title ("Shipped and smoke-tested"; "Failed at Gate" plus the error when a run fails mid-way; "Cancelled by you"), then "Took 1m 55s, 7 steps, by [agent]."
  - Right: "Report from `x`" as an inset KV.

Cancel run stays in the page head as a quiet pill. It asks once more in place ("Cancel the run for good", with a red Block) and reverts after 4 seconds.

## History: the story of the run

History sits under the frame, on the left. The right column holds Inputs, Checks and Run. Both columns' headings are `SectionHeading`; the story is at most 980px wide.

History is **newest first** and grouped into **chapters**, one per visit to a state. Each chapter header has:
- a Block, lit in the tone for the current chapter;
- the state's title and its id;
- a meta line: "for 17h" while live, "ended 21:48" (the run's end) when finished, and "19:17 · 11s" for past chapters.

Inside a chapter the moves are also newest first. Each has a gutter with the actor and the time:

- **Agent** moves are plain: "Moved on with `scoped` → `qa`", the agent's note (clamped, "Read all"), and the payload as an inset KV.
- **Your** moves ("You unblocked it", "You chose `approved` → `merged`", "You cancelled the run") sit on their own raised surface, with your note as a Quote.
- A stop is "■ Blocked `code`" with the numbered needs. A refused move shows the machine's error in ink-3.

Facts show times as "Oct 20, 12:06" (24-hour everywhere).

## The run page as you scroll: dock and pointing

**The graph docks.**
- *When.* Once the hero graph's bottom edge passes 32px under the top bar, the same drawing travels into the facts column, above Inputs, and stays there (the column is sticky). Scrolling back past 72px under the bar returns it.
- *Where it applies.* Every status. Not at 1100px and below, where the column stacks.
- *How it travels.* One drawing, moved by translate and scale on `--ease` over 440ms, with its window resizing from the hero's graph area to the dock box. Positions are read live each frame, so scrolling during the move still lands it. Under reduced motion it cross-fades in place.
- *What stays put.* The hero frame keeps its height (its graph area goes empty), the ask stays, and the page never shifts under the reader. The dock slot opens with a height transition inside the column only.
- *At dock size.* The nodes become the mark's blocks: graphite, walked ones lighter, the current one in its tone and never smaller than 12px. Strokes keep their width. Labels fade as the scale drops, except the current step's name (`--t-mono-sm` on a stage-coloured backing). That name goes above its block when that touches no other block, otherwise below, shifted sideways if needed. The drawing and the name keep a 16px inset from the box on every side; the box is as tall as that needs (104 to 240px).
- *Status and caption.* The dock carries the HUD as a soft inset glow (blocked, waiting) and no corner arcs. Under it, the readout is the caption.
- *Opening it.* Clicking the dock, or pressing `f`, opens full screen.

**Pointing at the story points at the machine.**
- *What lights up.* Hovering or focusing a chapter lights its state's node (an ink ring and a 2px lift, distinct from the tone-lit current step) and the move that opened the chapter. A move lights its edge and arrowhead in ink. A note, stop or human beat lights the chapter's node.
- *Where.* The light goes to whichever graph is visible: hero or dock.
- *Timing.* Enter is `--d-1`, leave is `--d-2`, and nothing stays after the pointer or focus leaves. Chapter headings and beats are focusable, so this works from the keyboard.
- *Panning.* If the hero pans, the pointed-at node is scrolled into its view; the page never scrolls.
- *The reverse.* Hovering a node marks its chapters in the history with a raised background.

## Rows (Runs, Machines)

No tables, no header row, no grid lines.

A row is a three-column grid:
1. **status**: a glyph or thumb, in a fixed 150px column;
2. **primary line + quiet line**;
3. **time** on the right.

Hover and keyboard selection raise the row, at a 22px radius.

- **Runs** groups by what you can do: **Needs you** (blocked first), **Running**, **Finished**.
  - Rows that need you are larger and sit on their own surface. The tone falls in as light from the left edge, and the agent's first question is quoted (two lines). The remaining questions are counted underneath ("and 1 more question").
  - An **Answer** / **Decide** pill sits on the right.
  - The page subtitle is a sentence: "4 need you · 2 running · 7 finished".
- **Machines**: thumb · name and one line of description · "ran 13h ago" over "15 states · 2 runs · v1".
  - A machine with runs that need you shows "■ 1 needs you →" in ink, as its own link to the run.
  - The row is a stretched link, so nothing interactive is nested.

## Layout and navigation

- **Top bar** (sticky, 95% page with blur; a hairline appears once the page scrolls).
  - Left: the mark and "machine".
  - Centre: one Switch, **Runs · Machines**. Runs carries a red Block with the blocked count and an amber Block with the waiting count.
  - Right: nothing, except "■ Reconnecting…" (hollow block, ink-3) when the SSE stream drops.
  - There is no sidebar and no "live" badge.
- **One container.** Every screen and the bar share `--maxw` 1680 and `--gutter` 40 (28 at ≤1240), so the brand, page titles and content share one left edge on every screen. Lists use the full container; the ask's question keeps a 70ch measure.
  - At ≤1240 the facts column narrows to 320 and the inspector to 380. While the HUD is on, the run graph is capped at 320px so the ask stays in view.
  - At ≤960 the ask, the story/facts and the editor workspace stack.
- **Page head:** a back link that names where it goes ("Runs", "Machines", or "Back to the run" when you opened the machine from a run), one 30px title, one quiet line, and actions on the right, aligned to the quiet line's baseline.
- **Keys:**
  - `j` `k` (or arrows) move in a list and Enter opens; the selection appears only after a key is pressed.
  - `n` starts a new machine. `f` opens full screen.
  - Escape leaves full screen, then blurs a field, then clears the editor's selection, then goes back.
  - ⌘Enter sends an answer or a decision. In the editor, `s` swaps Machine and Skill.
  - Everything clickable is also reachable with Tab: rows, inspector parts, graph nodes and choice cards. There are no keyboard badges in the UI.

## Editor

**Page head.** The machine's name, then `id · Published v1 · 15 states` (or "Draft · published v1" / "Draft, not published yet").
- On the right: **Publish** / **Publish v2** while there is something to publish (disabled while there are problems).
- When nothing changed, it shows a quiet "■ Published v1" status instead of a button.
- Publish feedback ("Published v2. The skill is at …") appears next to it.

Below the head, a workspace one viewport tall:

- **Stage** (left): the graph in edit mode with full screen. The Switch on the stage flips it to **Skill the agent reads**: the SKILL.md rendered with `marked` (front matter as a quiet mono block; headings, lists, tables and code in a 68ch reading column; raw HTML shown as text). Click a node, or Tab to it and press Enter, to select its state.
- **Inspector** (right, 440px): one list of parts, each a button.
  - Machine, Inputs and Checks come first as one-line summaries. Then States, each with a kind glyph, its id, its title, "start" for the initial state, and an amber Block when a problem names it.
  - The selected part opens in place: sentence-case labels above fields, prose in sans, structured lines in mono, and textareas that grow with their content.
  - Kind is "Task / Decision / Wait for a person / Final", with a one-line hint under it.
  - **+ Add state** ends the list. The stage's switch is **Machine · Skill · JSON**, and **Describe a change** in the page head opens the describe screen for this machine.
- **Problems** sit in a footer: "Nothing to fix." or "■ 2 problems before you can publish". Each problem is clickable to its state, and the overflow is behind "Show N more".
- It opens with nothing expanded on an existing machine, and on the Machine part for a new one.

## Making a machine: describe, draw, JSON

Three faces of one definition, in the order people meet them. All three use the same validator and the same graph, and they publish the same way.

**Describe it (first).**
- *Where it starts.* **New machine** opens the describe screen (`#/machines/new`). The graph stage is on the left. Before the first draft it shows a row of hollow blocks and "Describe the process and watch it take shape". The conversation sits in the inspector's place on the right.
- *Sending.* You type the process in plain words and send (Enter; Shift+Enter for a new line). The authoring session is created on that first send, with the agent chosen in the picker (AgentMark and name; the default is preselected; agents that are not installed are listed but disabled). The session id goes into the hash, so a reload comes back to the same conversation and draft.
- *The graph.* Every `author.draft` redraws the stage with the editor's graph. States named in problems get the amber dashed outline, and the problems sit in the same footer as the editor's.
- *The transcript.*
  - The agent's text streams in (batched to one update a frame) and renders as markdown once the paragraph ends.
  - Each tool call is one quiet line that updates in place. Draft calls read "Drafted · 7 states · 2 problems" or "Drafted · 7 states · clean".
  - Your own messages sit on a raised surface. Errors (an agent's account problem, a failed start) are one line with a red Block, never a modal.
  - While a turn runs, the agent's mark pulses beside **Working** and **Cancel** replaces Send.
- *Where the draft goes.*
  - **Open in editor** puts the draft into the editor's local draft and opens it there, to finish by hand.
  - **Publish** publishes it directly once it has no problems. The agent never publishes.
- *Revising.* In the editor, **Describe a change** opens the same screen with the published machine on the stage (`?revise=<id>`).

**Draw it (second).** On the editor graph, and on the describe stage once a draft exists:
- *Add a step.* Hovering a step shows a **+** at its exit (right in left-to-right layouts, below in top-to-bottom ones; finals have none). Clicking it adds a task after the step, connected by `done` (`done_2` if taken), selects it, and focuses its title in the inspector.
- *Connect two steps.* Dragging from the **+** draws a dashed ink line, and the step under the pointer gets the ink ring. Dropping on a step asks for the event's name inline (default: the target's id); Enter connects and Escape cancels. Dropping anywhere else adds a new step, as a click does.
- *Rename.* Double-clicking a step edits its title in place.
- *Remove.* **Delete** on the selected step asks once, in place ("Remove `step`" / "Keep it"; it reverts after 4 s). Events that led to the removed step are deleted and listed under the problems as notes.
- *The layout.* Nodes are never positioned by hand; dagre keeps laying out.
- *Hints and hand edits.* A one-line hint under the stage explains the gestures until you first use one. On the describe stage, hand edits change the local draft; the next message carries it to the agent so it continues from what you drew.

**Edit the JSON (last).** A third face on the editor stage: **Machine · Skill · JSON**.
- *The field.* A mono text area, with Tab inserting two spaces.
- *Validation.* Every change that parses becomes the editor's machine and is checked by the same validator. A syntax error is one problem naming the line.

## Copy

| Concept | Words |
|---|---|
| Runs that need you | **Needs you** (group); "1 needs you" / "3 need you" (counts) |
| Waiting | "Your decision at `x`" |
| Blocked | "Blocked at `x`"; the reason is "Why `code`" |
| Definition vs walk | **states** in a definition (Machines, editor); **steps** in a run's walk ("7 steps", "4 steps to go") |
| A step's output | **Report**: "Report" in the editor, "Report from `x`" on the run |
| Preflight requirements | **Checks** on both screens |
| Ids | Always in mono, never case-transformed |
| Labels and buttons | Sentence case |
| Times | 24-hour |

## What we deliberately do not have

Tables, status pills, ping dots, a sidebar, a "live" badge, keyboard badges, toasts, modals for confirmation (cancel confirms in place), charts, avatars, onboarding, drag-to-position nodes, and any UI library beyond React, dagre and `marked` (for the skill pane).

## The mark

GT Badge (chosen 2026-10-21, replacing Turn): a number-plate chamfered enamel badge, chrome bezel, italic chrome capitals MACHINE and a red pinline; from the 16-direction competition in `docs/brand/logo-competition.html`. The finished set is `docs/brand/final/` (master `gt-badge.svg`, flat one-colour versions, the square `gt-mark.svg` with 32 px and 16 px redraws for favicons, the PNG icons, `README.md`). The product shows the badge 26 px high in the top bar (`src/ui/public/brand/gt-badge.svg`); the favicons and app icons in `src/ui/public/` come from the mark. The earlier Turn mark is archived at `docs/brand/archive/turn-2026-10-19/`.

- `src/ui/mark.tsx` draws it inline in the top bar at 22px.
- Favicons and app icons are in `src/ui/public/`. The SVG favicon is the 16px whole-pixel drawing (no transition bars) and browsers use it at every size; `favicon-32.png` is the fallback.
- Blue stays the accent and nothing else is coloured. The blocks are graphite, lighter at 16 and 32 so the dark face holds on a dark tab bar.
- Minimum size 16px. Clear space one block around the mark. On white: same drawing, same blue.

## Agent marks

Wherever an agent is named, its brand mark sits in front of the name: the run header, every agent beat in the history, the finished summary, the facts column (in a tile), and the right edge of each run row.

- **Source.** The marks are `src/ui/agent-icons.tsx`, copied from Plannotator's `packages/ui/components/icons/AgentIcons.tsx`: Claude, Codex, Pi, OpenCode, Cursor, Copilot, plus a neutral code glyph for anything else.
- **Matching.** `AgentMark` picks one by matching the agent's reported name loosely (any name containing "claude" gets the Claude mark).
- **Colour.** Brand colour where the mark has one (Claude, Pi, Cursor, Codex); currentColor for OpenCode and Copilot. Cursor's square is drawn white on this dark surface. Names next to marks are ink-3 in lists and ink in sentences.
- **Sizes.** 14px in beats and rows; 15px inline in sentences, where the mark is an inline box on the text baseline so the name and its punctuation stay on the line; 18px in a 30px tile.

These are the products' own trademarks, used to identify them. They are not under this project's license.

## Model and effort in the composer

The row under the message field reads as one sentence of choices: the agent (with its mark), its model, its effort. Each is a quiet menu with the same face; menus open from the row's left edge so they never run past the pane. A choice that can no longer change in this conversation (the agent, Claude's effort) reads as plain text with the reason in its title. A change that takes a moment (effort restarts the agent) pulses until the server settles it; a message sent meanwhile waits for it.
