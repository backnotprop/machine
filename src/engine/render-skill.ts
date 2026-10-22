// Renders a machine definition into a SKILL.md the agent can load.
// The skill is the map and the rules; the tool returns turn-by-turn state cards.
import type { Machine, Field, Requirement } from "./engine.ts";
import { provider } from "./providers.ts";

const fieldTable = (f: Record<string, Field> | undefined) => {
  if (!f || !Object.keys(f).length) return "_none_\n";
  const rows = Object.entries(f).map(([k, v]) =>
    `| \`${k}\` | ${v.type}${v.enum ? ` (${v.enum.map((e) => `\`${e}\``).join(" \\| ")})` : ""} | ${v.required ? "yes" : "no"} | ${v.description ?? ""} |`);
  return `| field | type | required | description |\n|---|---|---|---|\n${rows.join("\n")}\n`;
};

const reqList = (r: Requirement[] | undefined) =>
  !r?.length ? "_none_\n" : r.map((x) => `- **${x.id}**${x.required === false ? " (optional)" : ""}: ${x.description}\n  Check: ${x.check}`).join("\n") + "\n";

// Where a slot is live: every state, or only the states that list it (a state with no list can use every slot).
// Only task and decision states count; a run in a wait or final state is not running and cannot use anything.
const liveIn = (m: Machine, slot: string) => {
  const working = Object.entries(m.states).filter(([, s]) => s.kind === "task" || s.kind === "decision");
  const states = working.filter(([, s]) => !s.credentials || s.credentials.includes(slot)).map(([id]) => id);
  return states.length === working.length ? "every state" : states.map((id) => `\`${id}\``).join(", ") || "no state";
};

const credentialsSection = (m: Machine, toolName: string) => {
  const rows = m.credentials!.map((c) =>
    `| \`${c.id}\` | ${provider(c.provider)?.name ?? c.provider}${c.scopes?.length ? ` (${c.scopes.join(", ")})` : ""} | ${liveIn(m, c.id)} | ${c.why ?? ""} |`);
  return `## Credentials\n
The team stores these on the server and binds one to each slot. A run uses them; you never see a value.

| slot | provider | live in | why |
|---|---|---|---|
${rows.join("\n")}

- To run a command that needs one, prefix it: \`machine run <run_id> -- gh pr create --fill\`, \`machine run <run_id> -- git push origin HEAD\`, \`machine run <run_id> -- npm publish\`. The \`machine\` CLI puts the credential in that command's environment and nowhere else. For a plain API call use the \`request\` tool with the slot id. Each state card lists the slots live in that state under \`credentials\`, with the exact form to use.
- Never ask the human for a token or password. If a slot is not connected, \`${toolName}.begin\` blocks the run with a connect link in \`needs\`; print the run page link and stop, as for any blocked run.
- Never print a credential or run a command whose point is to show one (\`env\`, \`printenv\`, \`cat ~/.npmrc\`). Every use is recorded on the run's timeline with the command it ran.
`;
};

/** header: a hosted server's bearer header, appended to the registration line as `--header "<header>"`. Unset locally. */
export interface RenderOptions { toolName?: string; baseUrl?: string; header?: string }

export function renderSkill(m: Machine, opts: RenderOptions | string = {}): string {
  const { toolName = "machine", baseUrl = "http://localhost:7420", header } = typeof opts === "string" ? { toolName: opts } : opts;
  const register = `claude mcp add --transport http ${toolName} ${baseUrl}/mcp${header ? ` --header "${header}"` : ""}`;
  const out: string[] = [];
  out.push(`---\nname: ${m.id}\ndescription: ${m.description.replace(/\n/g, " ")} Use the ${toolName} tool to run it; every step is reported and verified against the definition.\n---\n`);
  out.push(`# ${m.name}\n\nMachine \`${m.id}\` version ${m.version}. ${m.description}\n`);
  out.push(`## Where the machine lives\n
- **Server:** \`${baseUrl}\`. It is one local process; a human sees every run in the web UI at the same address.
- **Tools:** the \`${toolName}\` MCP server at \`${baseUrl}/mcp\` (Streamable HTTP). In Claude Code the tools appear as \`mcp__${toolName}__preflight\`, \`mcp__${toolName}__begin\`, and so on. If they are not available, the server is not connected: say so and stop. To connect, the human runs once: \`${register}\`. Do not improvise the process without the tools.
- **The run page:** \`${baseUrl}/#/runs/<run_id>\`. Print this link as soon as \`${toolName}.begin\` returns a run_id, so the human can watch. Everything you report with the tools shows there as it happens; you do not need to post anything else anywhere.
- **Definition:** \`machine.json\` next to this file is the exact definition the server enforces. This skill is rendered from it.
`);
  out.push(`## The contract: tools and what they return\n
| tool | arguments | returns |
|---|---|---|
| \`list_machines\` | none | the machines you can run, with their inputs |
| \`preflight\` | \`machine_id\`, \`inputs\` | input errors (if any) and the requirements to check |
| \`begin\` | \`machine_id\`, \`inputs\`, \`preflight: [{id, ok, detail?}]\`, \`agent?: {name?, session?}\` | the first state card; creates the run |
| \`transition\` | \`run_id\`, \`event\`, \`payload?\`, \`note?\` | the next state card, or an error naming what was rejected and why |
| \`note\` | \`run_id\`, \`note\`, \`progress?\` (0-100) | nothing; the note appears in the run's history |
| \`fail\` | \`run_id\`, \`code\`, \`message\`, \`needs?: string[]\`, \`fatal?\` | the card, now blocked (or failed when fatal) |
| \`get\` | \`run_id\` | the current state card; use it to resume after a human acted |

A **state card** is a JSON object:

\`\`\`json
{ "run_id": "run_x", "status": "running", "state": "<state id>", "kind": "task", "title": "<state title>", "your_move": true,
  "instructions": "what to do in this state", "output": { "<field>": { "type": "string", "required": true } },
  "events": [ { "name": "<event>", "to": "<next state>", "actor": "agent" } ] }
\`\`\`

When \`your_move\` is false the card carries \`stop_reason\` instead of instructions. When a human unblocked the run or fired an event and wrote a note, the next card carries it as \`human_note\`: it is addressed to you, read it before acting, and let it change what you do in this state. \`status\` is one of running, waiting (a human decides), blocked (a human must fix something), succeeded, failed, cancelled.
`);
  out.push(`## How a run works\n
1. Call \`${toolName}.preflight\` with the inputs. It returns the requirements below and any input errors.
2. Perform every check yourself and record the result for each requirement id.
3. Call \`${toolName}.begin\` with the inputs, the preflight results, and \`agent: { name, session }\` so the UI shows who is running: \`name\` is the product you are (Claude Code, OpenCode, Pi, Codex, Cursor, Copilot), \`session\` your model and session id. Your \`detail\` strings are shown to the human, so say what you ran and what you saw. If a required check failed, the run is still created, but **blocked**: the card says \`your_move: false\` and lists what a human must fix. Print the run page link and stop there.
4. Otherwise you get a **state card** with \`your_move: true\`: the current state's instructions, the output fields you must produce, and the events you may fire. Do what it says. Use \`${toolName}.note\` to report progress while you work (\`progress\` is a percentage, 0-100).
5. When the state's work is done, call \`${toolName}.transition\` with one of the listed events and the output payload. You get the next state card. Repeat.
6. Stop whenever a card says \`your_move: false\`. Its \`stop_reason\` tells you why: the run finished, a human must decide, or the run is blocked.
`);
  out.push(`## Rules\n
- Fire only events listed on the current state card. The tool rejects anything else; do not retry with a different event to "get past" a state.
- Produce every required output field honestly. Do not invent values to satisfy the schema.
- If you cannot complete the current state, call \`${toolName}.fail\` with a code, a plain message, and \`needs\` (what a human must provide or fix). Then stop. Do not work around the machine.
- Never satisfy a requirement by creating the thing it checks for. A missing credential, file, or connection is reported, not manufactured.
- If the tool has already blocked the run (a card with \`status: blocked\`), do not also call \`${toolName}.fail\`. Just stop.
- If the run is \`waiting\`, a human decides the next event in the UI. Stop and say so.
- If the run is \`blocked\`, stop. A human will unblock it; a new session will resume from \`${toolName}.get\`, whose card carries their \`human_note\` if they wrote one.
- Never run two runs of this machine at once in one session.
`);
  out.push(`## Inputs\n\n${fieldTable(m.inputs)}`);
  out.push(`## Requirements checked at preflight\n\n${reqList(m.requirements)}`);
  if (m.credentials?.length) out.push(credentialsSection(m, toolName));
  out.push(`## States\n\nStart: \`${m.initial}\`\n\n| state | kind | events → next |\n|---|---|---|`);
  for (const [id, s] of Object.entries(m.states)) {
    const ev = Object.entries(s.on ?? {}).map(([e, t]) => `\`${e}\`${t.actor === "human" ? " (human)" : ""} → \`${t.to}\``).join(", ");
    out.push(`| \`${id}\` | ${s.kind}${s.outcome ? ` (${s.outcome})` : ""} | ${ev || "—"} |`);
  }
  out.push("");
  for (const [id, s] of Object.entries(m.states)) {
    out.push(`### \`${id}\` · ${s.title} (${s.kind})\n`);
    if (s.instructions) out.push(s.instructions.trim() + "\n");
    if (s.kind === "wait") out.push(`A human fires the next event from the UI. Report what they need to know with \`${toolName}.note\`, then stop.\n`);
    if (s.kind === "final") out.push(`Terminal state, outcome **${s.outcome}**. Nothing further to do.\n`);
    if (s.requirements?.length) out.push(`Requirements for this state:\n\n${reqList(s.requirements)}`);
    if (s.output && Object.keys(s.output).length) out.push(`Output payload required on transition:\n\n${fieldTable(s.output)}`);
    if (s.on && Object.keys(s.on).length) {
      out.push(`Events:\n`);
      for (const [e, t] of Object.entries(s.on))
        out.push(`- \`${e}\` → \`${t.to}\`${t.actor === "human" ? " _(human only)_" : ""}${t.description ? `: ${t.description}` : ""}`);
      out.push("");
    }
  }
  return out.join("\n");
}
