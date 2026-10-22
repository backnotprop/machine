#!/usr/bin/env bash
# A small Bun project with real tests and a lint script, its own bare origin, and the stub gh so a PR can be
# opened and merged without GitHub.
set -euo pipefail
F="$PWD"; mkdir -p bin src
cp "$ROOT/evals/fixtures/gh-stub.sh" bin/gh; chmod +x bin/gh
cat > package.json <<'J'
{ "name": "mathkit", "version": "0.1.0", "private": true, "type": "module",
  "scripts": { "test": "bun test", "lint": "node lint.js" } }
J
cat > lint.js <<'L'
// Fails when any source file still contains console.log or a TODO.
import { readdirSync, readFileSync } from "node:fs";
let bad = 0;
for (const f of readdirSync("src")) { const s = readFileSync(`src/${f}`, "utf8"); if (/console\.log|TODO/.test(s)) { console.error(`lint: ${f} has console.log or TODO`); bad = 1; } }
process.exit(bad);
L
cat > src/math.ts <<'T'
export const add = (a: number, b: number): number => a + b;
export const sub = (a: number, b: number): number => a - b;
T
cat > src/index.ts <<'T'
export { add, sub } from "./math.ts";
T
cat > src/math.test.ts <<'T'
import { test, expect } from "bun:test";
import { add, sub } from "./math.ts";
test("add", () => expect(add(2, 2)).toBe(4));
test("sub", () => expect(sub(5, 3)).toBe(2));
T
git init -q -b main && git config user.email a@b.c && git config user.name t
printf 'node_modules\n' > .gitignore
git add -A && git commit -qm 'mathkit: add and sub with tests and lint'
git init -q --bare .remote.git && echo '.remote.git' >> .git/info/exclude && git remote add origin "$F/.remote.git" && git push -q -u origin main
echo "fixture ready at $F"
