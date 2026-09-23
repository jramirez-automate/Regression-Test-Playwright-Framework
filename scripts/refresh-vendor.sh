#!/usr/bin/env bash
# Make the vendored frontend source mirrors present and current.
#
#   npm run vendor:refresh
#
# Driven by vendor.config.json. On a first run this does a lean clone —
# partial (blob:none) + sparse + shallow — so a monorepo costs tens of megabytes
# instead of gigabytes. On later runs it just fetches the branch tip.
#
# NON-FATAL by design. Offline, no SSH auth, or no configured repos all print a
# warning and leave whatever checkout exists. This runs on session start in some
# setups, and a source mirror failing to refresh must never block the work —
# the explorer has two fallbacks below it.
set +e

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$ROOT" ] && ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 0

CONFIG="$ROOT/vendor.config.json"
if [ ! -f "$CONFIG" ]; then
	echo "[vendor] no vendor.config.json — skipping (explorer will use manual cases or codegen)"
	exit 0
fi

# Emit one tab-separated line per enabled repo. Node is already a dependency
# here, so this avoids requiring jq.
ENTRIES="$(node -e '
const fs = require("fs");
let config;
try {
  config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
} catch (err) {
  console.error("[vendor] vendor.config.json is not valid JSON: " + err.message);
  process.exit(0);
}
for (const repo of config.repos ?? []) {
  if (repo.enabled === false) continue;
  if (!repo.name || !repo.url || repo.url.includes("your-org")) continue;
  const sparse = (repo.sparse ?? []).join(" ");
  console.log([repo.name, repo.branch ?? "main", repo.url, sparse].join("\t"));
}
' "$CONFIG" 2>/dev/null)"

if [ -z "$ENTRIES" ]; then
	echo "[vendor] no enabled repos in vendor.config.json — skipping"
	echo "[vendor] the explorer will fall back to manual test cases, then codegen"
	exit 0
fi

ensure() {
	local name="$1" branch="$2" url="$3"
	shift 3
	local sparse_paths="$*"
	local sparse_first="${sparse_paths%% *}"
	local path="vendor/$name"

	if [ ! -e "$path/.git" ]; then
		echo "[vendor] initialising $path (lean clone of $branch)…"
		rm -rf "$path"
		mkdir -p vendor
		if [ -n "$sparse_paths" ]; then
			git clone --depth 1 --branch "$branch" --filter=blob:none --sparse "$url" "$path" >/dev/null 2>&1
		else
			git clone --depth 1 --branch "$branch" --filter=blob:none "$url" "$path" >/dev/null 2>&1
		fi
		if [ $? -eq 0 ]; then
			if [ -n "$sparse_paths" ]; then
				# shellcheck disable=SC2086
				git -C "$path" sparse-checkout set $sparse_paths >/dev/null 2>&1
			fi
			echo "[vendor] $path -> origin/$branch @ $(git -C "$path" rev-parse --short HEAD)"
		else
			echo "[vendor] WARN: clone of $path failed (offline / no auth?) — explorer will lack $name source"
		fi
		return
	fi

	if git -C "$path" fetch --depth 1 origin "$branch" >/dev/null 2>&1 &&
		git -C "$path" checkout -q -B "$branch" FETCH_HEAD 2>/dev/null; then
		# Only re-materialise sparse when the tree is missing: a partial-clone
		# blob fetch on a large repo can take minutes, and the paths rarely change.
		if [ -n "$sparse_first" ] && [ ! -d "$path/$sparse_first" ]; then
			# shellcheck disable=SC2086
			git -C "$path" sparse-checkout set $sparse_paths >/dev/null 2>&1
		fi
		echo "[vendor] $path -> origin/$branch @ $(git -C "$path" rev-parse --short HEAD)"
	else
		echo "[vendor] WARN: could not refresh $path (offline / no auth?) — using current checkout"
	fi
}

while IFS=$'\t' read -r name branch url sparse; do
	[ -z "$name" ] && continue
	# shellcheck disable=SC2086
	ensure "$name" "$branch" "$url" $sparse
done <<<"$ENTRIES"

exit 0
