// An offline model for Machine's Pi and OpenCode live proofs: an OpenAI-compatible chat-completions server (streaming), the
// shape of /Users/ramos/byoa/connectors/pi/scripts/echo-model.ts, with Machine's script: a designer wake ("Designer session"
// in the newest user text) makes it call the proxied `machine` tool with draft_machine (a five-state machine), after that
// result `say`, after that it answers "ECHO: drawn". Anything else answers "ECHO: <last line>". Every request is appended
// to $ECHO_LOG (jsonl) when set.   PORT=4598 ECHO_LOG=/tmp/echo.jsonl node docs/byoa/scripts/echo-machine-model.ts
import { appendFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";

type Msg = { role: string; content?: unknown; tool_calls?: unknown };
type Body = { model?: string; stream?: boolean; messages?: Msg[]; tools?: { function?: { name?: string } }[] };
const port = Number(process.env.PORT ?? 4598), logFile = process.env.ECHO_LOG;
let n = 0;
const MACHINE = {
  id: "ship-fix", version: 1, name: "Ship a fix", description: "Triage an issue, fix it, run the tests, get a review, merge.", initial: "triage",
  states: {
    triage: { kind: "task", title: "Triage the issue", instructions: "Read the issue and reproduce it. Do not change code yet.", on: { triaged: { to: "build" } } },
    build: { kind: "task", title: "Implement the fix", instructions: "Make the smallest change that fixes it.", on: { fixed: { to: "verify" } } },
    verify: { kind: "decision", title: "Run the tests", instructions: "Run the test suite.", output: { verdict: { type: "string", required: true, enum: ["pass", "fail"] } }, on: { pass: { to: "review" }, fail: { to: "build" } } },
    review: { kind: "wait", title: "Wait for review", on: { approved: { to: "ship", actor: "human" }, changes_requested: { to: "build", actor: "human" } } },
    ship: { kind: "final", title: "Merged", outcome: "success" },
  },
};
const textOf = (c: unknown): string => typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (typeof p?.text === "string" ? p.text : "")).join("\n") : "";
/** The user text since the last user message, and how many tool results followed it. */
function newest(messages: Msg[]): { text: string; toolsAfter: number } {
  let i = messages.length - 1, toolsAfter = 0;
  for (; i >= 0 && messages[i]?.role !== "user"; i--) if (messages[i]?.role === "tool") toolsAfter++;
  return { text: i >= 0 ? textOf(messages[i]?.content) : "", toolsAfter };
}
function plan(body: Body): { text: string; tool?: { name: string; args: Record<string, unknown> } } {
  const { text, toolsAfter } = newest(body.messages ?? []);
  const offered = (body.tools ?? []).map((t) => t.function?.name ?? "");
  if (/Designer session/.test(text)) {
    if (!offered.includes("machine")) return { text: `ECHO: no machine tool is offered (offered: ${offered.join(", ") || "none"}).` };
    if (toolsAfter === 0) return { text: "", tool: { name: "machine", args: { action: "draft_machine", machine: MACHINE } } };
    if (toolsAfter === 1) return { text: "", tool: { name: "machine", args: { action: "say", text: "Drew it: triage, build, verify, a wait for review, merged. Failing tests go back to build." } } };
    return { text: "ECHO: drawn, turn done." };
  }
  return { text: `ECHO: ${(text.trim().split("\n").at(-1) ?? "").slice(0, 60)}` };
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function complete(res: ServerResponse, body: Body) {
  const p = plan(body), id = `chatcmpl-echo-${++n}`, created = Math.floor(Date.now() / 1000);
  if (logFile) appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), id, tools: (body.tools ?? []).map((t) => t.function?.name), plan: p.tool ? `tool ${p.tool.name} ${p.tool.args.action}` : "text", last: newest(body.messages ?? []).text.slice(0, 200) })}\n`);
  const call = p.tool ? { id: `call_${n}`, type: "function", function: { name: p.tool.name, arguments: JSON.stringify(p.tool.args) } } : null;
  if (!body.stream) {
    const message = call ? { role: "assistant", content: null, tool_calls: [call] } : { role: "assistant", content: p.text };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id, object: "chat.completion", created, model: body.model, choices: [{ index: 0, message, finish_reason: call ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const chunk = (o: Record<string, unknown>) => res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: body.model, ...o })}\n\n`);
  if (call) {
    chunk({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: call.id, type: "function", function: { name: call.function.name, arguments: "" } }] }, finish_reason: null }] });
    chunk({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: call.function.arguments } }] }, finish_reason: null }] });
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  } else {
    chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });
    for (let i = 0; i < p.text.length; i += 64) { if (res.destroyed) return; chunk({ choices: [{ index: 0, delta: { content: p.text.slice(i, i + 64) }, finish_reason: null }] }); await pause(20); }
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  }
  res.write("data: [DONE]\n\n"); res.end();
}
createServer((req, res) => {
  const url = req.url ?? "/";
  if (req.method === "GET" && /\/models$/.test(url)) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ object: "list", data: [{ id: "echo-1", object: "model", owned_by: "echo" }] })); return; }
  if (req.method === "POST" && /chat\/completions$/.test(url)) {
    let raw = ""; req.on("data", (c) => { raw += c; }); req.on("end", () => { void complete(res, JSON.parse(raw || "{}") as Body); }); return;
  }
  res.writeHead(404); res.end();
}).listen(port, "127.0.0.1", () => console.log(`echo machine model on http://127.0.0.1:${port}/v1`));
