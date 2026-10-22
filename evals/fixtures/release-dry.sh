#!/usr/bin/env bash
# A stand-in Plannotator monorepo for the release machine: seven version files, stub builds, a bare "origin",
# stub gh/npm on PATH, and an install script that installs into the fixture, never into the real machine.
set -euo pipefail
F="$PWD"
mkdir -p bin scripts apps/opencode-plugin apps/pi-extension/server apps/pi-extension/generated apps/hook/.claude-plugin apps/copilot apps/vscode-extension packages/server .github/workflows .local/bin
cat > package.json <<J
{ "name": "plannotator", "version": "0.1.0", "private": true,
  "scripts": { "build:review": "mkdir -p dist && echo review > dist/review.html && echo built review",
               "build:hook": "mkdir -p dist && cp dist/review.html dist/hook.html && echo built hook",
               "build:opencode": "mkdir -p apps/opencode-plugin/dist && cp dist/hook.html apps/opencode-plugin/dist/ && echo built opencode",
               "build:pi": "mkdir -p apps/pi-extension/dist && cp dist/hook.html apps/pi-extension/dist/ && echo built pi" } }
J
echo '{ "name": "@plannotator/opencode", "version": "0.1.0" }' > apps/opencode-plugin/package.json
cat > apps/pi-extension/package.json <<'J'
{ "name": "@plannotator/pi-extension", "version": "0.1.0", "files": ["index.ts", "server.ts", "server/", "generated/", "dist/"] }
J
echo 'import "./server.ts";' > apps/pi-extension/index.ts
echo 'import "./server/routes.ts"; import "../generated/shared.js";' > apps/pi-extension/server.ts
echo 'export const routes = [];' > apps/pi-extension/server/routes.ts
echo 'export const shared = 1;' > apps/pi-extension/generated/shared.js
printf '#!/usr/bin/env bash\nfor f in shared; do cp ../../packages/shared/$f.js generated/ 2>/dev/null || true; done\n' > apps/pi-extension/vendor.sh
echo '{ "name": "plannotator", "version": "0.1.0" }' > apps/hook/.claude-plugin/plugin.json
echo '{ "name": "plannotator-copilot", "version": "0.1.0" }' > apps/copilot/plugin.json
echo '{ "name": "plannotator-vscode", "version": "1.2.3" }' > apps/vscode-extension/package.json
echo '{ "name": "@plannotator/server", "version": "0.1.0" }' > packages/server/package.json
printf 'name: plannotator\nversion: 0.1.0\n' > openpackage.yml
printf 'name: release\non:\n  push:\n    tags: ["v*"]\njobs:\n  build:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: %s\n' "$(bun --version)" > .github/workflows/release.yml
# Install script: installs a stub binary INSIDE the fixture. It must never touch the real machine.
cat > scripts/install.sh <<'S'
#!/usr/bin/env bash
# Stand-in install script. Installs into the fixture's .local/bin only.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1)"
mkdir -p "$ROOT/.local/bin"
cat > "$ROOT/.local/bin/plannotator" <<B
#!/usr/bin/env bash
case "\$1" in --version|version) echo "plannotator $V";; *) echo "plannotator $V: \$* ok";; esac
B
chmod +x "$ROOT/.local/bin/plannotator"
echo "installed plannotator $V to $ROOT/.local/bin/plannotator"
S
printf '# stand-in\n' > scripts/install.ps1; printf '@echo stand-in\n' > scripts/install.cmd
chmod +x scripts/install.sh apps/pi-extension/vendor.sh
# Stub gh: enough of the surface the machine uses. Reads the version from the repo it is run in.
cat > bin/gh <<'G'
#!/usr/bin/env bash
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ver="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$root/package.json" | head -1)"
case "$1 $2" in
  "auth status") echo "github.com: Logged in to github.com account stub (stub)";;
  "repo view") echo '{"nameWithOwner":"backnotprop/plannotator"}';;
  "pr list") echo '[]';;
  "pr view"|"pr checks") echo '{"state":"MERGED","statusCheckRollup":[]}';;
  "run list") echo "[{\"databaseId\":4242,\"status\":\"completed\",\"conclusion\":\"success\",\"headBranch\":\"v$ver\",\"name\":\"release\",\"workflowName\":\"release\",\"displayTitle\":\"v$ver\"}]";;
  "run view") printf '✓ v%s release · 4242\nJOBS\n✓ test\n✓ build\n✓ smoke-binaries\n✓ release-security\n✓ attest\n✓ release\n✓ npm-package\n✓ npm-publish\n' "$ver";;
  "run watch") printf '✓ v%s release · 4242 completed with success\n' "$ver";;
  "release view") echo "{\"tagName\":\"v$ver\",\"assets\":[{\"name\":\"plannotator-linux-x64\"},{\"name\":\"plannotator-linux-x64.sha256\"},{\"name\":\"plannotator-$ver-release-sbom.cdx.json\"},{\"name\":\"plannotator-$ver-release-sbom.cdx.json.sha256\"}]}";;
  "release edit") echo "https://github.com/backnotprop/plannotator/releases/tag/v$ver";;
  "release download") echo "downloaded (stub)";;
  "api "*) echo '[]';;
  *) echo "gh stub: unsupported: $*" >&2; exit 1;;
esac
G
cat > bin/npm <<'N'
#!/usr/bin/env bash
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ver="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$root/package.json" | head -1)"
case "$1" in view) echo "$ver";; *) echo "npm stub: $*";; esac
N
chmod +x bin/gh bin/npm
git init -q -b main && git config user.email a@b.c && git config user.name t
printf 'node_modules\ndist\napps/*/dist\n.local\n' > .gitignore
git add -A && git commit -qm 'Initial Plannotator stand-in' && git tag v0.1.0
git init -q --bare .remote.git && echo '.remote.git' >> .git/info/exclude && git remote add origin "$F/.remote.git" && git push -q -u origin main && git push -q origin v0.1.0
echo 'export const paste = (t) => t.trim();' > packages/server/paste.js && git add -A && git commit -qm 'Inbox: paste images into the reply box (#2001)'
echo 'export const toast = { top: 24 };' > packages/server/toast.js && git add -A && git commit -qm 'Inbox: toast no longer covers the reply box (#2003)'
git push -q origin main
echo "fixture ready at $F: $(git log --oneline | wc -l | tr -d ' ') commits, tag v0.1.0, origin $F/.remote.git"
