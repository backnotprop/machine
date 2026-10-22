#!/usr/bin/env bash
# Stand-in desktop repo for one tick of the release loop: pnpm is a stub whose `check` runs a real script, and the
# newest commit on main breaks it, so the tick must go red, fix, land, re-gate, dispatch.
set -euo pipefail
F="$PWD"; mkdir -p bin src
cp "$ROOT/evals/fixtures/gh-stub.sh" bin/gh
cat > bin/pnpm <<'P'
#!/usr/bin/env bash
case "$1" in --version) echo "10.0.0";; check) node "$(git rev-parse --show-toplevel)/check.js";; install) echo "ok";; *) echo "pnpm stub: $*";; esac
P
chmod +x bin/gh bin/pnpm
cat > package.json <<'J'
{ "name": "desktop", "version": "0.3.0", "private": true, "scripts": { "check": "node check.js" } }
J
cat > check.js <<'C'
const { add, sub } = require("./src/math.js");
let fail = 0;
const t = (name, got, want) => { if (got !== want) { console.error(`FAIL ${name}: got ${got}, want ${want}`); fail = 1; } else console.log(`ok ${name}`); };
t("add(2,2)", add(2, 2), 4); t("sub(5,3)", sub(5, 3), 2); t("sub(0,4)", sub(0, 4), -4);
process.exit(fail);
C
printf 'exports.add = (a, b) => a + b;\nexports.sub = (a, b) => a - b;\n' > src/math.js
git init -q -b main && git config user.email a@b.c && git config user.name t
printf 'node_modules\n' > .gitignore
git add -A && git commit -qm 'Desktop stand-in with math helpers'
git init -q --bare .remote.git && echo '.remote.git' >> .git/info/exclude && git remote add origin "$F/.remote.git" && git push -q -u origin main
# the new commit on main: a refactor that breaks sub()
printf 'exports.add = (a, b) => a + b;\nexports.sub = (a, b) => a + b; // refactor: share the adder\n' > src/math.js
git add -A && git commit -qm 'Refactor math helpers to share one adder' && git push -q origin main
echo "fixture ready at $F: pnpm check is $(node check.js >/dev/null 2>&1 && echo green || echo red) at HEAD $(git rev-parse --short HEAD)"
