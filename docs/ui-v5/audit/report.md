# Design consistency audit (ui-v5, find-only pass)

105 issues: 10 high, 47 medium, 48 low. H = high, M = medium, L = low. Line numbers refer to `src/ui/styles.css` unless a file is named. Screenshots and crops sit next to this file.

## Verdict

The core idea works. Every run row puts its lit block at the same x (275 px in all 13 rows), the HUD reads at a glance, and the `--tone` variables do their job. Around that idea, the UI is a set of local decisions rather than a system: 42 raw hex values (31 distinct) outside the tokens; 20 font-size declarations off the scale, and `code { .88em }` produces five different mono sizes (10.56 to 12.76 px); eight pill-shaped controls of different heights, about ten "small grey label" styles, four key/value grids, five ways of truncating text, five focus or selection rings.

The three biggest systemic problems:
1. **The machine is not reliably the hero.** Graph labels range from 6.5 to 15 px with no minimum. A measuring bug confines the editor graph to 376 px of a 657 px stage. Machine thumbnails shrink to 2.7 px squares, which read as the coloured dots the owner rejected.
2. **Screens and components share no frame.** The title's left edge jumps 120–220 px between list pages and run/editor pages. Buttons, labels and key/value grids are rebuilt per screen.
3. **Status leaks out of the block language.** Machines still has a status pill. Status words are coloured in about seven places. The HUD fades out in blue after an unblock. "Waiting on you" is worded five ways.

Contrast is also a problem: `ink-4` text at 2.2:1 is used in 18 places, and the editor inspector and graph can't be reached with Tab.

## 1. Tokens vs. use

- **A1 M.** 42 raw hex values outside `@theme`. The graph alone uses 14 private greys (#17171c :215,234, #1d1d23 :245, #22222a :221, #2a2a31 :203,212,215,418, #3a3a43 :245, #4a4a53/#4a4a54 :249,251,221, #7d7d88 :206,213,390, #121216 :220, #0c0c0f :376), plus #24242b :328, #34343c/#55555e :390, #1f1f26 :290, #202027 :445, #1c1c22 :444. Fix: add `--g-node`, `--g-node-walked`, `--g-node-edit`, `--g-edge`, `--g-edge-walked`; map near-duplicates onto ink-4, graphite and raise-2.
- **A2 M.** Final-status tones are raw hex (:47-50: #e9e9ee/#fff, #b8494d/#d77a7d, check #8a8a94). Fix: add `--color-done(-hi)`, `--color-failed(-hi)`, `--color-check-hi` to `@theme`.
- **A3 L.** Raw "ink on a light surface" values: #0a0a0c (:96,157,231,232), #1a1206 (:233), #fff (:97,228), #ffffffd0/#ffffffb0 (:229-230). Fix: `--color-on-light`, `--color-on-tone`.
- **A4 M.** 20 font sizes off the scale: 15 (:66,382), 15.5 (:140,275,332), 22 (:270), 11.5 (:191,268,341,384,403), 11 (:205,278,431), 10 (:242), 12.5 (:216,217,318,364,416,429,440), and raw 12px where `--t-xs` exists (:71,274,297,316,428). Fix: 15/15.5 → `--t-md`, 22 → `--t-lg`; add `--t-mono: 12px` and `--t-mono-sm: 11px`.
- **A5 M.** `code, .mono { font-size: .88em }` (:57) gives five mono sizes: 10.56 (`.why-k`, `.insp-h`, `.ev` code), 11.44 (`.r-sub code`), 12.76 (`.sub`, `.bh`, `.ch-h` code), 12.5 and 12. Fix: fixed mono tokens, no em.
- **A6 M (owner decision).** Brief says 4 sizes / 2 weights; DESIGN.md and the CSS say 5 / 3.
- **A7 L.** Radii off the token set: 12 for fields (:346,440; no `--r-field` token), 10 (:61), 9 (:396), 8 (:274), 6 (:278,307), 3 (:159), 1 (:88); graph node rx 11 (graph.tsx:122), badge rx 8. Fix: add `--r-field`, `--r-chip`.
- **A8 M.** Blue used beyond running/selection: the focus outline (:61), editor field focus (:445), progress blocks always blue (:127), and the editor frame forced to `data-tone="running"` (editor.tsx:162), which turns the full-screen readout blue. Fix: a `select` tone; editor readout in ink.
- **A9 M.** "Reconnecting…" is amber (:73, main.tsx:44). Fix: ink-3 text with a hollow Block.
- **A10 M.** A refused move's error code is red-hi on a running run (:350, crops/refused-beat.png). Fix: ink-2.
- **A11 L.** Blocked glows hard-code `--color-red` instead of `--tone` (:119, :238).
- **A12 M.** Five focus/selection rings (:290 tone, :445 blue, :308 choice, :137 row.sel, :61 outline). Fix: one `--ring`.

## 2. Component duplicates

- **A13 H.** Eight pill controls with different heights and padding: `.btn` 40, `.r-go` 34, `.chip` 32, `.tabs a` 32, `.seg` 28, `.zoom` 32, `.ev` 30, `.r-flag` ~26, plus `.blk .tag` at 11px. `.r-go` also shifts 2 px on hover (:158). Fix: one Pill component, sizes sm/md × variants primary/secondary/quiet/danger. `.ev` becomes plain text, not a pill.
- **A14 M.** Two segmented switches: `.tabs` (:67-70) and `.seg` (:108-111). On the editor stage the seg is 34 px next to the 32 px chip. Fix: one Switch at 32 px.
- **A15 M.** About 10 label styles: `.eyebrow` :132, `.handed .eyebrow` :303, `.answer label` :287, `.field .k` :439, `.why-k` :281, `.insp-h` :419, `.s-k` :426, `.facts h3` :358, `.sec-h h3` :324, mono caps `.kind` :268 and `.readout` :191. Fix: Label, SectionHeading and Readout components.
- **A16 M.** Key/value drawn four ways: ask payload with no surface (run.tsx:100,159), history payload on a surface (:346), facts stacked (:359-360), editor `.sum` rows (:425-427). Fix: one KV with inset and stacked variants.
- **A17 M.** Five truncation methods: Clamp (run.tsx:26), `.r-ask` clamp plus `trunc(180)`, `.r-sub` plus `trunc(90)`, graph `clip`/`fitLabel`, `.r-agent` max-width. Fix: CSS-only Clamp.
- **A18 M.** Six "nothing here" forms: `.empty`, "Nothing yet…", "No report at the end.", "No note.", "Nothing to fix.", editor "none". Fix: one Quiet style.
- **A19 L.** Quotes drawn two ways: blockquote pseudo-elements vs string literals (run.tsx:156).
- **A20 L.** Number badges three ways: `.needs .num`, `.needs.small .num`, graph `.nv`.
- **A21 L.** Duplicate helpers: `trunc` and `clip`; `human()` and an inline `replace`.
- **A22 L.** Separator drawn as `.sep` block or as literal " · ".
- **A23 M.** "Published v1" is a disabled primary button (:102, editor.tsx:160) used as a status. Fix: quiet text with a Block.

## 3. Status language

- **A24 H.** Machines "N waiting on you" is a tinted status pill with coloured text (machines.tsx:40, styles.css:171). Also red whenever any run is blocked, even for a mixed count. Fix: Block plus ink text.
- **A25 H.** Thumbnail blocks scale with machine size (2.7 to 9.9 px), so lit steps become coloured dots (graph.tsx:287, crops/machines-thumbs.png). Fix: fixed 8 px blocks, lit block 10–12 px.
- **A26 M (owner decision).** Colour on text: `.kind`, `.readout .rs`, `.beat.stop .bh`, `.checks .bad .cw`, `.beat.you .actor`, `.r-flag`, `.p-h`, `.offline`. DESIGN.md contradicts itself here. Recommendation: text in ink, colour only on blocks.
- **A27 L.** Cancelled uses three dash patterns: 2 2 (:120), 2 1.6 (:125), 3 3 (:234). At 1× the glyph reads as a dotted circle.
- **A28 H.** On unblock, the tone switches to running at once, so the 0.7 s HUD fade-out is blue. The leader vanishes, the frame height jumps 420→500 and the Full screen chip jumps 24 px (hud-120ms-after-unblock.png). Fix: keep a `data-hud-tone` until the fade ends; constant `maxH`; chip position independent of the HUD.
- **A29 M.** "1 step to go" counts the shortest path to any success final, so plannotator at `scope` takes the `nothing_to_ship` exit (api.ts:118). Fix: prefer the main success path.
- **A30 L.** The nav count shows one Block for a blocked+waiting mix (main.tsx:41).
- **A31 L.** A third graphite: #303037 (:121) and #2e2e35 (:168). Fix: `--color-graphite-lo`.
- **A32 L.** `o-fail` class has no CSS, so failure finals look like success finals.
- **A33 M.** A missing target node loses its amber in the editor because `.graph.edit .n.idle .nb` (0,4,0) beats `.graph .n.missing .nb` (0,3,0) (crops/editor-missing-node.png).
- **A34 M.** Problems are not drawn on the graph or the state list. Fix: amber dashed outline on the node plus a Block in the list.

## 4. Layout and alignment

- **A35 H.** Editor graph height bug: the ResizeObserver attaches while `ref` is null (loading state), so `wsH` stays 0 and the graph is 376 px tall in a 657 px stage (editor.tsx:63-73, 130, 154).
- **A36 H.** No minimum graph scale: node labels range from 6.5 to 15 px, edge labels from 5.7 to 13.2 px (graph.tsx:163).
- **A37 H.** Lists are 1120/1240 px centred while run and editor are 1680 px, so the h1 sits at x=160 vs x=40 at 1440 (340 vs 120 at 1920) (:77-78, :455). Fix: one shell grid.
- **A38 M.** Bar gutter 28 vs page gutter 40 (:64 vs :76). Fix: a shared `--gutter`.
- **A39 M.** The Full screen chip overlaps the HUD corner (chip right edge 1354, corner arc from 1346). Insets differ: run 6/22 or 46 (:473, :201 !important), editor 16/18 (:414).
- **A40 M.** Right edges: 1256 in big rows vs 1258 in normal rows (padding 24 vs 22); `.r-flag` uses margin -12 and ends at 1270.
- **A41 L.** Group heading indented 20 vs row content 22.
- **A42 M.** Thumbnails are centred (:162), so left edges are ragged (193–236).
- **A43 M.** "History" (18 px) and "Inputs" (14.5 px) don't share a baseline (crops/facts-headings.png).
- **A44 L.** Chapter meta ends at 964 while beats end at 936 (:342).
- **A45 M.** In top-to-bottom layouts the leader line crosses nodes and labels (run-waiting-1100/960).
- **A46 M.** The 82% sticky bar shows blurred white pills underneath (:65).
- **A47 M.** Full screen opens centred on the current node, cutting the top while leaving the bottom empty (graph.tsx:203).
- **A48 L.** The agent tile in Facts touches the key/value list below.
- **A49 L.** Header action text baseline sits about 10 px above the subtitle baseline (:83).
- **A50 L.** At 1920 the 70ch ask leaves about 400 px of dead space.
- **A51 L.** The selected `.blk` padding jumps (:422-424).
- **A52 L.** The HUD's bottom corner arcs draw over the ask surface (:178).
- **A53 L.** The skill pane is cut at the bottom with no fade, and scrolls under the seg.

## 5. Typography

- **A54 H.** "Skill the agent reads" shows raw SKILL.md (`#`, `**`, backticks) in mono, not rendered (editor.tsx:175, :416). Fix: render the markdown.
- **A55 M.** Mono used for prose: the checks/report/events textareas; facts dates and "11m ago" (the `isShort` heuristic, run.tsx:13); mono lowercase facts labels.
- **A56 M.** Sans used for ids: "Stopped at gate with gh_unavailable" (run.tsx:156), "Handed over at open_pr" (run.tsx:100,159), long paths. The readout uppercases state ids (:191).
- **A57 M.** Orphaned and double ellipses: "th… and 1…" (crops/r-ask-orphan-ellipsis-1100).
- **A58 M.** Literal markdown backticks in the instructions (run.tsx:134).
- **A59 L.** Six letter-spacing values.
- **A60 L.** 15.5 px used for three roles (:140, :275, :332); big-row title is 18.
- **A61 L.** Ask h2 is 22 px (:270).

## 6. Copy and naming

- **A62 M.** "Waiting on you" worded five ways (glyph.tsx:47, runs.tsx:19,52,61, run.tsx:97, main.tsx:41, machines.tsx:40), and blocked runs are counted in it.
- **A63 M.** "steps" (Machines, lede, "to go") vs "states" (editor).
- **A64 M.** "Blocked" worded five ways ("Blocked at", "Stopped and asked for you", "Why it stopped", "Stopped at … with", "blocked · the agent needs you").
- **A65 M.** Times: the readout shows "17H AGO" while the subtitle shows "for 16h 48m" (run.tsx:296 vs :299); chapter meta reads "now · just now"; "ended HH:MM" prints the chapter's start time (run.tsx:244, a bug); Facts uses a 12h `toLocaleString` while everything else is 24h.
- **A66 M.** Lowercase editor field labels and facts labels; the lowercase publish status replaces the subtitle (editor.tsx:110).
- **A67 L.** "Handed over at" vs "What it handed over at"; "Checks" vs "Checked before it began"; "report" vs "handed over".
- **A68 L.** The waiting row's ask is built from event names (runs.tsx:20) and ignores the agent's note.
- **A69 L.** Raw, inconsistent agent names ("claude-fable-5-1", "Claude Fable 5.1", "Claude Code (Fable 5.1)").
- **A70 L.** Problems are raw engine strings; "and 4 more" is not clickable.
- **A71 L.** Empty Runs subtitle repeats the empty card; Machines empty state has two "New machine" buttons.
- **A72 L.** DESIGN.md drift: it still documents the `Full screen F` chip and `⌘↵` labels, a field radius token that doesn't exist, and the 16/32 favicons.

## 7. Motion and interaction

- **A73 M.** 13 different durations. Hover uses the default `ease`; the ring pulse is 1.1 s (:236). Fix: three duration tokens, all on `--ease`.
- **A74 M.** `:focus-visible` sets `border-radius: 10px` (:61), changing shapes on focus; the focus styles differ (A12).
- **A75 H.** Editor inspector rows (`div onClick`) and graph nodes (`g onClick`) can't be focused. The Machines `.r-flag` is a span with onClick nested inside a link.
- **A76 M.** Only `.btn` has an `:active` state; `.btn.danger` has no hover; hover on big rows is barely visible.
- **A77 L.** Native textarea resize grabbers (:288, :440).
- **A78 L.** The ring pulse is a stretched rectangle (scale 1.35×1.9, :237).
- **A79 L.** Selecting a state in the editor fires the "step arrived" ring (graph.tsx:128).
- **A80 L.** Smooth scrollIntoView ignores reduced motion (editor.tsx:128); the armed cancel silently reverts after 4 s.

## 8. Graph

- **A81 M.** The legend's swatches don't match the edges (:390), and the editor shows the run legend.
- **A82 M.** Idle edges are #2a2a31 (1.35:1) and idle labels ink-4 (2.2:1).
- **A83 M.** Labels still collide: "fixed"/"fail", "regressions_found"/"patched", "cannot_reproduce".
- **A84 L.** Arrowheads scale with stroke width (graph.tsx:99). Fix: `markerUnits="userSpaceOnUse"`.
- **A85 L.** Decision/wait glyphs float at the node corner in full screen (graph.tsx:131-132).
- **A86 L.** Node radius is fixed at 11 regardless of height.
- **A87 L.** A dashed (person) edge turns solid once it is the last edge (:209).
- **A88 L.** The "2×" visit badge is 10 px.
- **A89 M.** White label on the lit node's light gradient top: 1.84:1 (blue) and 1.90:1 (red).

## 9. Marks

- **A90 M.** `.agent-inline` is inline-flex (:398), which lifts the agent name off the baseline and drops the trailing period (crops/lede-agent-baseline).
- **A91 L.** Full-colour brand marks next to ink-4 names in lists.
- **A92 L.** The favicon SVG (the 16 px drawing) is used at every size; its blues differ slightly from the Mark's; icon-192/512 are not referenced anywhere.
- **A93 L.** The brand wordmark is 15 px.

## 10. Responsiveness

- **A94 M.** At 1100 the editor's kind select is clipped ("decision · agent pick▾").
- **A95 M.** At 1100 and 960 the top-to-bottom graph pushes the ask below the fold.
- **A96 L.** The nav switch changes width when the count loads.

## 11. Dead code

- **A97 L.** Unused: `.eyebrow-s` (:303), the `statusWord` import in runs.tsx:6 (TS6133), `api.skill`, `api.saveMachine`, `BlockId "add"`.
- **A98 L.** Redundant rules: `.answer.quiet` :294, `.mrow` :161/:163, `.stage-ed` declared twice (:411, :413), stray `.run .gtools` at :473.
- **A99 L.** Four `!important` (:190, :201, :234, :471) and `.block:not([class*="t-"])` (:124).
- **A100 L.** Classes with no CSS: `has-problems`, `problems.some`, `o-fail`, `ask-main`, `story`, `hist`, `ask.now`, `beat.move`/`agent`, `g-*`.
- **A101 L.** Inline styles that should be rules (node cursor at graph.tsx:126, Mark at mark.tsx:13); Tailwind is imported but no utilities are used (82 KB CSS).
- **A102 L.** The `.glyph-wait` loading bar and the `.empty` card don't use the block language.

## 12. Accessibility

- **A103 H.** `ink-4` text at 2.20:1 on stage in 18 places; `ink-3` is 3.99:1 on raise and 3.72:1 on raise-2.
- **A104 M.** ARIA misuse: `role="tablist"` around plain links (main.tsx:40); seg tabs without a panel; radios without arrow keys; the full-screen dialog doesn't move or trap focus.
- **A105 L.** The nav count's meaning lives only in `title`.

## Suggested order

1. Tokens: A1–A7, A12, A31, A73, then A103 with A89.
2. Shell: A37, A38, A46, A49, A96.
3. Components: A13 with A14, A76, A23; A15 with A43, A60, A61; A16; A17 with A57, A21; A18 with A71, A102; A19, A20, A22, A74, A77.
4. Graph sizing: A35 → A36 → A95, A45 → A47 → A39, A52.
5. Status: A24 with A40; A25 with A42; A28 (after A39); A26 (owner ruling) with A10, A9, A8; A27, A29, A30; A33 with A34, A32; then A11.
6. Graph polish: A81–A88, A79, A78.
7. Type and copy: A54, A55, A56, A58, A59; A62 with A63, A64, A67; A65, A66, A68–A70; A72 last.
8. Interaction: A75, A104, A105, A80, A94, A90–A93, A48, A44, A41, A50, A51, A53.
9. Hygiene: A97–A101.

Must ship together: A13+A76, A25+A42, A28+A39, A35+A36, A17+A57, A62+A63+A64, A103+A82+A91.
