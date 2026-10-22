# Live proof of Machine over BYOA on real Claude Code: Claude Code in a pty with the byoa connector (--plugin-dir), the local
# machine server, the designer driven through its API. python3 docs/byoa/scripts/live-claude.py  (from the repo root;
# server on :7420). Steps: /byoa connect (one command, approved on the spot) → /clear (the proxied tool reaches the next
# session) → a designer session bound to it, haiku + low effort picked → the prompt enters as a turn → draft_machine and
# say land → the transcript shows the model that ran. ~/.byoa is the connector's folder: an existing one is moved aside
# and put back at the end.
import glob, json, os, pty, re, select, signal, sys, time, urllib.request
URL = "http://localhost:7420"; PLUGIN = "/Users/ramos/byoa/connectors/claude-code"; PROJ = os.path.realpath("/tmp/machine-live-proj")
BYOA = os.path.expanduser("~/.byoa"); BACKUP = os.path.expanduser("~/.byoa.machine-live-backup")
os.makedirs(PROJ, exist_ok=True); open(f"{PROJ}/README.md", "w").write("# acme\n")
LOG = open("/tmp/live-claude-pty.log", "wb")
def api(path, body=None):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json"} if body is not None else {}, method="POST" if body is not None else "GET")
    return json.load(urllib.request.urlopen(req, timeout=10))
def say(*a): print(time.strftime("%H:%M:%S"), *a, flush=True)
ANSI = re.compile(rb"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[=>()][0-9A-Za-z]?")
if os.path.exists(BYOA): os.rename(BYOA, BACKUP); say("moved the existing ~/.byoa aside")
pid, fd = pty.fork()
if pid == 0:
    os.chdir(PROJ); os.environ["TERM"] = "xterm-256color"; os.environ["COLUMNS"] = "120"; os.environ["LINES"] = "40"
    os.execvp("claude", ["claude", "--plugin-dir", PLUGIN, "--model", "haiku", "--permission-mode", "default", "--debug-file", "/tmp/live-claude-debug.log"])
seen = b""; trusted = [False]; answered = [0]
def flat(): return re.sub(rb"\s+", b"", seen).lower()
def pump(secs):
    global seen
    end = time.time() + secs
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if fd in r:
            try: d = os.read(fd, 65536)
            except OSError: return False
            if not d: return False
            LOG.write(d); LOG.flush(); seen += ANSI.sub(b"", d)
            f = flat()
            if not trusted[0] and (b"itrustthisfolder" in f or b"yes,proceed" in f): trusted[0] = True; time.sleep(0.5); os.write(fd, b"\x1b[B"); time.sleep(0.3); os.write(fd, b"\r"); say("accepted the trust prompt (Down, Enter)")
            if f.count(b"doyouwanttoproceed") > answered[0]: answered[0] = f.count(b"doyouwanttoproceed"); time.sleep(0.8); os.write(fd, b"\r"); say("permission prompt for the tool: pressed Enter (Yes)")
    return True
def text(): return seen.decode("utf8", "replace")
def type_line(t): os.write(fd, t.encode()); pump(0.6); os.write(fd, b"\r")
def connected(): return [x for x in api("/api/author/connected") if x["host"] == "claude-code" and x["connected"]]
def finish(code):
    try: os.write(fd, b"/exit\r"); pump(2)
    except OSError: pass
    try: os.kill(pid, signal.SIGKILL)
    except ProcessLookupError: pass
    if os.path.exists(BYOA): import shutil; shutil.rmtree(BYOA)
    if os.path.isdir(BACKUP): os.rename(BACKUP, BYOA); say("restored the earlier ~/.byoa")
    sys.exit(code)
say("claude started with the byoa connector")
pump(6)
type_line(f"/byoa connect {URL}"); say("typed /byoa connect")
first = None
for i in range(40):
    pump(1)
    c = connected()
    if c: first = c[0]; break
if not first: say("FAIL: no session on the wire in 40 s. tail:", text()[-1500:]); finish(1)
say("connected:", first["id"], "options:", [(o["id"], o["value"], [x["value"] for x in o["options"]]) for o in first["options"]])
# The proxied tool reaches the next session: /clear, then wait for a new session id.
type_line("/clear"); say("typed /clear")
agent = None
for i in range(40):
    pump(1)
    c = [x for x in connected() if x["id"] != first["id"]]
    if c: agent = c[0]; break
if not agent: say("FAIL: no new session after /clear. tail:", text()[-1500:]); finish(1)
say("new session:", agent["id"])
s = api("/api/author/sessions", {"connect": agent["id"]}); say("designer session", s["id"], "config:", [(c["id"], c["value"]) for c in s.get("config", [])])
for k, v in (("model", "haiku"), ("effort", "low")): api(f"/api/author/sessions/{s['id']}/config", {"id": k, "value": v})
api(f"/api/author/sessions/{s['id']}/prompt", {"text": "Triage the issue, implement the fix, run the tests, then a person reviews. Changes requested goes back to the fix. Merged is the end."})
say("prompt sent; waiting for the turn in Claude Code")
done = False; blocked = False
for i in range(240):
    pump(1)
    a = [x for x in api("/api/author/connected") if x["id"] == agent["id"]]
    v = api(f"/api/author/sessions/{s['id']}")
    if v["draft"] and v["status"] == "idle" and any(e["role"] == "agent" for e in v["transcript"]): done = True; break
v = api(f"/api/author/sessions/{s['id']}")
say("status", v["status"], "draft states:", list(v["draft"]["states"].keys()) if v["draft"] else None, "problems", v["problems"])
for e in v["transcript"]: say("  ", e["role"], (e.get("text") or e.get("title", ""))[:160].replace("\n", " "))
say("terminal tail:\n" + "\n".join(l for l in text()[-2500:].splitlines() if l.strip()))
jl = sorted(glob.glob(os.path.expanduser("~/.claude/projects/" + PROJ.replace("/", "-") + "/*.jsonl")), key=os.path.getmtime)
models = set()
for line in (open(jl[-1]) if jl else []):
    try: d = json.loads(line)
    except Exception: continue
    if d.get("type") == "assistant": m = (d.get("message") or {}).get("model"); models.add(m) if m else None
say("assistant models in the transcript:", sorted(models), "| BYOA/effort lines on screen:", [l.strip() for l in text().splitlines() if re.search(r"(?i)byoa|effort", l)][-6:])
finish(0 if done else 2)
