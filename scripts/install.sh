#!/usr/bin/env bash
# Instala a extensão AI Usage Monitor localmente, via symlink, para que
# `git pull` neste repositório já atualize a extensão instalada.
set -euo pipefail

UUID="ai-usage-monitor@prohound.io"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_DIR/extension"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

if ! command -v gnome-shell >/dev/null 2>&1; then
    echo "Aviso: gnome-shell não encontrado no PATH. Este script assume um sistema GNOME Shell (ex.: Zorin OS, Ubuntu, Fedora)." >&2
fi

mkdir -p "$HOME/.local/share/gnome-shell/extensions"

if [ -L "$TARGET_DIR" ] || [ -e "$TARGET_DIR" ]; then
    echo "Já existe algo em $TARGET_DIR — removendo antes de reinstalar."
    rm -rf "$TARGET_DIR"
fi

ln -s "$SOURCE_DIR" "$TARGET_DIR"
echo "Extensão linkada em: $TARGET_DIR -> $SOURCE_DIR"

echo
echo "Próximos passos:"
echo "  Wayland: faça logout/login e rode:"
echo "    gnome-extensions enable $UUID"
echo "  X11: recarregue a Shell (Alt+F2, digite r, Enter) e rode o comando acima."
echo
echo "Depois, abra as preferências pelo botão de engrenagem no popup, ou:"
echo "  gnome-extensions prefs $UUID"
