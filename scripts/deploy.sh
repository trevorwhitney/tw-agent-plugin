#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
OPENCODE_DIR="${HOME}/.config/opencode"
SKILLS_TARGET="${OPENCODE_DIR}/skills"
COMMANDS_TARGET="${OPENCODE_DIR}/command"

echo "Deploying tw-opencode-plugin..."
echo "  Source: ${PLUGIN_DIR}"
echo "  Target: ${OPENCODE_DIR}"

link_item() {
	local source="$1"
	local target="$2"
	local name="$3"

	if [ -L "$target" ]; then
		existing="$(readlink "$target")"
		if [ "$existing" = "$source" ] || [ "$existing" = "${source%/}" ]; then
			echo "  [skip] ${name} (already linked)"
			return
		fi
		echo "  [update] ${name} (relink)"
		rm "$target"
	elif [ -e "$target" ]; then
		echo "  [backup] ${name} -> ${target}.bak"
		mv "$target" "${target}.bak"
	fi

	ln -s "${source%/}" "$target"
	echo "  [link] ${name}"
}

# Copy a file to the target, replacing symlinks or existing files.
# Used instead of link_item for commands, agents, and skills because
# Bun.Glob.scan() (used by subtask2) does not follow symlinks.
copy_item() {
	local source="$1"
	local target="$2"
	local name="$3"

	# Remove existing symlink first (leftover from previous link-based deploy)
	if [ -L "$target" ]; then
		rm "$target"
	fi

	if [ -f "$target" ] && cmp -s "$source" "$target"; then
		echo "  [skip] ${name} (unchanged)"
		return
	fi

	cp "$source" "$target"
	echo "  [copy] ${name}"
}

# Recursively copy a directory, replacing symlinks or existing directories.
copy_dir() {
	local source="$1"
	local target="$2"
	local name="$3"

	# Remove existing symlink first (leftover from previous link-based deploy)
	if [ -L "$target" ]; then
		rm "$target"
	fi

	# rsync with checksum so unchanged files are skipped
	if command -v rsync &>/dev/null; then
		rsync -rc --delete "${source%/}/" "${target%/}/"
	else
		rm -rf "$target"
		cp -R "${source%/}" "$target"
	fi
	echo "  [copy] ${name}"
}

echo ""
echo "Skills:"
mkdir -p "$SKILLS_TARGET"
for skill_dir in "${PLUGIN_DIR}/skills"/*/; do
	skill_name="$(basename "$skill_dir")"
	copy_dir "$skill_dir" "${SKILLS_TARGET}/${skill_name}" "$skill_name"
done

echo ""
echo "Commands:"
mkdir -p "$COMMANDS_TARGET"
for cmd_file in "${PLUGIN_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	copy_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "$cmd_name"
done

echo ""
echo "Agents:"
AGENTS_TARGET="${OPENCODE_DIR}/agents"
mkdir -p "$AGENTS_TARGET"
for agent_file in "${PLUGIN_DIR}/agents"/*.md; do
	[ -f "$agent_file" ] || continue
	agent_name="$(basename "$agent_file")"
	copy_item "$agent_file" "${AGENTS_TARGET}/${agent_name}" "$agent_name"
done
# Clean up legacy critic agents replaced by persona system
for stale_agent in critic-codex.md critic-opus.md critic-sonnet.md critic-gemini.md facilitator.md; do
	if [ -f "${AGENTS_TARGET}/${stale_agent}" ]; then
		echo "  [remove] legacy agent: ${stale_agent}"
		rm "${AGENTS_TARGET}/${stale_agent}"
	fi
done

# ── AGENTS.md (global config) ─────────────────────────────────
echo ""
echo "AGENTS.md:"
link_item "${PLUGIN_DIR}/AGENTS.md" "${OPENCODE_DIR}/AGENTS.md" "AGENTS.md"

# ── Plugin (built JS) ─────────────────────────────────────────
PLUGINS_TARGET="${OPENCODE_DIR}/plugins"
mkdir -p "$PLUGINS_TARGET"

echo ""
echo "Plugin:"
link_item "${PLUGIN_DIR}/dist/opencode/index.js" \
	"${PLUGINS_TARGET}/tw-opencode-plugin.js" \
	"tw-opencode-plugin"

# ── Superpowers ───────────────────────────────────────────────
# Cloned to a harness-neutral location since both opencode and pi consume it.
# Migrated from ${OPENCODE_DIR}/superpowers (handled below).
SUPERPOWERS_DIR="${HOME}/.agents/superpowers"
SUPERPOWERS_REPO="https://github.com/trevorwhitney/superpowers.git"
LEGACY_SUPERPOWERS_DIR="${OPENCODE_DIR}/superpowers"
mkdir -p "$(dirname "$SUPERPOWERS_DIR")"

echo ""
echo "Superpowers:"

# Migrate legacy clone location if present
if [ -d "$LEGACY_SUPERPOWERS_DIR/.git" ] && [ ! -e "$SUPERPOWERS_DIR" ]; then
	echo "  [migrate] ${LEGACY_SUPERPOWERS_DIR} -> ${SUPERPOWERS_DIR}"
	mv "$LEGACY_SUPERPOWERS_DIR" "$SUPERPOWERS_DIR"
elif [ -d "$LEGACY_SUPERPOWERS_DIR" ] && [ -d "$SUPERPOWERS_DIR/.git" ]; then
	echo "  [remove] stale legacy clone at ${LEGACY_SUPERPOWERS_DIR}"
	rm -rf "$LEGACY_SUPERPOWERS_DIR"
fi

if [ -d "$SUPERPOWERS_DIR/.git" ]; then
	# Ensure we're pointed at the right remote (handles switch from upstream to fork)
	current_remote="$(git -C "$SUPERPOWERS_DIR" remote get-url origin 2>/dev/null || true)"
	if [ "$current_remote" != "$SUPERPOWERS_REPO" ]; then
		echo "  [update] switching superpowers remote to ${SUPERPOWERS_REPO}"
		git -C "$SUPERPOWERS_DIR" remote set-url origin "$SUPERPOWERS_REPO"
	fi
	echo "  [update] pulling latest superpowers..."
	git -C "$SUPERPOWERS_DIR" pull --ff-only --quiet
else
	if [ -e "$SUPERPOWERS_DIR" ]; then
		echo "  [backup] ${SUPERPOWERS_DIR} -> ${SUPERPOWERS_DIR}.bak"
		mv "$SUPERPOWERS_DIR" "${SUPERPOWERS_DIR}.bak"
	fi
	echo "  [clone] cloning superpowers..."
	git clone --quiet "$SUPERPOWERS_REPO" "$SUPERPOWERS_DIR"
fi

# Register the superpowers plugin
link_item "${SUPERPOWERS_DIR}/.opencode/plugins/superpowers.js" \
	"${PLUGINS_TARGET}/superpowers.js" \
	"superpowers plugin"

# Copy superpowers skills
if [ -L "${SKILLS_TARGET}/superpowers" ]; then
	echo "  [migrate] removing old superpowers directory symlink"
	rm "${SKILLS_TARGET}/superpowers"
fi
mkdir -p "${SKILLS_TARGET}/superpowers"

for sp_skill_dir in "${SUPERPOWERS_DIR}/skills"/*/; do
	[ -d "$sp_skill_dir" ] || continue
	sp_skill_name="$(basename "$sp_skill_dir")"
	copy_dir "$sp_skill_dir" "${SKILLS_TARGET}/superpowers/${sp_skill_name}" "superpowers/${sp_skill_name}"
done

# Clean up stale plugin skill overrides (these now come from superpowers fork)
for stale_skill in writing-plans subagent-driven-development; do
	if [ -d "${SKILLS_TARGET}/${stale_skill}" ]; then
		echo "  [remove] stale plugin skill override: ${stale_skill}"
		rm -rf "${SKILLS_TARGET}/${stale_skill}"
	fi
done

# Copy superpowers commands
for cmd_file in "${SUPERPOWERS_DIR}/commands"/*.md; do
	[ -f "$cmd_file" ] || continue
	cmd_name="$(basename "$cmd_file")"
	copy_item "$cmd_file" "${COMMANDS_TARGET}/${cmd_name}" "superpowers: ${cmd_name}"
done

# ── Autoresearch (third-party plugin) ────────────────────────
# https://github.com/moedesux/autoresearch-opencode/blob/master/QUICKSTART.md
# Cloned to a harness-neutral location, then its own install.sh copies the
# plugin/skill/command into ${OPENCODE_DIR}. --force skips the interactive prompt.
AUTORESEARCH_DIR="${HOME}/.agents/autoresearch-opencode"
AUTORESEARCH_REPO="https://github.com/moedesux/autoresearch-opencode.git"
mkdir -p "$(dirname "$AUTORESEARCH_DIR")"

echo ""
echo "Autoresearch:"

if [ -d "$AUTORESEARCH_DIR/.git" ]; then
	current_remote="$(git -C "$AUTORESEARCH_DIR" remote get-url origin 2>/dev/null || true)"
	if [ "$current_remote" != "$AUTORESEARCH_REPO" ]; then
		echo "  [update] switching autoresearch remote to ${AUTORESEARCH_REPO}"
		git -C "$AUTORESEARCH_DIR" remote set-url origin "$AUTORESEARCH_REPO"
	fi
	echo "  [update] pulling latest autoresearch..."
	git -C "$AUTORESEARCH_DIR" pull --ff-only --quiet
else
	if [ -e "$AUTORESEARCH_DIR" ]; then
		echo "  [backup] ${AUTORESEARCH_DIR} -> ${AUTORESEARCH_DIR}.bak"
		mv "$AUTORESEARCH_DIR" "${AUTORESEARCH_DIR}.bak"
	fi
	echo "  [clone] cloning autoresearch..."
	git clone --quiet "$AUTORESEARCH_REPO" "$AUTORESEARCH_DIR"
fi

if [ -x "${AUTORESEARCH_DIR}/scripts/install.sh" ]; then
	echo "  [install] running autoresearch install.sh..."
	if ! "${AUTORESEARCH_DIR}/scripts/install.sh" --force; then
		echo "  [warn] autoresearch install failed (continuing)"
	fi
else
	echo "  [skip] autoresearch install.sh not found or not executable"
fi

# ── Workmux (legacy cleanup) ─────────────────────────────────
# Workmux status and commands are now integrated into tw-opencode-plugin.
# Clean up artifacts from the previous deploy approach.
if [ -L "${PLUGINS_TARGET}/workmux-status.ts" ]; then
	echo "  [remove] legacy workmux-status.ts plugin"
	rm "${PLUGINS_TARGET}/workmux-status.ts"
fi
if [ -d "${SKILLS_TARGET}/workmux" ]; then
	echo "  [remove] legacy workmux skills directory"
	rm -rf "${SKILLS_TARGET}/workmux"
fi
for cmd in coordinator merge open-pr rebase worktree; do
	if [ -f "${COMMANDS_TARGET}/${cmd}.md" ]; then
		echo "  [remove] legacy workmux command: ${cmd}.md"
		rm "${COMMANDS_TARGET}/${cmd}.md"
	fi
done

# ── Cleanup stale symlinks ────────────────────────────────────
echo ""
echo "Cleanup:"
for dir in "$COMMANDS_TARGET" "$SKILLS_TARGET" "${SKILLS_TARGET}/superpowers" "$AGENTS_TARGET" "$PLUGINS_TARGET"; do
	[ -d "$dir" ] || continue
	for entry in "$dir"/*; do
		[ -L "$entry" ] || continue
		if [ ! -e "$entry" ]; then
			echo "  [remove] stale symlink: $(basename "$entry")"
			rm "$entry"
		fi
	done
done

# ── Claude Code Plugin ────────────────────────────────────────
CLAUDE_PLUGINS_DIR="${HOME}/.claude/plugins"
CLAUDE_PLUGINS_JSON="${CLAUDE_PLUGINS_DIR}/installed_plugins.json"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

echo ""
echo "Claude Code:"
mkdir -p "$CLAUDE_PLUGINS_DIR"

if [ ! -f "$CLAUDE_PLUGINS_JSON" ]; then
	echo '{"version": 2, "plugins": {}}' >"$CLAUDE_PLUGINS_JSON"
	echo "  [create] installed_plugins.json"
fi

if command -v jq &>/dev/null; then
	TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
	PLUGIN_VERSION="$(jq -r '.version // "0.1.0"' "${PLUGIN_DIR}/.claude-plugin/plugin.json")"

	jq --arg path "$PLUGIN_DIR" \
		--arg version "$PLUGIN_VERSION" \
		--arg ts "$TIMESTAMP" \
		'.plugins.tw = [{
         "scope": "user",
         "installPath": $path,
         "version": $version,
         "installedAt": $ts,
         "lastUpdated": $ts
       }]' "$CLAUDE_PLUGINS_JSON" >"${CLAUDE_PLUGINS_JSON}.tmp" &&
		mv "${CLAUDE_PLUGINS_JSON}.tmp" "$CLAUDE_PLUGINS_JSON"
	echo "  [register] tw plugin (${PLUGIN_DIR})"

	# Enable the plugin in Claude Code settings
	if [ -f "$CLAUDE_SETTINGS" ]; then
		if ! jq -e '.enabledPlugins.tw // false' "$CLAUDE_SETTINGS" >/dev/null 2>&1; then
			jq '.enabledPlugins.tw = true' "$CLAUDE_SETTINGS" >"${CLAUDE_SETTINGS}.tmp" &&
				mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
			echo "  [enable] tw in settings.json"
		else
			echo "  [skip] tw already enabled in settings.json"
		fi
	fi
else
	echo "  [skip] jq not found, cannot register Claude Code plugin"
fi

# ── Pi Coding Agent ────────────────────────────────────────────
PI_AGENT_DIR="${HOME}/.pi/agent"
PI_SKILLS="${PI_AGENT_DIR}/skills"
PI_PROMPTS="${PI_AGENT_DIR}/prompts"
PI_AGENTS="${PI_AGENT_DIR}/agents"

echo ""
echo "Pi:"

# Skills (same files as OpenCode)
mkdir -p "$PI_SKILLS"
for skill_dir in "${PLUGIN_DIR}/skills"/*/; do
	[ -d "$skill_dir" ] || continue
	skill_name="$(basename "$skill_dir")"
	copy_dir "$skill_dir" "${PI_SKILLS}/${skill_name}" "${skill_name}"
done

# Superpowers skills
if [ -d "${SUPERPOWERS_DIR}/skills" ]; then
	mkdir -p "${PI_SKILLS}/superpowers"
	for sp_skill_dir in "${SUPERPOWERS_DIR}/skills"/*/; do
		[ -d "$sp_skill_dir" ] || continue
		sp_skill_name="$(basename "$sp_skill_dir")"
		copy_dir "$sp_skill_dir" "${PI_SKILLS}/superpowers/${sp_skill_name}" "superpowers/${sp_skill_name}"
	done
fi

# Superpowers agents
if [ -d "${SUPERPOWERS_DIR}/agents" ]; then
	mkdir -p "$PI_AGENTS"
	for agent_file in "${SUPERPOWERS_DIR}/agents"/*.md; do
		[ -f "$agent_file" ] || continue
		agent_name="$(basename "$agent_file")"
		copy_item "$agent_file" "${PI_AGENTS}/${agent_name}" "superpowers agent: ${agent_name}"
	done
fi

# Pi extension — symlink src/ as the extension directory.
# Pi's jiti loader picks up tw-pi.ts via the pi.extensions manifest
# in src/pi-package.json (symlinked as package.json inside the extension).
# Since tw-pi.ts lives at the src/ root alongside its dependencies
# (tool-priority-rules.ts, review/, shared/, pi/runner.ts), all imports
# resolve naturally with no extra symlinks.
PI_EXTENSIONS="${PI_AGENT_DIR}/extensions"
PI_EXT_DIR="${PI_EXTENSIONS}/tw-plugin"
link_item "${PLUGIN_DIR}/src" \
	"${PI_EXT_DIR}" \
	"extension: tw-plugin -> src/"

# Pi subagent extension (bundled from pi's examples)
# This gives pi the 'subagent' tool for delegating to specialized agents.
PI_SUBAGENT_SRC="$(dirname "$(command -v pi 2>/dev/null || echo /dev/null)")/../lib/node_modules/pi-monorepo/examples/extensions/subagent"
PI_SUBAGENT_DST="${PI_EXTENSIONS}/subagent"
if [ -d "$PI_SUBAGENT_SRC" ]; then
	mkdir -p "$PI_SUBAGENT_DST"
	if command -v rsync &>/dev/null; then
		rsync -rc --delete "${PI_SUBAGENT_SRC}/" "${PI_SUBAGENT_DST}/"
	else
		rm -rf "$PI_SUBAGENT_DST"
		cp -R "$PI_SUBAGENT_SRC" "$PI_SUBAGENT_DST"
	fi
	echo "  [copy] subagent extension"
else
	# Fallback: try nix store path
	PI_SUBAGENT_NIX="$(find /nix/store -maxdepth 1 -name 'pi-coding-agent-*' -type d 2>/dev/null | sort -V | tail -1)/lib/node_modules/pi-monorepo/examples/extensions/subagent"
	if [ -d "$PI_SUBAGENT_NIX" ]; then
		mkdir -p "$PI_SUBAGENT_DST"
		if command -v rsync &>/dev/null; then
			rsync -rc --delete "${PI_SUBAGENT_NIX}/" "${PI_SUBAGENT_DST}/"
		else
			rm -rf "$PI_SUBAGENT_DST"
			cp -R "$PI_SUBAGENT_NIX" "$PI_SUBAGENT_DST"
		fi
		echo "  [copy] subagent extension (from nix store)"
	else
		echo "  [skip] subagent extension (source not found)"
	fi
fi

# Pi prompt templates
mkdir -p "$PI_PROMPTS"
for f in "${PLUGIN_DIR}/prompts"/*.md; do
	[ -f "$f" ] || continue
	copy_item "$f" "${PI_PROMPTS}/$(basename "$f")" "prompt: $(basename "$f")"
done

# Pi agents (plugin-specific)
mkdir -p "$PI_AGENTS"
for f in "${PLUGIN_DIR}/pi-agents"/*.md; do
	[ -f "$f" ] || continue
	copy_item "$f" "${PI_AGENTS}/$(basename "$f")" "agent: $(basename "$f")"
done

# Cleanup stale pi symlinks
for dir in "$PI_SKILLS" "${PI_SKILLS}/superpowers" "$PI_PROMPTS" "$PI_AGENTS" "$PI_EXTENSIONS"; do
	[ -d "$dir" ] || continue
	for entry in "$dir"/*; do
		[ -L "$entry" ] || continue
		if [ ! -e "$entry" ]; then
			echo "  [remove] stale symlink: $(basename "$entry")"
			rm "$entry"
		fi
	done
done

# ── Guard: restore this repo's own remote if something clobbered it ─────────
# deploy.sh manages ~/.agents/superpowers via 'git -C $SUPERPOWERS_DIR' and
# never intentionally touches the tw-agent-plugin remote.  This check is a
# safety net in case an agent ran 'git remote set-url origin' without the -C
# scope, or some other script changed it.
TW_PLUGIN_REMOTE="git@github.com:trevorwhitney/tw-agent-plugin.git"
if git -C "$PLUGIN_DIR" rev-parse --git-dir &>/dev/null; then
	current_tw_remote="$(git -C "$PLUGIN_DIR" remote get-url origin 2>/dev/null || true)"
	if [ -n "$current_tw_remote" ] && [ "$current_tw_remote" != "$TW_PLUGIN_REMOTE" ]; then
		echo "  [restore] origin was '$current_tw_remote', resetting to $TW_PLUGIN_REMOTE"
		git -C "$PLUGIN_DIR" remote set-url origin "$TW_PLUGIN_REMOTE"
	fi
fi

echo ""
echo "Done. Restart OpenCode, Claude Code, and/or Pi to pick up changes."
