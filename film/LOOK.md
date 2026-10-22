# The launch film's look and sound, as built (cut 19)

Everything below is read from `film/film.html`, `film/mix.ts`, `film/music.ts`, `video/voice.ts`, `video/sfx.ts`, `video/sfx3.ts` and `docs/brand/final/`. Values are the ones in the code, not approximations.

## 1. Ground and light

- **Ground**: a flat `#09090b` (`P.page`) filled well past the frame (so the camera can push in), then one radial "key" of white at 3.5 % opacity: centre (960, 520), inner radius 100, outer 1100, `rgba(255,255,255,.035) → 0`. That is the only light on the floor. No gradient sky, no horizon. (`floor()`)
- **Post, every frame** (`post()`): a vignette, radial from 460 to 1300 px around centre, `rgba(0,0,0,0) → rgba(0,0,0,.55)`; then grain: a 256 px tile of random grey (128 ± 45), drawn with `globalCompositeOperation = 'overlay'` at `globalAlpha = .035`, offset by `(frame·37 mod 256, frame·91 mod 256)` so it crawls; then the closing fade to black over `T.fade`.
- **Objects are lit from above**, like a block under a lamp, and that is done per object, not with a scene light (`pill()`, `key()`):
  - a drop shadow first: `shadowColor rgba(0,0,0,.75)`, `shadowBlur 34`, `shadowOffsetY 16` on a `#0d0d10` fill (the keycaps: `.8`, blur 40, offset 18, fill `#08080a`);
  - a vertical body gradient `#1d1d23 → #101014` (hollow/empty objects `#121216 → #0c0c0f`; keycaps `#2c2c34 → #16161b`);
  - a **rim light**: clipped to the shape, a 2 px stroke with a vertical gradient `rgba(255,255,255,.28) → 0` over the top 55 % of the height (keycaps 2.5 px, `.35`, top 50 %);
  - a 1 px hairline `rgba(255,255,255,.08)` around the whole shape;
  - when lit by status or an agent, a coloured ring: `shadowColor = colour @ .55`, `shadowBlur 30`, stroke `colour @ .85`, 1.5 px. That glow is the "bloom": there is no full-frame bloom pass.
  - an optional sweep: a 220 px wide white band at 9 % moving across the face (`sweep` 0→1), used when something is being drafted.
- **No haze layer, no depth of field, no motion blur.** The only blur is the outro: the whole world is drawn into a smaller canvas (`k = 1/(1 + blur·.9)`, blur rising 0→8 over 1.1 s) and scaled back up under an 86 % wash of the page colour.
- Agent chips: a `#0c0c0f` disc, 1.6 px ring in the agent's colour, `shadowBlur 20` at the ring colour, radius 13–15.

## 2. Palette

Scene (`P`): page `#09090b`, ink `#ededef`, ink2 `#a3a3ad`, ink3 `#7d7d87`, ink4 `#45454d`, blue-hi `#9cc4ff`, red `#ff5d62`, amber `#f2b45a`, green `#6ee7a0`, claude `#e8956a`.

Lines (rails between states): `#5a5a66` at 1.4 px, round joins, arrowhead a 9 px filled triangle in the same colour. A rail an agent is travelling brightens to `#9cc4ff` with a 9 px underglow of the blue at 18 %.

Agent colours: claude `#e8956a`, codex `#ededef`, gemini `#7fb2ff`, opencode `#c9c9d1`, cursor `#b7b7c6`, amp `#d9b3ff`, goose `#9fe0c0`. A mark sits grey (`#c9c9d1`) until its agent is active, then cross-fades to its colour.

Status by colour, nowhere else: amber is "a person decides" (the `approved` and `changes` edge labels, `waiting for sign-off`, `human` in the paper), green is done/provided (`approved`, `github · provided by the machine`), red is blocked/final-bad (the `blocked` state label at 90 %, `fail ×3`, a chip that turns red mixes its ring toward `#ff5d62`), the warm orange `#e8956a` is Claude, used for the chip, the active state's ring and the report dots. Blue-hi is the product's accent: the Publish button border, the publish seal (a 4/8 dotted ring, `lineDashOffset = −t·70`, with a 7 px haze stroke at 20 % under it), travelling rails.

Product UI tokens in the app itself (`film/frames/fonts.css` `:root`, same family): page `#0a0a0c`, ink-2 `#a3a3ad`, ink-3 `#85858f`, ink-4 `#4a4a53`, blue `#3b82f6`, red-hi `#ffa3a5`, amber-hi `#ffd9a1`, done `#e9e9ee`.

## 3. UI on black

- The product page is drawn in the scene's palette, not screenshotted. Surfaces are a shade lighter than the page: topbar pill `#131317`, the selected tab `#26262c`, the segmented control `#1c1c22`, the Send button `#2a2a31` (going to ink when live). Borders are white at 8–12 %. Elements that must read as pressable get the same rim-light treatment as the objects.
- Text on the page: titles Geist Sans 600 at 44 px tracking −1.4, subtitles 400 at 16 px in ink3, nav 500 at 17, tabs/buttons 500 at 15, body and chat 400 at 15–16, ids in mono 400 at 13–15.
- The dark SKILL.md page (`PAPER`): bg `#141418`, ink `#ededef`, ink2 `#b4b4bc`, ink3 `#7d7d87`, rules `rgba(255,255,255,.14)`, code rows and table rows `rgba(255,255,255,.05)`, blue `#9cc4ff`, amber `#f2b45a`, red `#ff5d62`. The sheet itself: a 4 px radius card with `shadowColor rgba(0,0,0,.85)`, `shadowBlur 70`, `shadowOffsetY 34`, a diagonal white sheen `.05 → 0` across it, and a 1 px `rgba(255,255,255,.12)` border. Lines are typed in one by one (`DOC_PER` apart) and then the sheet folds to a 220×150 card labelled `SKILL.md / auto-triage · v3` with 14 px corners.
- Paper type: `SKILL.md` header mono 500 12.5, h1 sans 600 30 tracking −.6, h2 sans 600 16, paragraphs and bullets sans 400 14, table headers mono 500 10.5 uppercase tracking 1.5, state ids mono 500 12.5 in blue, code mono 400 12. Line heights: h1 54, h2 40, p 30, rows 25, code 21.

## 4. Type and captions

- Fonts: **Geist Sans** (400/500/600, from `@fontsource/geist-sans`) and **IoskeleyMono** (400/500, from `src/ui/public/fonts/`) for ids, events, labels and the small caps lines. Geist Mono is loaded but the film's mono is Ioskeley.
- State labels: sans 500 at 19, tracking −.2, ink; edge labels mono 400 at 12 in ink3 (amber when human, red at 80 % when bad).
- The big lines ("Inside a state, full autonomy.", "Moving on goes through the machine."): Geist Sans 600 at **44 px**, tracking −1.2, ink, centred at y = 330. They enter over 0.8 s with `sm` (smoothstep) on alpha and a 10 px rise (`y + (1 − a)·10`), and leave over 0.5–0.6 s the same way. "Built for the work you repeat." is 600 at 34, tracking −.8, left at x = 110, y = 1012, same 10 px rise.
- Subtitle under the badge and the closing tag line: sans 500 at 34 in ink2, 8 px rise; the closing URL line is mono 400 at 13, ink4, tracking 4, uppercase.
- The runs counter: sans 600 at 54, tracking −2, with `RUNS · TODAY` mono 12 tracking 3 in ink4.

## 5. Camera and motion

- Easings: `io` = cubic in-out (the camera and anything that moves between two places), `out` = cubic out (things arriving), `oq` = quintic out, `inq` = quadratic in (things leaving), `sm` = smoothstep (every fade). `win(t, a, b)` clamps time into 0–1 between two keyframes; everything is `lerp(from, to, ease(win(...)))`, so every frame is a pure function of t.
- The camera is three numbers (cx, cy, zoom) between keyframes with `io`: `[0, 960, 540, 1] → [28.2, same] → [29.4, 690, 560, 1.9] → hold to 32.4 → [33.4, 960, 540, 1]`. So one push-in of 1.2 s to 1.9×, a 3 s hold, 1 s back. That is the only camera move. The graph itself moves by its own three numbers (`gview`: scale/centre) with `sm`, 1–1.6 s per move.
- Typical durations: fades 0.5–0.8 s, object moves 0.7–1.6 s, states appearing 0.16 s apart, the page's lines typing one every `DOC_PER` ≈ 0.35 s, a 1.2 s "flight" for a packet along a rail, pulses at 4 rad/s. Nothing is spring-based; nothing overshoots.
- Idle life: `wander(u, k)`, three incommensurate sines, for anything that should breathe without ever jumping.
- No depth of field, no motion blur. Smoothness comes from 60 fps and the eased curves.

## 6. The badge

An SVG, no shader and no raster: `film/logo.svg` is `docs/brand/final/gt-badge.svg` (natural 1180×220). It is drawn geometry (the letters are paths, not a font): a chamfered plate `#030405` with a 4 px stroke, a chrome bezel, blue enamel `#24519f → #123477 → #081c47` (vertical), a gloss `white .22 → 0` over the top, a red pinline, and italic chrome capitals whose "metal" is one vertical gradient with a hard horizon: `#fbfcfd, #e3e7ec, #a9b1ba, #6c747e` to 53 %, then `#1c2027` at 54 %, `#2f353d, #7a828c, #c3c9cf, #e9ecef`. The horizon step is what reads as chrome. Source `docs/brand/logo-src/gt.mjs`, rebuild `node docs/brand/logo-src/build-final.mjs`.

In the film it is `drawImage`d at 880 px wide (scaling 0.97 → 1.01 over the opening hold) with `shadowColor rgba(0,0,0,.7)`, `shadowBlur 70`, `shadowOffsetY 26`; 34 px high in the top bar; 44 px as a watermark; 190 px in the outro.

## 7. Sound

What cut 19 uses: **music and voice only. No sound effects.** `film/mix.ts`:

- Music: ElevenLabs Music (`film/music.ts`), prompt: "Instrumental. A warm, driving synthwave factory groove at 100 bpm: deep analog bass pulse, soft side-chained pads, a tight muted kick, rounded square-wave arpeggio, tape saturation. Dark, confident, cinematic, like the menu music of a sleek automation video game. No vocals, no harsh hi-hats, no bright cymbals, no risers, no sound effects. Low-passed, smooth top end. Builds slightly over the first half, steady to the end." Three tempos were rendered (80/90/100 bpm at 68 s); 90 was picked. In the mix: `lowpass=f=9000`, fade in 0.6 s, fade out 1.2 s, `volume=0.9`, then `sidechaincompress threshold=0.02 ratio=6 attack=8 release=320` keyed by the voice (6:1 duck).
- Voice: ElevenLabs `eleven_multilingual_v2` with timestamps, `stability .38, similarity .85, style .45, speed 1.06, speaker boost`, each line a file with `previous_text`/`next_text` for continuity, breaths trimmed (`film/trim-vo.ts`), `volume=1.4`, placed at the `VO` times.
- Master: `loudnorm I=-16 TP=-1.5 LRA=9`, 48 kHz, AAC 192k on the master and 160k on the web encode.

What was measured on the effects (2026-10-22, ffmpeg `astats`, overall RMS and peak, and RMS after two cascaded `highpass=f=4000`), the files in `video/audio/sfx/`:

| effect | RMS | RMS above 4 kHz | peak |
|---|---|---|---|
| riser | −9.9 | −15.1 | +1.6 |
| alarm | −3.3 | −25.6 | +1.0 |
| glitch | −17.0 | −18.3 | −0.4 |
| snap | −24.1 | −26.2 | +0.3 |
| steam | −22.6 | −22.7 | −5.9 |
| print | −25.4 | −28.6 | −9.2 |
| relay | −33.9 | −34.2 | −8.3 |
| keys | −33.5 | −36.9 | −8.6 |
| servo | −34.6 | −40.7 | −19.5 |
| hit | −11.1 | −41.8 | 0.0 |
| type | −33.9 | −44.0 | −10.4 |
| reveal | −11.7 | −77.9 | −0.4 |
| swell | −9.1 | −73.3 | −0.4 |
| music-90 | −15.8 | −68.7 | |

Reading it: the effects the owner called screeching are the ones whose energy is nearly all above 4 kHz (glitch, snap, steam, print, relay, keys: within 0–4 dB of their full-band level) and the ones that clip (riser, alarm, glitch, snap, hit, reveal, swell all peak at or above −0.5 dBFS). ElevenLabs sound generation ignores "no reverb / quiet / subtle" in a prompt and normalises every file to near full scale, so a "tiny quiet blip" arrives as loud as an alarm, and the thin ones sit right where the ear is most sensitive. The music, by contrast, has nothing above 4 kHz (53 dB down), which is why it never bites. Earlier cuts mixed these at gains of 0.2–0.5 on top of the music and voice; it still read as screech because the spectrum, not the level, was the problem.

What changed: cut 6 onward dropped the effect bed entirely and let the picture carry the beats (every move already has a visible cause). The music prompt bans hi-hats, cymbals, risers and effects and asks for a low-passed top, and the mix low-passes it again at 9 kHz.

If BYOA wants effects anyway, the rule that falls out of the numbers: keep every effect's above-4 kHz RMS at least 20 dB under its full-band RMS (that is where reveal, swell, whoosh, thud, move, approve, deny, stop sit), peak at or under −6 dBFS before mixing (add `alimiter` or just `volume`), add `lowpass=f=6000` on the effect bus, and place at most one effect per beat under a voice line. Or generate them with the same "no high frequencies, warm, low, rounded" wording that produced swell/thud and discard any file whose above-4 kHz band is within 10 dB of full band.

## 8. Files to read

- `film/film.html`: the whole picture. Palette and easings at the top (lines 12–20), lit objects (`pill`, `key`, `chip`, `rail`, lines 44–79), the timeline `T`/`CALLS`/`CAM` (lines 101–122), the dark paper (`page`, `PAPER`, lines 190–230), the badge (`logo`, line 320), captions (`words`, line 444), outro (`brand`), grain and vignette (`post`, lines 460–465), the frame (`world`, `draw`).
- `film/render.mjs`: Playwright render, CPU only (`--disable-gpu --disable-gpu-compositing --force-color-profile=srgb`), stills, contact sheet, x264 crf 16.
- `film/mix.ts`, `film/music.ts`, `video/voice.ts`, `film/trim-vo.ts`, `film/tighten.ts`, `video/take.ts`: sound.
- `film/frames/fonts.css`: the font faces and the app's tokens.
- `docs/brand/final/gt-badge.svg` and `docs/brand/final/README.md`, `docs/brand/logo-src/gt.mjs`: the badge.
- `film/icons/`, `film/icons.js`: agent marks.
- `video/README.md`: the pipeline and the cut history; `video/contact-cut19.jpg`: the reference frames.
