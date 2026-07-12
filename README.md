# Ember — Personal OS

Your entire life, organized in one calm, fast place. Ember is a local-first personal
operating system: dashboard, calendar, tasks, notes, habits, goals, finance, mail,
contacts, files and an encrypted vault — wrapped in a dark, ember-lit glass interface.

It also connects to the real world: **Google Calendar (two-way), Gmail, Google
Contacts, and your bank via PSD2 open banking** — see [SETUP.md](SETUP.md).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (all routes prerender statically)
```

On first launch Ember seeds itself with realistic demo data so every screen feels
alive. Restore or erase it any time under **Settings → Data**.

## The idea

- **Local-first, private by default.** No account, no server, no tracking. Data lives
  in `localStorage`, files in IndexedDB, vault secrets in an AES-256-GCM blob whose
  key is derived from your master passphrase (PBKDF2, 310k iterations) and never
  touches disk.
- **Connected when you want it.** Add env vars ([SETUP.md](SETUP.md)) and the same UI
  runs against real services: Calendar merges and two-way syncs with Google (all
  calendars, colors, attendees, recurring events, drag & drop), Mail becomes a full
  Gmail client (labels, search, compose/reply/forward, attachments,
  archive/trash/spam, AI summaries + smart replies), Contacts merge from Google, and
  Finance shows live balances, auto-categorized transactions, detected subscriptions
  and cash-flow insights from your bank (PSD2 via Enable Banking — Sparkasse
  Heidelberg and 2,500+ EU banks). OAuth tokens are AES-256-GCM-encrypted in httpOnly cookies,
  refreshed automatically, and never reach the browser. Disconnect any service from
  **Settings → Connections**; everything falls back to local mode instantly.
- **One keystroke away.** `⌘K` / `Ctrl+K` opens the command palette: search
  everything, jump anywhere, or type naturally — *"Dentist tomorrow 14:30"* becomes a
  calendar event, anything else becomes a task.
- **Desktop feels native, mobile feels iOS.** A macOS-style dock with cursor
  magnification on desktop; a bottom tab bar, swipe-dismissable sheets and big touch
  targets on the phone.

## Modules

| Route | What it does |
|---|---|
| `/` | Bento dashboard: agenda, focus timer, live weather (Open-Meteo), habits, tasks, goals, two-week activity pulse, productivity score |
| `/tasks` | Kanban board with drag & drop + list view; priorities, tags, subtasks, due dates |
| `/calendar` | Month / week / day / agenda views, natural-language quick add, recurring events, drag events between days |
| `/mail` | Inbox with labels, search, quick summaries, compose, drafts, archive, starring |
| `/notes` | Folders, markdown editor with live preview, pinning, full-text search |
| `/habits` | Weekly targets, streaks, best runs, 18-week heatmaps |
| `/goals` | Milestone checklists with progress rings and deadline countdowns |
| `/finance` | Monthly income/expenses/net, 4-month chart, category donut, subscriptions |
| `/vault` | AES-256 encrypted secrets with a passphrase gate and password generator |
| `/files` | Drag-&-drop upload into IndexedDB, image previews, download, delete |
| `/contacts` | Groups, birthdays with upcoming-birthday chips |
| `/settings` | Profile, weather location (geolocation supported), focus durations, data reset |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Framer Motion · Zustand
(persisted) · date-fns · Lucide icons · Web Crypto · IndexedDB.

Charts are hand-rolled SVG/DOM animated with springs — no chart library needed.
There is deliberately **no database or auth layer**: the product is local-first, so
Prisma/Supabase/NextAuth would add credentials and moving parts without adding value.

## Architecture

```
src/
  app/            one folder per module (client components — state is local)
    api/          route handlers: google/* (OAuth, calendar, gmail, contacts),
                  bank/* (PSD2 flow, accounts, transactions), ai (Claude)
  components/
    shell/        TopBar, Dock, MobileTabs, CommandPalette, Shell
    ui/           Button, Modal, inputs, toast, badges, rings, empty states
    widgets/      dashboard widgets
    mail/         GmailApp (connected) + LocalMail (offline fallback)
    finance/      BankPanel + shared chart components
  hooks/
    useApi.ts     tiny shared-cache fetch hook with polling + invalidation
    useIntegrations.ts  connection status, merged calendar source, gmail, bank
  lib/
    store.ts      zustand store (single source of truth, persisted)
    seed.ts       first-run demo data
    nlp.ts        natural-language event parser (en + de)
    crypto.ts     vault encryption (client-side, Web Crypto)
    markdown.ts   dependency-free markdown renderer
    idb.ts        IndexedDB blob store
    finance/      transaction categorizer + subscription detection
    integrations/ client-safe DTOs shared by routes and hooks
    server/       server-only: AES-GCM token crypto, encrypted cookie
                  sessions, Google OAuth + API services, Enable Banking client
```

Secrets policy: credentials exist only as environment variables; OAuth/refresh
tokens and bank requisition ids are AES-256-GCM encrypted inside httpOnly
`sameSite=lax` cookies (`lib/server/crypto.ts`), auto-refreshed server-side, and
never serialized to the client. Server modules import `server-only` so they can
never leak into a client bundle.

## Accessibility & motion

WCAG-AA contrast on text, `aria` labels/pressed states on interactive controls,
keyboard navigation in the palette, visible focus rings, and a global
`prefers-reduced-motion` path that collapses every animation to a crossfade.
