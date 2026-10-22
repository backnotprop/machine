#!/usr/bin/env bash
# Stand-in gh for dry runs. PRs are numbered from a counter in .git; `pr merge` really merges the branch into main
# and pushes to the fixture's bare origin, so the repo ends up as GitHub would leave it.
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ver="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$root/package.json" 2>/dev/null | head -1)"
ctr="$root/.git/pr-counter"; [ -f "$ctr" ] || echo 0 > "$ctr"
pr_branch() { # branch recorded for a PR number
  [ -f "$root/.git/pr-$1" ] && cat "$root/.git/pr-$1" || git -C "$root" branch --show-current; }
case "$1 $2" in
  "auth status") echo "github.com: Logged in to github.com account stub (stub)";;
  "repo view") echo '{"nameWithOwner":"stub/fixture"}';;
  "pr create") n=$(( $(cat "$ctr") + 1 )); echo "$n" > "$ctr"; git -C "$root" branch --show-current > "$root/.git/pr-$n"; echo "https://github.com/stub/fixture/pull/$n";;
  "pr list") echo '[]';;
  "pr view") echo '{"state":"OPEN","mergeable":"MERGEABLE","reviewDecision":"","statusCheckRollup":[{"name":"ci","conclusion":"SUCCESS"}]}';;
  "pr checks") echo "ci	pass	0s	https://github.com/stub/fixture/actions/runs/1"; echo "All checks were successful";;
  "pr merge") n="${3#\#}"; n="${n##*/}"; br="$(pr_branch "$n")"; git -C "$root" checkout -q main && git -C "$root" merge -q --no-ff "$br" -m "Merge pull request #$n from $br" && git -C "$root" push -q origin main && git -C "$root" branch -q -D "$br" 2>/dev/null; echo "✓ Merged pull request #$n";;
  "workflow run") echo "✓ Created workflow_dispatch event for $3 at main";;
  "run list") echo "[{\"databaseId\":4242,\"status\":\"completed\",\"conclusion\":\"success\",\"name\":\"$( [ -n "$ver" ] && echo "v$ver" || echo internal-build )\",\"displayTitle\":\"internal build\"}]";;
  "run view") printf '✓ internal build · 4242\nJOBS\n✓ build\n✓ test\n✓ upload-testflight\n';;
  "run watch") printf '✓ internal build · 4242 completed with success\n';;
  "release view") echo "{\"tagName\":\"v$ver\",\"assets\":[{\"name\":\"plannotator-linux-x64\"},{\"name\":\"plannotator-linux-x64.sha256\"},{\"name\":\"plannotator-$ver-release-sbom.cdx.json\"},{\"name\":\"plannotator-$ver-release-sbom.cdx.json.sha256\"}]}";;
  "release edit") echo "https://github.com/stub/fixture/releases/tag/v$ver";;
  "release download") echo "downloaded (stub)";;
  "api "*) echo '[]';;
  *) echo "gh stub: unsupported: $*" >&2; exit 1;;
esac
