# ADR-009 — App desktop (Electron) para Windows e Linux fora do GNOME

## Status

Aceito. Parcialmente validado (ver "Validação").

## Contexto

O projeto nasceu como extensão do GNOME Shell. Pedido: ter versões para
**Fedora** e **Windows**.

- **Fedora Workstation usa GNOME.** A extensão já roda lá; só foi preciso
  declarar GNOME 49 em `metadata.json` (Fedora 43), documentar e fazer o
  `install.sh` checar o typelib do libsecret com dica `dnf`. Não exige código
  novo.
- **Windows não tem GNOME Shell.** A extensão (GJS/St/Clutter/GSettings/
  libsecret) não tem como rodar; é preciso um app separado.

## Decisão

1. Novo app em `desktop/`, em **Electron** (ícone de bandeja + popup +
   janela de preferências), multiplataforma: Windows e Linux sem GNOME
   (KDE etc.). macOS fora de escopo (Claude guarda o token no Keychain).
2. **Reuso de `extension/lib`**: toda a lógica pura (parsers, normalizer,
   history, thresholdNotifier, providerManager, retry, cache, format) já era
   JS sem GJS. `desktop/scripts/sync-shared.mjs` a copia para
   `desktop/src/shared` (ignorado pelo git) antes de start/test/build — o
   electron-builder só empacota arquivos dentro de `desktop/`, e assim não
   há segunda cópia a manter. Arquivos com `gi://` são pulados
   automaticamente.
3. **Só a camada de I/O é reescrita** (`desktop/src/main/`):
   `fetch` no lugar de Soup, `child_process` no lugar de `Gio.Subprocess`,
   `fs` no lugar de Gio.File/GLib. Keyring via `credentials.js`: Linux
   `secret-tool lookup` (nunca `search --all`, ver ADR-008), Windows
   Credential Manager por `CredRead` em PowerShell (sem módulo nativo, para
   não exigir toolchain de compilação), macOS `security`.
4. **Sem texto na bandeja**: o Windows não mostra texto ao lado do ícone
   (a top bar do GNOME mostra "Claude 85%"). O ícone é gerado em memória
   (PNG RGBA, `trayIcon.js`) com o percentual desenhado e a cor do estado;
   o tooltip traz "Provedor N%".
5. O renderer só desenha um view-model pronto (`viewModel.js`, equivalente
   a `menu.js`), com `contextIsolation`, `sandbox`, CSP restritiva, DOM sem
   `innerHTML`, e `openExternal` limitado a URLs https que o próprio app
   listou como "gerenciar".
6. O histórico no Linux usa o mesmo arquivo da extensão
   (`~/.cache/ai-usage-monitor/history.jsonl`).

## Alternativas descartadas

- **Tauri**: binário menor, mas os providers (HTTP, subprocesso, keyring)
  teriam de ser reescritos em Rust; só os parsers JS seriam reaproveitados.
- **.NET/WPF**: reescrita total, sem reuso.

## Consequências

- ~100 MB de instalador (Electron) — aceito em troca do reuso.
- Duas UIs (extensão GNOME e app) consomem o mesmo domínio; mudança em
  `extension/lib` vale para as duas.
- Fedora/GNOME continua com a extensão nativa; o app é recomendado só onde
  não há GNOME.

## Validação

- `npm test`: domínio (127) + app (31) passam sob Node, com fetch/spawn/
  keyring injetados.
- Smoke test do Electron em Linux (X11): app sobe sem erro de JS, falha
  de provider vira estado de erro, popup renderiza o view-model (screenshot
  conferido).
- **Pendente em máquina real**: Windows (Credential Manager — o nome do
  item `gemini:antigravity` é inferido do padrão `<service>:<user>` do
  go-keyring; shim `codex.cmd`; posicionamento do popup junto à barra de
  tarefas; instalador NSIS), Fedora com GNOME 49 e a extensão, e bandeja em
  KDE.
