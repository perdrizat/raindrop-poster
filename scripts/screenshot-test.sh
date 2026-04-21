#!/usr/bin/env bash
# screenshot-test.sh
#
# Runs the screenshot pipeline on all problem URLs, saves them to
# server/scripts/screenshots/ and prints a summary with file paths
# ready for visual / AI-vision inspection.
#
# Usage:
#   ./scripts/screenshot-test.sh
#
# After it finishes, hand the printed file paths to Claude Code (or open them
# in an image viewer) and verify each image.
#
# See server/scripts/screenshot-test.mjs for the full mission and verification guide.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/server/scripts/screenshots"
mkdir -p "$OUTPUT_DIR"

# Point db.js at the server's data directory so getSetting() reads the correct SQLite file.
# Without this, process.cwd() (repo root) would open a different, empty database.
export DATA_DIR="$REPO_ROOT/server"

echo ""
echo "📸  Raindrop screenshot test"
echo "    Output dir: $OUTPUT_DIR"
echo ""

# Run the capture script; progress goes to stderr (shown here), parseable
# IMG/ERR lines go to stdout (captured into $lines).
mapfile -t lines < <(node "$REPO_ROOT/server/scripts/screenshot-test.mjs" 2>&1 1>/tmp/_ss_out.txt; cat /tmp/_ss_out.txt)

declare -a image_paths=()

for line in "${lines[@]}"; do
    type="${line%%$'\t'*}"
    rest="${line#*$'\t'}"
    name="${rest%%$'\t'*}"
    value="${rest#*$'\t'}"

    if [[ "$type" == "IMG" ]]; then
        dest="$value"
        echo "  ✓  $name"
        echo "     Local : $dest"
        echo ""
        image_paths+=("$dest")
    elif [[ "$type" == "ERR" ]]; then
        echo "  ✗  $name"
        echo "     Error : $value"
        echo ""
    fi
done

echo "────────────────────────────────────────"
echo "Downloaded ${#image_paths[@]} image(s) to $OUTPUT_DIR"
echo ""
echo "To inspect in Claude Code, run:"
echo "  (the assistant can read image files directly)"
echo ""
echo "File paths:"
for p in "${image_paths[@]}"; do
    echo "  $p"
done
echo ""
