# UI v3 direction

The owner's words: "softer, elegant, bubbly", and "so much happening, it's really hard for me to focus". Soft here means tone and space, not blur. The rule under every decision: **one thing per screen asks for you; everything else is one step away.**

## Decisions

- **Surface.** Three layers of near-black, no borders between them: the page (`#09090b`) holds the rail, a rounded sheet (`#111113`, radius 22) holds the content, and groups sit on cards (`#18181b`, radius 20). Inputs and hover use `#202024`. Depth comes from tone and a faint top-left highlight, the same light as on the mark. No hairline boxes, no glow, no glass, no gradients.
- **Shape.** Large radii: 20 for cards, 14 for blocks inside them, 12 for nav items, pills for buttons and switches. More space: 40 px above the title, 44 px between sections, one reading column (760 px) for Runs, Run and Machines.
- **Type.** Geist Sans for everything a person reads; four sizes: 28 page title, 20 card title, 15 body, 13 labels and meta. Two weights: 400 and 500. Geist Mono (12.5) only for what the tool names: step ids, event names, payload keys, short values. Long values from the agent are prose and are set as prose.
- **Colour.** One accent, `#3b82f6`, for the current thing: the current step, and the surface of the card that is your move (`#131b2c`). Status is a dot and a word, never a filled block: amber waits on you, blue runs, green succeeded, red failed, grey cancelled. Text in three tones (`#ededef`, `#a1a1aa`, `#8b8b94`, all at least 4.8:1 on every surface).
- **Hierarchy.** Each screen has one primary thing. Runs: the run waiting on you. Run: your move (or the outcome). Machines: the list. Editor: the steps. Secondary information folds into a row with a one-line summary (History, Map, Inputs and checks; Name, inputs and checks).
- **Motion.** Small and only where it explains a change: a page settles in (6 px, 260 ms, ease-out), a folded row's chevron turns and its body fades in, a button presses to 0.96, the card cross-fades when you resume. Under reduced motion, opacity only. Nothing loops, nothing pulses.
- **Copy.** Plain and specific: "Waiting on you", "Your answer", "Resume the run", "Open machine". The agent's own words are shown as written. No middle-dot metadata strings.

## Navigation model

- **Rail.** The mark and "machine", then Runs and Machines. Runs carries a count of runs waiting on you, on every screen. Nothing else lives in the rail except a quiet "Keyboard" link; the connection state appears there only when it drops.
- **Inbox.** The top of Runs is "Waiting on you": one card per blocked or waiting run, saying where it stopped and what it asks. It is the only place that lists them.
- **Back.** Every inner page has one back link above its title, and it names where it goes: "Runs", "Machines", or "Back to the run" when you came from one. `esc` does the same thing.
- **Across.** A run links to its machine ("Open machine"); a machine links to the run waiting on you ("1 waiting on you").
- **Keyboard.** `j`/`k` move in a list, `enter` opens, `esc` closes then goes back, `g r` and `g m` jump, `?` shows these. The selection is drawn only after a key is pressed.
- **No command palette** for now: two destinations and five machines do not need one. Add it when the machine list needs search, and let it replace that search.

## Run page, in order

The back link and "Open machine"; the machine's name; one line (step, start, agent, last update); the path taken as step names with the current one lit; the card (Your move, The agent is working, or the outcome); then History, Map, Inputs and checks, folded. When the run is blocked, the card leads with the agent's questions, numbered, then its note clamped to three lines, then an answer field and **Resume the run**. The answer is stored with the unblock and must be returned to the agent in its next state card (an engine change; see audit).
