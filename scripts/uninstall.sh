#!/usr/bin/env bash
# Remove o link da extensão AI Usage Monitor instalado por install.sh.
set -euo pipefail

UUID="ai-usage-monitor@prohound.io"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
fi

if [ -e "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
    echo "Removido: $TARGET_DIR"
else
    echo "Nada instalado em $TARGET_DIR"
fi
