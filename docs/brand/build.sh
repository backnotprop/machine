#!/usr/bin/env bash
# Regenerates index.html and the shortlist SVGs from one set of glyph definitions.
# Grid: 64-unit viewBox, 4 units = 1px at 16px. Strokes are 8 units (2px at 16px) on a 4-unit grid.
# @F = accent fill, @S = accent stroke. In the page they resolve to var(--acc), which .mono sets to currentColor.
set -euo pipefail
cd "$(dirname "$0")"

SW='fill="none" stroke="currentColor" stroke-width="8"'

declare -A G
G[1a]='<rect x="12" y="4" width="40" height="16" rx="5"/><rect x="28" y="20" width="8" height="8"/><path d="M20 28H44L32 40Z"/><rect x="12" y="44" width="40" height="16" rx="5" @F/>'
G[1b]='<rect x="4" y="4" width="56" height="56" rx="16" fill="none" stroke-width="8" @S/><rect x="16" y="16" width="32" height="32" rx="7"/>'
G[1c]="<path d=\"M26 20L16 44M38 20L48 44\" $SW/>"'<rect x="16" y="4" width="32" height="16" rx="5"/><rect x="4" y="44" width="20" height="16" rx="5"/><rect x="40" y="44" width="20" height="16" rx="5" @F/>'
G[1d]="<rect x=\"8\" y=\"20\" width=\"16\" height=\"24\" rx=\"3\" $SW/>"'<rect x="28" y="28" width="6" height="8"/><path d="M32 20V44L42 32Z"/><rect x="44" y="16" width="16" height="32" rx="4" @F/>'
G[2a]="<path d=\"M12 60V22a10 10 0 0 1 20 0V60M32 22a10 10 0 0 1 20 0V40\" $SW/>"'<rect x="44" y="44" width="16" height="16" rx="4" @F/>'
G[2b]="<path d=\"M12 46V22a10 10 0 0 1 20 0V46M32 22a10 10 0 0 1 20 0V46\" $SW/>"'<rect x="4" y="44" width="16" height="16" rx="4"/><rect x="24" y="44" width="16" height="16" rx="4"/><rect x="44" y="44" width="16" height="16" rx="4" @F/>'
G[2c]='<path d="M4 60V20A12 12 0 0 1 16 8H24A12 12 0 0 1 36 20V60H24V20H16V60Z"/><path d="M44 8A12 12 0 0 1 56 20V60H44Z" @F/>'
G[2d]="<path d=\"M12 60V22a10 10 0 0 1 20 0V60M32 22a10 10 0 0 1 20 0V44\" $SW/>"'<path d="M42 44H62L52 58Z" @F/>'
G[3a]='<rect x="8" y="4" width="8" height="56"/><rect x="48" y="4" width="8" height="56"/><rect x="16" y="12" width="32" height="8"/><rect x="16" y="28" width="32" height="8" @F/><rect x="16" y="44" width="32" height="8"/>'
G[3b]='<rect x="8" y="28" width="48" height="8"/><circle cx="10" cy="32" r="8"/><circle cx="32" cy="32" r="8"/><circle cx="54" cy="32" r="8" @F/>'
G[3c]='<rect x="4" y="4" width="56" height="8" rx="2"/><rect x="4" y="52" width="56" height="8" rx="2"/><path d="M8 28H32V20L48 32L32 44V36H8Z" @F/>'
G[4a]="<rect x=\"8\" y=\"16\" width=\"48\" height=\"32\" rx=\"16\" $SW/>"'<circle cx="24" cy="32" r="8" @F/>'
G[4b]='<path fill-rule="evenodd" d="M18 4H46A14 14 0 0 1 60 18V46A14 14 0 0 1 46 60H18A14 14 0 0 1 4 46V18A14 14 0 0 1 18 4ZM16 32A16 16 0 1 0 48 32A16 16 0 1 0 16 32Z"/><circle cx="32" cy="32" r="8" @F/>'
G[4c]='<rect x="12" y="28" width="28" height="8"/><rect x="24" y="28" width="16" height="32"/><rect x="12" y="52" width="40" height="8"/><circle cx="32" cy="12" r="8" @F/>'
G[4d]='<circle cx="16" cy="16" r="12" @F/><circle cx="48" cy="16" r="12"/><circle cx="16" cy="48" r="12"/><circle cx="48" cy="48" r="12"/>'
G[5a]='<rect x="8" y="4" width="8" height="56"/><rect x="8" y="4" width="16" height="8"/><rect x="8" y="52" width="16" height="8"/><rect x="48" y="4" width="8" height="56"/><rect x="40" y="4" width="16" height="8"/><rect x="40" y="52" width="16" height="8"/><circle cx="32" cy="32" r="8" @F/>'
G[5b]='<rect x="4" y="28" width="22" height="8"/><path d="M22 18L38 32L22 46Z"/><rect x="44" y="20" width="16" height="24" rx="4" @F/>'
G[5c]='<path d="M4 52V16A8 8 0 0 1 12 8H36A8 8 0 0 1 44 16V52H36V16H28V52H20V16H12V52Z"/><rect x="48" y="52" width="12" height="8" @F/>'

page_glyph() { local s="${G[$1]}"; s="${s//@F/style=\"fill:var(--acc,#3b82f6)\"}"; s="${s//@S/style=\"stroke:var(--acc,#3b82f6)\"}"; printf '%s' "$s"; }
file_glyph() { local s="${G[$1]}"; s="${s//@F/fill=\"#3b82f6\"}"; s="${s//@S/stroke=\"#3b82f6\"}"; printf '%s' "$s"; }
g() { printf '<svg class="g" width="%s" height="%s" viewBox="0 0 64 64" aria-hidden="true"><use href="#s-%s"/></svg>' "$2" "$2" "$1"; }

lockup() { # id style
  case "$2" in
    tittle) printf '<span class="wm">mach<span class="ti">&#305;<b></b></span>ne</span>' ;;
    mono)   printf '%s<span class="wm m">machine</span>' "$(g "$1" 24)" ;;
    *)      printf '%s<span class="wm">machine</span>' "$(g "$1" 24)" ;;
  esac
}

card() { # id name lockupstyle says weak
  cat <<EOF
<article class="card">
  <header><span class="id">$1</span><h3>$2</h3></header>
  <div class="stage">
    <div class="big">$(g "$1" 64)</div>
    <div class="sizes">
      <figure>$(g "$1" 32)<figcaption>32</figcaption></figure>
      <figure>$(g "$1" 16)<figcaption>16</figcaption></figure>
      <figure class="mono">$(g "$1" 32)<figcaption>mono</figcaption></figure>
      <figure class="mono">$(g "$1" 16)<figcaption>16</figcaption></figure>
    </div>
  </div>
  <div class="lock">$(lockup "$1" "$3")</div>
  <div class="lock light">$(lockup "$1" "$3")<span class="fav">$(g "$1" 16)</span></div>
  <p class="note"><b>Says</b> $4 <b>Weak</b> $5</p>
</article>
EOF
}

direction() { # num name rationale
  cat <<EOF
<section class="dir">
  <div class="dhead"><span class="num">0$1</span><h2>$2</h2><p>$3</p></div>
  <div class="cards">
EOF
}
end_direction() { echo '  </div></section>'; }

insitu() { # id slug name why
  cat <<EOF
<div class="pick">
  <div class="pickhead"><span class="id">$1</span><h3>$3</h3><code>docs/brand/$2.svg</code></div>
  <p>$4</p>
  <div class="situ">
    <div class="side">
      <div class="brand">$(g "$1" 16)<span>machine</span></div>
      <div class="nav on"><span>Runs</span><span class="count">1</span></div>
      <div class="nav"><span>Machines</span></div>
    </div>
    <div class="tabs-wrap">
      <div class="tabs">
        <div class="tab"><i class="other"></i><span>Pull requests</span></div>
        <div class="tab on">$(g "$1" 16)<span>Runs &middot; machine</span></div>
        <div class="tab">$(g "$1" 16)<span>changelog-draft</span></div>
        <div class="tab"><i class="other r"></i><span>Docs</span></div>
      </div>
      <div class="tabs light">
        <div class="tab"><i class="other"></i><span>Pull requests</span></div>
        <div class="tab on">$(g "$1" 16)<span>Runs &middot; machine</span></div>
        <div class="tab">$(g "$1" 16)<span>changelog-draft</span></div>
        <div class="tab"><i class="other r"></i><span>Docs</span></div>
      </div>
    </div>
  </div>
</div>
EOF
}

{
cat <<'EOF'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>machine: identity sheet</title>
<style>
:root {
  --bg: #0a0a0a; --surface: #0f0f0f; --raised: #161616; --border: #262626; --border-strong: #333333;
  --text: #ededed; --text-2: #a1a1a1; --text-3: #666666; --accent: #3b82f6;
  --sans: "Geist Sans", Inter, system-ui, sans-serif;
  --mono: "Geist Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
main { max-width: 1240px; margin: 0 auto; padding: 48px 32px 64px; }
h1, h2, h3, p { margin: 0; }
code, .id, .num, figcaption { font-family: var(--mono); }
svg.g { display: block; fill: currentColor; flex: none; }
.mono { --acc: currentColor; }

.top { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 32px; border-bottom: 1px solid var(--border); }
.top h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.top p { color: var(--text-2); max-width: 760px; }
.top p.how { color: var(--text-3); font-size: 13px; margin-top: 4px; }
.top .meta { margin-left: auto; font: 12px var(--mono); color: var(--text-3); white-space: nowrap; }

.dir { padding: 40px 0 8px; }
.dhead { display: grid; grid-template-columns: 40px 220px 1fr; gap: 0 16px; align-items: baseline; margin-bottom: 16px; }
.dhead .num { color: var(--text-3); font-size: 12px; }
.dhead h2 { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.dhead p { color: var(--text-2); max-width: 680px; }

.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.card { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; display: flex; flex-direction: column; }
.card header { display: flex; align-items: baseline; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.card header .id { font-size: 12px; color: var(--text-3); }
.card header h3 { font-size: 13px; font-weight: 500; }
.stage { display: flex; align-items: center; gap: 24px; padding: 20px 16px; border-bottom: 1px solid var(--border); }
.big { width: 64px; height: 64px; }
.sizes { display: flex; align-items: flex-end; gap: 14px; }
.sizes figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.sizes figcaption { font-size: 10px; color: var(--text-3); line-height: 1; }
.sizes figure.mono { color: var(--text-2); }
.lock { display: flex; align-items: center; gap: 10px; height: 64px; padding: 0 16px; border-bottom: 1px solid var(--border); }
.lock.light { background: #ffffff; color: #0a0a0a; border-bottom: 0; }
.lock .fav { margin-left: auto; }
.wm { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1; }
.wm.m { font-family: var(--mono); font-weight: 500; letter-spacing: -0.03em; }
.ti { position: relative; display: inline-block; }
.ti b { position: absolute; left: 50%; top: -0.06em; width: 0.26em; height: 0.26em; margin-left: -0.13em; border-radius: 50%; background: var(--acc, #3b82f6); }
.note { flex: 1; padding: 12px 16px 14px; font-size: 12px; color: var(--text-2); }
.note b { font-weight: 500; color: var(--text); }

.short { margin-top: 48px; padding-top: 40px; border-top: 1px solid var(--border); }
.short > h2 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.short > p { color: var(--text-2); margin-bottom: 20px; }
.pick { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 16px; margin-bottom: 16px; }
.pickhead { display: flex; align-items: baseline; gap: 10px; }
.pickhead .id { font-size: 12px; color: var(--text-3); }
.pickhead h3 { font-size: 14px; font-weight: 600; }
.pickhead code { margin-left: auto; font-size: 12px; color: var(--text-3); }
.pick > p { color: var(--text-2); margin: 4px 0 16px; max-width: 820px; }
.situ { display: flex; gap: 16px; align-items: stretch; }
.side { width: 220px; flex: none; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px 12px; }
.side .brand { display: flex; align-items: center; gap: 10px; padding: 6px 10px 18px; font-weight: 600; letter-spacing: -0.01em; }
.side .nav { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 6px; color: var(--text-2); font-size: 14px; }
.side .nav.on { background: var(--raised); color: var(--text); }
.side .count { font: 12px var(--mono); color: var(--text); background: var(--raised); border: 1px solid var(--border); border-radius: 999px; padding: 0 7px; line-height: 18px; }
.tabs-wrap { flex: 1; display: flex; flex-direction: column; gap: 12px; justify-content: center; min-width: 0; }
.tabs { display: flex; gap: 2px; background: #161616; border: 1px solid var(--border); border-radius: 6px; padding: 6px 6px 0; color: var(--text); }
.tab { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; width: 190px; font-size: 12px; color: var(--text-2); border-radius: 6px 6px 0 0; white-space: nowrap; overflow: hidden; }
.tab.on { background: var(--bg); color: var(--text); }
.tab .g { color: var(--text); }
.tab i.other { width: 16px; height: 16px; border-radius: 4px; background: #404040; flex: none; }
.tab i.other.r { border-radius: 50%; }
.tabs.light { background: #e8e8e8; border-color: #d4d4d4; }
.tabs.light .tab { color: #525252; }
.tabs.light .tab.on { background: #ffffff; color: #0a0a0a; }
.tabs.light .tab .g { color: #0a0a0a; }
.tabs.light i.other { background: #b4b4b4; }
footer { margin-top: 32px; font-size: 12px; color: var(--text-3); }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
EOF
for k in $(printf '%s\n' "${!G[@]}" | sort); do printf '<g id="s-%s">%s</g>\n' "$k" "$(page_glyph "$k")"; done
cat <<'EOF'
</defs></svg>
<main>
<div class="top">
  <div>
    <h1>machine &middot; identity sheet</h1>
    <p>machine is a web UI where you draw a process as a state machine; publishing it gives an agent a skill and a definition that a tool enforces step by step.</p>
    <p class="how">Each card shows one glyph at 64, 32 and 16 px, then in one colour (mono), then the lockup on dark and on white with a 16 px favicon. Blue is used on at most one part of each glyph.</p>
  </div>
  <span class="meta">5 directions &middot; 18 variations &middot; 2026-10-19</span>
</div>
EOF

direction 1 "Node and edge" "The product already draws every process as rounded nodes joined by arrows, with the current node in blue. A mark taken from that graph is one people have seen before they notice it is the logo."
card 1a "Step" plain "One state leads to the next, and the lower one is where the run is now." "At 16 px the arrowhead nearly touches the lower node and the whole thing can read as a funnel."
card 1b "Current" plain "The current node with a ring around it, as in the run graph." "Also reads as a stop button or a generic app tile."
card 1c "Branch" plain "A decision state with two outcomes, one of them taken." "Close to the usual sitemap and hierarchy icons."
card 1d "Pair" plain "From this state to that one, read left to right." "Too many parts for 16 px: the arrow and the hollow node close up."
end_direction

direction 2 "The m as a graph" "An m is three stems joined by two arches, which is close to nodes joined by edges. These keep the letter readable and let one part stand for the current state."
card 2a "m, current node" plain "The letter is the process; its last step is split off and lit as the current state." "The detached square can read as a full stop after the m."
card 2b "m on nodes" plain "The letter stands on three states, the last one current." "Heavy at 16 px; the 1 px gaps between the feet start to close."
card 2c "Cut m" plain "Two steps joined, the next one cut away and lit: a transition in a single letter." "Can read as an n followed by an l."
card 2d "m with arrow" plain "The process runs down and out into the next step." "The arrow pulls it toward a download icon, and at 16 px the arrowhead is a smudge."
end_direction

direction 3 "On the rails" "The README says a tool keeps agents on the rails. These marks show a fixed track with steps or a direction held inside it."
card 3a "Ladder" plain "Two rails that do not move, with steps between them and one active." "Reads as a ladder, which suggests climbing rather than following."
card 3b "Stepper" plain "Steps in order, the last one live." "Every progress stepper looks like this, and the dots fall off the pixel grid, so it goes soft at 16 px."
card 3c "Guard rails" plain "The agent moves forward between two rails it cannot leave." "Small, it looks like a media control or a text-wrap icon."
end_direction

direction 4 "Status dot" "Every run is shown as a dot and a word, and the blue dot means running. These marks put that dot inside a shape so the logo carries the same signal as the interface."
card 4a "Pill" plain "The status pill, the element repeated most in the UI." "Reads as a toggle switch."
card 4b "Lit node" plain "The current sidebar square with a status dot cut into it, so the brand row barely changes." "A dot in a square is not distinctive alone; in one colour it relies on the cut ring."
card 4c "Tittle" tittle "The dot on the i is the running dot; the wordmark carries the signal with no glyph." "The glyph alone reads as an information icon."
card 4d "Four states" plain "Running, waiting, blocked, succeeded, with one lit." "A 2&times;2 grid reads as an app launcher."
end_direction

direction 5 "Mono token" "Everything the agent or the tool produces is set in Geist Mono, and ids are snake_case. These marks borrow one typed token and pair with a mono wordmark."
card 5a "Bracketed state" mono "A state, held in brackets the way a schema would hold it." "Brackets are common across developer tools."
card 5b "Event into state" mono "An event arriving at a state, as in drafted &rarr; self_review." "Most of the mark is a plain arrow; in one colour it is an arrow and a box."
card 5c "m_" mono "A snake_case id with the cursor where the next part goes." "Close to terminal and CLI icons."
end_direction

cat <<'EOF'
<section class="short">
  <h2>Shortlist</h2>
  <p>Three picks, each shown as the 220 px sidebar brand row and as a favicon in a tab strip on dark and light.</p>
EOF
insitu 4b lit-node "Lit node" "It is the square the app already uses, with the running dot cut into it: the smallest change to the product, the strongest favicon of the set, and it still works in one colour because the dot sits in its own ring."
insitu 2a m-node "m, current node" "The only pick that reads as the name; it is an m drawn with the same stroke as the graph edges, and its last step being separate and lit says where the run is."
insitu 1a step "Step" "It is the run graph reduced to two nodes and one edge, so it explains the product without a word, and it holds up at 16 px."
cat <<'EOF'
</section>
<footer>Glyphs are drawn on a 64-unit grid with 8-unit strokes, so they land on whole pixels at 16, 32 and 64 px. Regenerate with <code>docs/brand/build.sh</code>.</footer>
</main>
</body>
</html>
EOF
} > index.html

for pair in 4b:lit-node 2a:m-node 1a:step; do
  id="${pair%%:*}"; slug="${pair#*:}"
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="currentColor">%s</svg>\n' "$(file_glyph "$id")" > "$slug.svg"
done
echo "built index.html and shortlist svgs"
