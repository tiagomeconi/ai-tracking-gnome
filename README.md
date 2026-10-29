# AI Usage Monitor for GNOME

<img src="extension/icons/logo.png" alt="AI Usage Monitor logo" width="120">

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45--49-4A86CF?logo=gnome&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Wayland%20%7C%20X11-4c7ba3)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-internal%20testing-dbab09)

A GNOME Shell extension that shows, at a glance, how much of your AI
subscriptions (Claude, ChatGPT/Codex, Gemini, GitHub Copilot) you've already
used — one indicator in the top bar instead of checking each app.

> Monitors **usage/quota**, never money spent.
>
> The extension's UI (popup, preferences, notifications) is in Portuguese
> (pt-BR) for now — that's why the screenshots below show Portuguese text.

## Why this exists

If you juggle more than one AI subscription day to day, it's easy to get
blindsided by a limit hitting mid-task. This extension puts all of them in
one place: a click on the top bar shows how much is left on each, and when
it renews.

## Features

- **Top bar indicator** — shows the name and percentage of whichever
  subscription is closest to its limit (not an average, so a nearly-maxed
  one never hides behind the others).
- **Popup with per-provider detail** — every configured AI gets its own
  card: usage bars per window (e.g. 5-hour and weekly), reset countdown,
  and a shortcut link straight to that provider's own usage/billing page.
  Providers with lots of windows (e.g. Antigravity, one per model) collapse
  into a dropdown so the popup never outgrows your screen.
- **"Safe pace" projection** — under each bar, a quick read on how much %
  you can still spend per hour/day before it renews, worked out from the
  percentage and reset time you already see (no extra tracking needed).
- **Configurable limit notifications** — get a system notification the
  moment any window crosses a % you choose, once per window until it
  resets. Default threshold is 80%, adjustable (or turn it off entirely)
  in Preferences.
- **Local usage history + trend chart** — a "Statistics" tab in
  Preferences shows a daily bar chart (peak usage per day, color-coded)
  per provider/window, built from snapshots saved on your machine — never
  sent anywhere.
- **Real quota, not an estimate** — Claude, Codex and Antigravity show the
  actual percentage from your account, reusing the login you already did
  in the official CLI (see [Privacy & security](#privacy--security)).
- **Preferences** — hide any provider you don't use from the indicator and
  popup, individually.
- **Manual + automatic refresh** — the popup opens instantly from cache
  (no network call just to look), refreshes in the background, and never
  lets one provider's failure hide the others.
- **Fully local** — no accounts of its own, no telemetry, no external
  server.

## What's real vs. still in progress

| AI | Status | What it shows |
|---|---|---|
| **Claude** (Claude Code) | ✅ Real data | Real percentage of the 5-hour and 7-day windows, straight from your account. |
| **Codex** (ChatGPT) | ✅ Real data | Real percentage of Codex CLI's 5-hour and weekly windows. |
| **Antigravity** (Gemini) | ✅ Real data | Real per-model quota from the official Antigravity CLI (`agy`), reusing its own login — doesn't cover the Gemini web app's usage counter, which has no public API. |
| **GitHub Copilot** | 🚧 In progress | Demo data for now — an official API exists, integration isn't wired up yet. |

## Screenshots

| Top bar indicator | Popup |
|---|---|
| ![Top bar indicator showing the closest-to-limit provider and percentage](docs/screenshots/panel.png) | ![Popup open, showing a card per provider with usage bars](docs/screenshots/popup.png) |

### Preferences

<img src="docs/screenshots/config.png" alt="Preferences window with a toggle per provider" width="500">

### Statistics

<img src="docs/screenshots/graph.png" alt="Statistics tab with a daily usage bar chart" width="500">

## Requirements

- Linux with GNOME Shell 45–49 (tested on Zorin OS 18 / GNOME Shell 46).
  **Fedora Workstation 40–43** ships GNOME 46–49 and is expected to work
  as-is (not yet tested on real hardware); only `libsecret` is needed, and
  it's already installed by default (`sudo dnf install libsecret` if not).
- For **Claude** real data: [Claude Code](https://claude.com/claude-code)
  installed and logged in (`claude auth login`).
- For **Codex** real data: [Codex CLI](https://developers.openai.com/codex/cli)
  installed and logged in (`codex login`).
- For **Antigravity** real data: [Antigravity CLI](https://antigravity.google/docs/cli/install)
  (`agy`) installed and logged in.
- Without those, the extension still works fine — the corresponding card
  just shows "authentication required" instead of a percentage.

## Installation

Not on extensions.gnome.org yet, and there are no pre-built releases, so
installing means cloning the repo. Pick your system:

| System | What to install |
|---|---|
| Ubuntu / Zorin / Debian / **Fedora** with GNOME | The [GNOME extension](#gnome-linux-incl-fedora) |
| **Windows 10/11** | The [tray app](#windows) |
| Linux with KDE, XFCE, etc. | The [tray app](#linux-without-gnome-kde-xfce-) |

### GNOME (Linux, incl. Fedora)

```bash
git clone https://github.com/tiagomeconi/ai-tracking-gnome.git
cd ai-tracking-gnome
./scripts/install.sh
```

Then log out/in (Wayland — the default on Fedora) or restart the Shell with
<kbd>Alt</kbd>+<kbd>F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd> (X11 only), and
enable it:

```bash
gnome-extensions enable ai-usage-monitor@prohound.io
```

To remove it later: `./scripts/uninstall.sh`.

On **Fedora**, `install.sh` also checks that `libsecret` is present and tells
you to run `sudo dnf install libsecret` if it isn't.

### Windows

The GNOME extension can't run on Windows, so there is a companion
**system-tray app** (Electron) with the same providers, popup, notifications
and history chart. It needs [Node.js](https://nodejs.org/) 20+ and Git.

```powershell
git clone https://github.com/tiagomeconi/ai-tracking-gnome.git
cd ai-tracking-gnome\desktop
npm install
npm start
```

The app shows up in the system tray (near the clock): the icon displays the
percentage of the provider closest to its limit. Left-click opens the panel,
right-click opens the menu. To get a regular installer (`.exe`) instead of
running from source:

```powershell
npm run dist:win     # creates desktop\dist\*.exe
```

Preferences also lets you pick which AI the tray icon shows, switch it to a
gauge style, and enable an optional **floating widget** (small translucent
always-on-top square you can drag anywhere) — see
[`desktop/README.md`](./desktop/README.md#tray-icon-floating-panel-and-widget).

Enable **Start with system** in Preferences if you want it always running.
Log in on the CLIs (`claude auth login`, `codex login`, `agy`) so there is
a session to reuse. The tray app has **not been tested on a real Windows
machine yet** — please report anything odd in an issue.

### Linux without GNOME (KDE, XFCE, ...)

Same steps as Windows (`cd desktop && npm install && npm start`). It needs a
system tray, and for Antigravity the `secret-tool` command
(`sudo dnf install libsecret` on Fedora, `sudo apt install libsecret-tools`
on Debian/Ubuntu). Packages: `npm run dist:linux` creates an AppImage and an
`.rpm` in `desktop/dist/`. More details in [`desktop/README.md`](./desktop/README.md).

## Usage

Click the indicator in the top bar to open the popup:

- Each card shows the provider's name, usage bar(s), how much % you can
  still safely spend per hour/day before it resets, and when each window
  resets.
- Providers with many windows (e.g. Antigravity) collapse into a "N
  windows — click to expand" dropdown.
- The **↗** button next to a provider's name opens that provider's own
  usage/billing page in your browser.
- **↻** at the bottom refreshes on demand; the timestamp next to it shows
  when data was last fetched.
- **⚙** opens **Preferences**, where you can hide any provider you don't
  want to see, turn limit notifications on/off and set the % that
  triggers them, and open the **Statistics** tab (a daily usage chart per
  provider/window, built from history saved locally).

### Display options (GNOME and desktop app)

In **Preferences** (both the extension and the tray app):

- **Which AI the indicator shows** — "Automatic" (closest to its limit) or a
  specific provider — and its **style** (logo/number or a half-circle gauge).
- **Floating widget** (off by default) — a compact, translucent card kept on
  top of other windows, one row per AI with the usage bar and *when it
  renews*. Drag it anywhere (the position is remembered; double-click opens
  the full panel) and choose, per AI, which window it shows (e.g. 5-hour or
  weekly). Opacity is adjustable. On GNOME the popup from the top bar stays
  as is — the widget is an extra.
- Tray app only: the full panel can be dragged by clicking anywhere on it.

After updating the GNOME extension, restart the Shell (log out/in on
Wayland) so the new code and settings schema are loaded.

## Troubleshooting

- **Indicator doesn't show up after enabling** — GNOME Shell only reloads
  extension code on a Shell restart. On Wayland, log out and back in; on
  X11, <kbd>Alt</kbd>+<kbd>F2</kbd>, <kbd>r</kbd>, <kbd>Enter</kbd> restarts
  the Shell in place.
- **Claude/Codex/Antigravity show "authentication required"** — make sure
  you're logged in on the CLI itself (`claude auth login` / `codex login`
  / `agy`); the extension reuses that session, it doesn't have its own
  login.
- **A card shows a temporary error that clears up on its own** — usually a
  provider's own rate limit from refreshing too often; it recovers
  automatically.
- **Something else looks wrong** — check the Shell's log for errors:

  ```bash
  journalctl --user -f -o cat /usr/bin/gnome-shell
  ```

## Privacy & security

- Fully open source — audit it yourself.
- No telemetry, no server of ours: the extension only talks directly to
  the providers' own official/internal APIs (Anthropic, OpenAI, Google).
- No credential is ever stored, logged, or sent anywhere else — tokens
  (file-based for Claude/Codex, system keyring for Antigravity) are read
  into memory only to build one request, never written anywhere.
- No web scraping, no browser session cookies — it only reuses the login
  the official CLIs already made for themselves.
- The usage history behind the Statistics chart is a local file
  (`~/.cache/ai-usage-monitor/history.jsonl`, pruned after 30 days) — it
  never leaves your machine.

## Feedback

This project is in internal testing. Found a bug, want another AI
supported, or have a UI suggestion? Open an
[issue](https://github.com/tiagomeconi/ai-tracking-gnome/issues).

## Development

The extension lives at `extension/`. Install it with the symlink method
above (`scripts/install.sh`) — it lets the Shell load the code straight
from your working copy.

Domain logic (`extension/lib/**`) has no GNOME Shell dependency, so its
tests run under plain Node:

```bash
npm test
```

The Windows/Linux tray app lives in `desktop/` (see its
[README](./desktop/README.md)); `npm test` at the root runs both test suites.

Project structure, architecture decisions (ADRs), and the research behind
each provider are in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

## Credits

The technique of reusing the official CLIs' own OAuth login (Claude
Code/Codex) to query real quota was verified against the open-source
[tokidachi](https://github.com/Gaalbu/tokidachi) project (MIT), by Gabriel
Albuquerque. The same technique for Antigravity was verified against
[antigravity-usage](https://github.com/skainguyen1412/antigravity-usage)
(MIT).

## License

MIT — see [LICENSE](./LICENSE).
