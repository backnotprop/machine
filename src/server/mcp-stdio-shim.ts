#!/usr/bin/env bun
// stdio <-> HTTP bridge for ACP agents that can only launch MCP servers as subprocesses.
//   bun src/server/mcp-stdio-shim.ts http://localhost:7420/mcp?author=<session>
// Reads newline-delimited JSON-RPC on stdin, POSTs each message to the URL, writes every JSON-RPC message in the reply
// (plain JSON or an SSE stream) to stdout. The server's MCP endpoint is stateless, so no session header is carried.
export {};
const url = process.argv[2];
if (!url) { console.error("usage: mcp-stdio-shim.ts <mcp-url>"); process.exit(2); }
const out = (line: string) => process.stdout.write(line.trim() + "\n");

async function forward(line: string) {
  try {
    const r = await fetch(url, { method: "POST", body: line, headers: { "content-type": "application/json", accept: "application/json, text/event-stream" } });
    const text = await r.text();
    if ((r.headers.get("content-type") ?? "").includes("text/event-stream")) {
      for (const l of text.split("\n")) if (l.startsWith("data:") && l.slice(5).trim()) out(l.slice(5));
    } else if (text.trim()) out(text);
  } catch (e) {
    const msg = JSON.parse(line);
    if (msg.id !== undefined) out(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `machine server unreachable at ${url}: ${(e as Error).message}` } }));
  }
}

let buf = "";
const d = new TextDecoder();
for await (const chunk of Bun.stdin.stream()) {
  buf += d.decode(chunk, { stream: true });
  for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (line) forward(line);
  }
}
