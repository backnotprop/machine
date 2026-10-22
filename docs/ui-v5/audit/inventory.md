# UI inventory (ui-v5 audit)

## Tokens (styles.css lines that use each)

| Token | Value | Lines | Notes |
|---|---|---|---|
| page | #08080a | 53, 65 | |
| stage | #0e0e11 | 67, 148, 173, 177, 205, 241, 346, 417 | |
| raise | #15151a | 99, 108, 136, 152, 266, 352, 423, 424 | |
| raise-2 | #1c1c22 | 70, 93, 102, 103, 159, 288, 300, 305, 308, 381, 396, 431, 440 | also raw at 444 |
| raise-3 | #25252c | 94, 104, 111, 241, 306, 383 | |
| hair | #ffffff0d | 137, 280, 448 | |
| ink | #ededef | 33 uses | |
| ink-2 | #a3a3ad | 29 uses | |
| ink-3 | #75757f | 43 uses | |
| ink-4 | #4a4a53 | 49, 88, 117, 133, 145, 146, 194, 205, 218, 289, 296, 301, 307, 335, 341, 391, 403, 446 | |
| graphite | #3a3a42 | 115, 116, 123, 124, 126, 167 | |
| graphite-hi | #55555e | 50, 170 | |
| blue | #3b82f6 | 44, 60, 61, 127, 252, 254, 255, 352, 445 | |
| blue-hi | #93c2ff | 44, 253, 353, 433 | |
| red | #ff5d62 | 46, 100, 107, 119, 238, 348 | |
| red-hi | #ffa3a5 | 46, 100, 293, 347, 348, 350, 366 | |
| amber | #f2b45a | 45, 73, 239, 240, 449 | |
| amber-hi | #ffd9a1 | 45 | |
| --t-xs | 12 | 24 uses | |
| --t-sm | 13 | 18 uses | |
| --t-md | 14.5 | 54, 86, 156, 288, 343, 354, 358 | |
| --t-lg | 18 | 155, 174, 324 | |
| --t-xl | 30 | 85 | |
| --r-frame | 30 | 173, 177, 417 | |
| --r-card | 22 | 135, 266 | |
| --r-item | 16 | 288, 305, 338, 422 | |
| --r-ctl | 999 | 12 uses | |
| --ease | | 76, 93, 135, 157, 180, 184, 208, 236, 266, 370, 375, 434 | |
| --tone | | 19 uses | |
| --tone-hi | | 171, 192, 210, 225, 268, 274 | |
| --amark | | 394–397 | |

Tone carriers: `[data-tone]` / `.t-*` at :44-50, set by `frame` (run.tsx:305; editor.tsx:162 forces running), `.full` (graph.tsx:241), `.row t-*` (runs.tsx:28), `.glyph t-*`, `.block t-*`, `.ask t-*`, `.r-flag t-*`, `.beat.stop` (:348), `.thumb rect.on t-*`.

## Components (file:line)

**Shell**
- App, bar, tabs, count, Reconnecting: main.tsx:28-54 (.bar .brand .tabs .need .bar-r .offline).
- PageHead: page.tsx:4 (header.top .back .head-row .sub .actions .sep).
- useListKeys: page.tsx:18.

**Status**
- PathGlyph (glyph.tsx:11, .glyph .w .a .lit .more): Runs rows.
- Block (glyph.tsx:36, .block): nav count, readout, history chapters, checks.
- Progress (glyph.tsx:41): Working ask, note beats.
- statusWord (glyph.tsx:47): readout, run subtitle.

**Graph**
- layoutMachine / fit / Drawing: graph.tsx:21/73/94.
- MachineGraph (inline, .gview .gtools .chip): run.tsx:308, editor.tsx:170.
- FullGraph (.full .hud .full-top .zoom .chip .full-bottom .legend): graph.tsx:194.
- Thumb (.thumb): machines.tsx:34.
- Leader (.leader .ll .lt): run.tsx:168.
- HUD markup duplicated: run.tsx:306 and graph.tsx:242.

**Runs**
- Row (.row .big .sel .r-glyph .r-main .r-title .r-sub .r-ask .r-side .r-time .r-agent .r-go .glyph-wait): runs.tsx:11.
- Groups (.group .eyebrow .n .rows): runs.tsx:73.
- .empty: runs.tsx:67, machines.tsx:23.

**Machines**
- Row (.row .mrow .r-thumb .r-flag .r-meta): machines.tsx:33.

**Run page**
- KV (dl.kv dd.short/prose): run.tsx:15. Used in .handed, Finished, Beat, Facts.
- Clamp (.clamp .link): run.tsx:26. Used in why, Waiting, Working, Finished, Beat, checks.
- Cancel (.btn quiet/danger): run.tsx:38.
- Asks: Blocked run.tsx:58 (.ask-grid .kind h2 .needs .num .why .why-k .answer label textarea .answer-foot .hint .err .btn.primary); Waiting run.tsx:86 (.lede .handed .eyebrow .label .choices .choice .tick .cn .ct .cd); Working run.tsx:124 (.answer.quiet .latest .prog .next .ev .arrow); Finished run.tsx:146 (.agent-inline).
- Story (.sec-h .chapters .chapter .now .ch-h .ch-t .ch-m .beats): run.tsx:230.
- Beat (.beat .you/.agent .move/.note/.stop/.refused .who .actor time .what .bh blockquote .needs.small): run.tsx:207.
- Facts (.facts h3 .checks .cw .fact-agent .fa-n .fa-s): run.tsx:255.
- Readout (.readout .rs .ra .rt): run.tsx:295, editor.tsx:173.

**Editor**
- Line / Area (.field .k .hint .prose): editor.tsx:37/40.
- KindGlyph (.kglyph): editor.tsx:48.
- Block (.blk .sel .sum .s-k .s-t .s-id .tag .body .blk-foot .add): editor.tsx:53. Name collides with glyph.tsx `Block`.
- .workspace .stage-ed .stage-bar .seg .skill-pane .skill .inspector .insp-scroll .insp-h .insp-group .pair .problems .p-h .p .p-ok: editor.tsx:158-233.
- useMeasuredHeight (bug A35): editor.tsx:63.

**Agent marks**
- AgentMark (.amark-wrap .tile .amark): agent-icons.tsx:94. Run rows 14 (runs.tsx:37); history beats 14 (run.tsx:224); inline lede/subtitle 15 (run.tsx:156, 299); facts tile 18 (run.tsx:267).
- Mark: main.tsx:39 at 22 px.
- Favicons: src/ui/public; icon-192/512 unreferenced.

**Utilities**
- api.ts: since/span/hhmm/human/walk/ahead/needsYou/isLive/latestOf/machineFor.
- runs.tsx:9 trunc; graph.tsx:19 clip; run.tsx:12-13 fmt/isShort.

## Raw values to replace

- Hex (line: value): 47 #e9e9ee/#fff · 48 #b8494d/#d77a7d · 50 #8a8a94 · 96, 157, 231, 232 #0a0a0c · 97, 228 #fff · 121 #303037 · 166 #2e2e36 · 168 #2e2e35 · 203, 212, 215, 418 #2a2a31 · 206, 213, 390 #7d7d88 · 215, 234 #17171c · 220 #121216 · 221 #22222a/#4a4a54 · 229 #ffffffd0 · 230 #ffffffb0 · 233 #1a1206 · 245 #1d1d23/#3a3a43 · 249, 251 #4a4a53 · 290 #1f1f26 · 328 #24242b · 370 #101014/#070709 · 376 #0c0c0f · 390 #34343c/#55555e · 444 #1c1c22 · 445 #202027.
- Durations: .12 .15 .18 .2 .25 .28 .32 .4 .45 .5 .6 .7 1.1s.
- Inline styles: graph.tsx:126 (cursor), 129 (lit fill, keep), 174 (height, keep), 247 (transform, keep); mark.tsx:13; run.tsx:32 (line clamp, keep); agent-icons.tsx:105 (--amark, keep).
