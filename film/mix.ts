// bun film/mix.ts — music + the voice over the render: film/audio/music.mp3 + video/audio/vo/charlie/<id>.mp3 → film/out/mix.wav,
// muxed into film/out/film.mp4 → video/launch.mp4 (master) and video/launch-web.mp4. The music ducks 6:1 under the voice.
import { join } from "node:path";
const dir = import.meta.dir, V = join(dir, "..", "video");
const VO: Record<string, number> = { "01-intro": 1.3, "02-design": 6.0, "03-compile": 14.0, "04-report": 25.0, "05-inside": 29.2, "07-scale": 38.0, "08-skills": 46.4, "09-runs": 53.0, "10-close": 60.0 };
const DUR = 64.6, voice = process.argv[2] ?? "charlie-trim", music = process.argv[3] ?? join(dir, "audio/music.mp3");
const inputs: string[] = [], chains: string[] = [], vo: string[] = [];
let n = 0; const add = (f: string) => { inputs.push("-i", f); return n++; };
const ms = (s: number) => Math.round(s * 1000);
const mus = add(music);
for (const [id, at] of Object.entries(VO)) { const i = add(join(V, "audio/vo", voice, `${id}.mp3`)); chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms(at)}|${ms(at)},volume=1.4[v${i}]`); vo.push(`[v${i}]`); }
// the music: in on the first frame, low-passed so nothing bites, a tail fade with the picture
chains.push(`[${mus}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${DUR},lowpass=f=9000,afade=t=in:d=0.6,afade=t=out:st=${DUR - 1.2}:d=1.2,volume=0.9[music]`);
chains.push(`${vo.join("")}amix=inputs=${vo.length}:normalize=0:dropout_transition=0,apad=whole_dur=${DUR}[vop]`, `[vop]asplit=2[vo1][vo2]`);
chains.push(`[music][vo2]sidechaincompress=threshold=0.02:ratio=6:attack=8:release=320:makeup=1[musd]`);
chains.push(`[vo1][musd]amix=inputs=2:normalize=0:dropout_transition=0,apad=whole_dur=${DUR},atrim=0:${DUR},loudnorm=I=-16:TP=-1.5:LRA=9[out]`);
const run = (args: string[]) => { const r = Bun.spawnSync(["ffmpeg", "-y", ...args], { stdout: "ignore", stderr: "pipe" }); if (r.exitCode !== 0) { console.error(new TextDecoder().decode(r.stderr).split("\n").slice(-8).join("\n")); process.exit(1); } };
run([...inputs, "-filter_complex", chains.join(";"), "-map", "[out]", "-ar", "48000", join(dir, "out/mix.wav")]);
run(["-i", join(dir, "out/film.mp4"), "-i", join(dir, "out/mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", join(V, "launch.mp4")]);
run(["-i", join(V, "launch.mp4"), "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-tune", "animation", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", join(V, "launch-web.mp4")]);
console.log("video/launch.mp4 and video/launch-web.mp4");
