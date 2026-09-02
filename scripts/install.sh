#!/usr/bin/env bash
# Adds a shell alias that starts this app (npm start) and opens it in a
# browser. Safe to re-run — replaces its own previous entry instead of
# duplicating it.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ALIAS_NAME="${CPCHAT_ALIAS:-cpchat}"
MARKER="# gh-cp-chat-analyser alias (managed by scripts/install.sh)"
ALIAS_LINE="alias ${ALIAS_NAME}='cd \"${REPO_DIR}\" && npm start'"

detect_profile() {
  case "${SHELL:-}" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash) [ -f "$HOME/.bashrc" ] && echo "$HOME/.bashrc" || echo "$HOME/.bash_profile" ;;
    *) echo "$HOME/.profile" ;;
  esac
}

PROFILE="${CPCHAT_PROFILE:-$(detect_profile)}"
touch "$PROFILE"

if grep -qF "$MARKER" "$PROFILE"; then
  tmp="$(mktemp)"
  awk -v marker="$MARKER" '
    $0 == marker { skip=1; next }
    skip == 1 { skip=0; next }
    { print }
  ' "$PROFILE" > "$tmp"
  # drop the trailing blank line this script previously appended
  sed -i -e '${/^$/d}' "$tmp"
  mv "$tmp" "$PROFILE"
fi

printf '\n%s\n%s\n' "$MARKER" "$ALIAS_LINE" >> "$PROFILE"

echo "Added '${ALIAS_NAME}' alias to ${PROFILE}"
echo
echo "Run this to use it now:"
echo "  source ${PROFILE}"
echo
echo "Then '${ALIAS_NAME}' starts the app and opens it in your browser."
