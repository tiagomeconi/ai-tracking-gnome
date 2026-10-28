# AI Usage Monitor — Desktop (Windows / Linux)

A system-tray app version of the [GNOME extension](../README.md): same
providers (Claude, Codex, Antigravity), same real-quota data, same popup,
pace projection, limit notifications and local history chart — for systems
that don't run GNOME Shell (**Windows 10/11**, KDE/XFCE/etc. on Linux).

> On GNOME (including Fedora Workstation) prefer the native
> [extension](../README.md): it lives in the top bar and needs no extra
> process. This app is for everything else.

Built with Electron. All domain logic (parsers, normalizer, history,
notification rules) is **shared with the extension**: `scripts/sync-shared.mjs`
copies the GJS-free files of `extension/lib` into `src/shared` (git-ignored)
before every `start`/`test`/build.

## Run from source

```bash
cd desktop
npm install
npm start
```

Requires Node.js 20+. `npm test` (from here or the repo root) runs the unit
tests under plain Node — no Electron needed.

## Build an installer

```bash
npm run dist:win     # run on Windows -> dist/*.exe (NSIS)
npm run dist:linux   # AppImage + .rpm (Fedora) -> dist/
```

Build each target on its own OS (cross-building NSIS from Linux needs Wine).

## Where it reads credentials from

Same idea as the extension — it reuses the login the official CLIs already
made, read-only, never stored or logged:

| Provider | Linux | Windows |
|---|---|---|
| Claude | `~/.claude/.credentials.json` (or `$CLAUDE_CONFIG_DIR`) | `%USERPROFILE%\.claude\.credentials.json` |
| Codex | runs `codex app-server --stdio` (needs `codex` on `PATH`) | same (`codex.cmd` shim handled) |
| Antigravity | Secret Service via `secret-tool lookup` (package `libsecret`) | Credential Manager entry `gemini:antigravity`, read through PowerShell |

macOS is not a target: Claude Code keeps its token in the Keychain there,
which isn't supported.

Data files: settings in `%APPDATA%\ai-usage-monitor` / `~/.config/ai-usage-monitor`,
history in `%LOCALAPPDATA%\ai-usage-monitor` / `~/.cache/ai-usage-monitor`
(the same history file the GNOME extension uses).

## Notes per platform

- **Windows** — tray icons can't show text, so the icon itself is drawn with
  the percentage of the provider closest to its limit, colored by state
  (green / yellow / orange / red). Left-click opens the panel, right-click the
  menu. "Start with system" is in Preferences.
- **Linux** — needs a system tray: KDE, XFCE, Cinnamon, MATE work out of the
  box (on KDE, left-click should open the panel and right-click the menu —
  newly added, still to be confirmed); on GNOME it needs the *AppIndicator* extension (but then just use the
  native extension). Some desktops only deliver the tray menu, not the click,
  so the menu's first item is "Mostrar painel".

## Tray icon, floating panel and widget

All in Preferences → General:

- **Tray icon** — choose which AI the icon shows ("Automatic" = the one
  closest to its limit, or a specific provider; a provider without data shows
  a grey icon) and its style: *circle with number* (default) or *gauge*
  (half-circle speedometer with the number below).
- **Panel** — drag it by the bottom bar to move it; once moved it stays put
  (it no longer hides when losing focus) until closed with ✕, `Esc` or a
  click on the tray icon.
- **Floating widget** (off by default) — a small translucent always-on-top
  square with one row per provider (peak usage + bar). Drag it anywhere; the
  position is remembered. Right-click for a menu, double-click opens the full
  panel. Opacity is adjustable (40–100%). It can also be toggled from the
  tray menu ("Alternar widget flutuante").

## Status / not yet validated

The Windows path (Credential Manager lookup, `codex.cmd` spawn, tray/popup
placement near the taskbar, floating-widget transparency) has been written and unit-tested with injected
fakes but **not run on a real Windows machine yet**; the Credential Manager
item name used by the Antigravity CLI is inferred from the usual
`<service>:<user>` convention. See
[ADR-009](../docs/decisions/ADR-009-desktop-app-windows-linux.md).
