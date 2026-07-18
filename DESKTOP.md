# EmberOS Desktop

EmberOS ships as a **native desktop app** (Windows) *and* the existing web app —
from **one codebase**. The desktop app is a hardened [Tauri v2](https://tauri.app)
shell (Rust + the OS WebView2) that runs the *same* live EmberOS you deploy to
Netlify. Nothing about the web deployment changes.

---

## Why this architecture

EmberOS relies on **server-side API routes** (Google, Gmail, bank/PSD2, AI,
push) that hold **secret keys**. Those must stay on the server. So the desktop
app talks to the **same backend** at `https://ember-os.netlify.app` — which means:

- **Account & data sync are automatic.** Same login, same Supabase realtime.
  A change on desktop shows up on the web instantly and vice-versa.
- **No secrets in the binary.** The installer contains only the native shell.
- **One codebase.** The desktop *is* the web app, wrapped in native chrome.

It is **not** "a website in a window": the React app detects the Tauri runtime
and renders a **frameless custom title bar**, and the Rust shell adds a splash
screen, system tray, global hotkey, launch-at-startup, native notifications,
browser-routing for external links, and **signed background auto-updates**.

```
        ┌────────────────────────── shared repo ──────────────────────────┐
        │  src/ (Next.js React app)          src-tauri/ (Rust shell)       │
        │      │                                   │                       │
   Netlify  npm run build                   tauri-action (CI on v* tag)    │
        │      │                                   │                       │
   ember-os.netlify.app  ◀───loads the same URL───  EmberOS.exe (updater)  │
        └──────────────────────────────────────────────────────────────────┘
```

Two kinds of "update" fall out of this, both automatic:

- **Web/feature changes** (new UI, fixes) go live the moment Netlify deploys —
  desktop users get them on next load, no release needed.
- **Native shell changes** (title bar, tray, Tauri/deps) ship via a tagged
  **GitHub Release** and the in-app updater (below).

---

## Local development

Prereqs (one-time): [Rust](https://www.rust-lang.org/tools/install) (stable) and
**WebView2** (preinstalled on Windows 10/11). Node deps come from `npm install`.

```bash
npm install
npm run desktop:dev     # starts `next dev` and opens the native window on it
```

`desktop:dev` builds in debug mode, which loads `http://localhost:3000` (hot
reload works). Release builds load the production URL.

```bash
npm run desktop:build   # produces installers in src-tauri/target/release/bundle
```

To point a build at a different origin without editing code, set `EMBER_URL`
(e.g. a preview deploy) before launching the app.

---

## Releasing a desktop update

The pipeline is `.github/workflows/desktop-release.yml`. It runs on any `v*`
tag, builds the Windows NSIS + MSI installers, **signs** the updater artifacts,
and publishes a GitHub Release containing `latest.json` (the manifest the app
polls at `releases/latest/download/latest.json`).

```bash
# 1. Bump the version (single source of truth — tauri.conf.json reads it):
#    edit "version" in package.json, e.g. 0.1.0 -> 0.1.1
# 2. Commit, tag, push:
git commit -am "release: v0.1.1"
git tag v0.1.1
git push && git push origin v0.1.1
```

CI does the rest. Installed apps check on launch (and every 6 h), download in
the background, and show a one-click **"Restart & update"** banner — the
VS Code / Discord experience.

### One-time GitHub setup (required for the updater)

Add **one repository secret** at
`https://github.com/TomZ214/ember-personal-os/settings/secrets/actions`
(that's the **repo's** Settings tab — *not* your account settings):

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | The full contents of `src-tauri/updater.key` (generated locally; **never committed** — it's gitignored). |

> **Do not create `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.** GitHub refuses to save
> a secret with an empty value, and our key has no password. The workflow still
> references it — an undefined secret resolves to an empty string, which is
> exactly what the signer needs (and it stops the CLI prompting for a password).

The matching **public** key is already baked into `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`), so the app only trusts updates signed by your key.

> Keep `src-tauri/updater.key` safe and backed up. If you lose it you can't sign
> updates for existing installs (you'd ship a new signed build users reinstall).

---

## What the native shell adds

| Area | Implementation |
| --- | --- |
| Frameless window + **custom title bar** | `decorations: false`; the app's `TopBar` becomes the drag region with native min/max/close (`WindowControls`) and edge grips (`ResizeHandles`). |
| **Splash screen** | `src-tauri/dist/splashscreen.html`, shown until the app's first paint, then swapped for the main window. |
| **System tray** | Open / Today's tasks / Check for updates / Quit. Left-click shows the window. |
| **Launch at startup** | On by default (autostart plugin, starts hidden to tray). Toggle in **Settings → Desktop app**. |
| **Global hotkey** | `Ctrl+Shift+E` shows/hides the window from anywhere. |
| **Single instance** | A second launch focuses the running window. |
| **Window state** | Size/position remembered across restarts. |
| **Native notifications** | Used for update prompts; `nativeNotify()` is available to the app. |
| **External links** | Cross-origin links open in the real browser, not the app window. |
| **Auto-update** | `tauri-plugin-updater` + GitHub Releases, minisign-signed. |

All web-facing desktop code lives behind `isDesktop()` / `useIsDesktop()` in
`src/lib/desktop.ts` and dynamic `import()`s, so **the web bundle never loads a
byte of Tauri code** and the Netlify build is byte-for-byte unaffected.

---

## Security model

- **Secrets never leave the server.** The desktop calls the same Netlify APIs;
  tokens stay in httpOnly cookies within the WebView, exactly as in a browser.
- **Least-privilege IPC.** `src-tauri/capabilities/default.json` grants only the
  window/updater/autostart/notification/opener commands actually used. The
  `remote.urls` allowlist is what lets *your* origin drive the shell — no other
  site can.
- **Signed updates only.** Updates must carry a valid signature from your
  private key or the app refuses them.
- **No Node integration / no arbitrary FS.** Tauri's Rust core exposes only the
  allowlisted commands; there's no `nodeIntegration`-style surface.

---

## Configuration reference

| What | Where |
| --- | --- |
| Production URL loaded in release | `PROD_URL` in `src-tauri/src/lib.rs` |
| Dev URL loaded in debug | `DEV_URL` in `src-tauri/src/lib.rs` |
| Origins allowed to drive the shell | `remote.urls` in `src-tauri/capabilities/default.json` |
| Updater feed | `plugins.updater.endpoints` in `src-tauri/tauri.conf.json` |
| App version | `version` in `package.json` (referenced by `tauri.conf.json`) |
| App icons | `src-tauri/icons/` (regenerate with `npx tauri icon src/app/icon.png`) |

If you rename the site or repo, update `PROD_URL`, `remote.urls`, and the
updater `endpoints` to match.
