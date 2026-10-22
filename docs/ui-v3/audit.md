# UI v3 audit: what competes for attention

Captured 2026-10-19 from http://localhost:7420 at 1440 by 900, five machines and five runs, one of them blocked. Screens are in `before/`, the prototype's in `after/`, side by side in `compare.html`. The counts come from `shoot.mjs`, which measures what is visible in the first viewport (no scrolling) on both.

## The three biggest focus problems

1. **The run that needs you does not lead with what it needs, and your answer has nowhere to go.** On the blocked run, the two questions sit under a six-line note from the agent. They are drawn as checkboxes that do nothing. The only action is "I fixed it, resume", but the agent did not ask you to fix anything; it asked you to decide two things. There is no field for the decision. The API already takes a note on unblock (`api.unblock(id, note)`), but the UI never sends one, and the engine's state card does not hand that note back to the agent when it resumes (`engine.ts`, `card()`). So the one decision the product exists to collect cannot reach the agent through the product.
2. **Everything has the same weight.** Every screen is hairline-bordered cards with mono and sans mixed in the same row and a status pill on every row. The blocked run is one row of five, the same height and contrast as four finished ones. The run page has 13 bordered boxes in the first viewport; the editor has 22. Nothing tells the eye where to land, so it reads all of it.
3. **The map and the metadata are always on.** The run page gives the right third of the screen to a 15-step graph with 32 labels at about 9 px, then Inputs (a 70-character temp path) and Preflight (six green dots). The graph's current node is the only other blue on the screen, so it pulls the eye away from the card you are meant to act on. None of it is needed to answer the agent.

## Counts, first viewport

| screen | text items | graph labels | type styles | bordered boxes |
|---|---|---|---|---|
| Runs | 55 → 27 | 0 → 0 | 9 → 7 | 9 → 0 |
| Run, blocked | 45 → 30 | 32 → 0 | 10 → 8 | 13 → 0 |
| Run, finished | 46 → 37 | 32 → 0 | 10 → 8 | 10 → 0 |
| Machines | 44 → 25 | 0 → 0 | 9 → 6 | 3 → 0 |
| Editor | 47 → 42 | 22 → 11 | 10 → 7 | 22 → 0 |

"Text items" counts visible text runs; "type styles" counts distinct font, size and weight combinations. The editor's text count barely drops because the list of 15 steps is the content; what changed there is that the list is now the only thing at full contrast.

How many times the app tells you a run needs you, on one screen: **Runs before: 5** (rail badge, "1 needs you" subtitle, "Needs you · 1" filter, the Needs column, the red "blocked" pill). **After: 2** (rail count, the card). **Run page before: 3** (header pill, card pill, "Your move"). **After: 1** ("Your move").

## Navigation

- **Run to its machine and back.** "Open machine" goes to the editor, whose breadcrumb says "Machines". The way back to the run is the browser's back button; `esc` in the editor goes to the machine list, not the run. *Fix:* the back link names where you came from ("Back to the run") and `esc` follows it.
- **Machine to its runs.** There is no path. The machines table shows "Runs 2" as a number you cannot click. *Fix:* the editor's subtitle says "2 runs, 1 waiting on you" and the waiting part links to the run.
- **Where you are.** The Runs header repeats the sidebar with a "Machines" button, so the two ways to leave look like two different places. The page title and breadcrumb share one line with a status pill, so the title is never alone. *Fix:* the rail is the only place destinations live; each page has one back link above one title.
- **What "needs you" means and where it lives.** It means blocked or waiting, but the words change by place: "needs you", "Needs", "blocked", "Your move", "I fixed it". *Fix:* one place, the top of Runs, titled "Waiting on you", where each card says what the agent asks in its own words. The rail count follows you to every screen. Inside the run it is "Your move", once.
- **Keyboard.** `j`/`k`/`enter` work on the two lists and `esc` goes back from the run, but the hint "↑↓ move · ⏎ open" is printed permanently in the table header, and the first row is drawn as selected on load even though nothing was selected. *Fix:* the selection is drawn only after a key is pressed, and the hints live behind `?`.
- **A command palette** would add a surface without removing one: there are two destinations and five machines. Revisit it when the machine list needs search; then it should replace that search, not sit beside it.

## Runs

**The one job:** see whether anything waits on me, and open it.

**What pulls the eye away:** a six-column table where four columns do not serve the job (version, state id in mono, agent name, and a Needs column that shows only a dash four times out of five). Five status pills of equal weight. A four-way filter for five runs. A "Machines" button that repeats the sidebar. A permanent keyboard hint. A "live localhost:7420" footer whose blue dot looks like a run status. Machine ids in mono where names exist.

**Fix:** a "Waiting on you" card per blocked or waiting run, on a soft blue surface, with the machine's name, where it stopped, how many answers it needs, the first question, and one button. Under it, Running and Finished as a quiet list: dot, name, outcome (the final step's title, such as "Shipped and smoke-tested"), time. Sections replace the filter and appear only when they have runs. The connection indicator appears only when the connection drops.

## Run, blocked

**The one job:** answer what the agent asks, and let it continue.

**What pulls the eye away:** the header's mono line with five parts joined by middle dots (run id, machine id and version, start, agent, update). The status pill twice. Cancel run in the header, next to the primary navigation. The six-line note before the questions. Checkboxes that do nothing. "I fixed it, resume" for questions that ask for a decision. The previous step's payload (`notes_published true`, `install_scripts unchanged`) printed under the button with no label, so it reads like part of the action. The history starting right under the card with `begin → scope`. The graph, Inputs and Preflight in the right column.

**Fix:** one column. Above the card, the path the run took as a single line of step names with the current one lit, the same image as the mark: blocks on a path, one of them blue. The card leads with the questions, numbered, then the agent's note clamped to three lines with "Read the agent's full note", then "Your answer", then **Resume the run**, with Cancel run set apart on the right and confirmed in place. History, Map, and Inputs and checks are three folded rows under the card, each with a one-line summary. Everything a person needs to act fits in the first 900 px.

## Run, finished

**The one job:** see how it ended and what the agent handed over.

**What pulls the eye away:** the same graph and side cards. The agent's summary is set in mono with `word-break: break-all`, so words split mid-word ("script s/install.sh", "fi xture", "Owne r"). That is a defect, not taste.

**Fix:** a neutral card with the outcome ("Succeeded 3h ago", "Shipped and smoke-tested") and the last report. Keys stay mono because they are the tool's words. Short values stay mono; long values read as text, wrap normally and keep the agent's line breaks.

## Machines

**The one job:** find a machine and open it, or start a new one.

**What pulls the eye away:** descriptions up to four lines set the row height, so the list has no rhythm. Each name has a mono id and version under it. Three number columns (States, Runs, Last run). A "5 machines" subtitle repeats a count you can see.

**Fix:** one row per machine: name, one line of description, when it last ran. A waiting count appears only on a machine that has a run waiting on you. The id and version move to the editor, where they are used.

## Editor

**The one job:** read the process, change one step, publish.

**What pulls the eye away:** you land inside a form for id, name, description and initial state, the part you change least. Everything is mono, including the machine's name. Each state row is a mono string of events joined by middle dots. The graph has the same weight as the list, with all 22 edge labels. Publish is a grey disabled button that looks broken. The Graph and Skill switch sits in the page header, far from the pane it changes.

**Fix:** open on the steps by title, none expanded, with "then qa or empty" under each and the id small on the right. Name, inputs and checks fold into one row at the top. The map loses its card and its labels; picking a step (in the list or on the map) lights that node and its outgoing events. The page header says "Published v1" until something changes, then shows **Publish v2**. The Map and Skill switch sits on the pane it controls.

## Kept on purpose

The data and the order it arrives in. The state machine graph, now calmer and one step away. "Your move" as the name of the human's turn. The history as the agent's own record, grouped by step, with what each step produced first and the agent's notes under it. Mono for ids, event names and payload keys. `j`/`k`/`enter`/`esc`.

## Out of scope for the prototype

Live updates over SSE, the waiting state with real human events (no run is waiting today; the prototype renders it from the same code path, untested against real data), a new machine, the Skill text editing, light mode, and error states for failed API calls.
