#!/usr/bin/env bash
# Removes the alias added by scripts/install.sh from your shell profile.
# Safe to re-run — a no-op if the alias isn't present.
set -euo pipefail

MARKER="# gh-cp-chat-analyser alias (managed by scripts/install.sh)"

detect_profile() {
  case "${SHELL:-}" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash) [ -f "$HOME/.bashrc" ] && echo "$HOME/.bashrc" || echo "$HOME/.bash_profile" ;;
    *) echo "$HOME/.profile" ;;
  esac
}

PROFILE="${CPCHAT_PROFILE:-$(detect_profile)}"

if [ ! -f "$PROFILE" ] || ! grep -qF "$MARKER" "$PROFILE"; then
  echo "No gh-cp-chat-analyser alias found in ${PROFILE} — nothing to do."
  exit 0
fi

tmp="$(mktemp)"
awk -v marker="$MARKER" '
  $0 == marker { skip=1; next }
  skip == 1 { skip=0; next }
  { print }
' "$PROFILE" > "$tmp"
# drop the blank line install.sh put before the marker
sed -i -e '${/^$/d}' "$tmp"
mv "$tmp" "$PROFILE"

echo "Removed the alias from ${PROFILE}"
echo "Run 'source ${PROFILE}' (or open a new terminal) for this to take effect."
