# Ember — Integration Setup

Ember works fully offline out of the box. This guide wires up the real
integrations: **Google** (Calendar, Gmail, Contacts), **your bank** (PSD2 via
Enable Banking — Sparkasse Heidelberg supported), and optional **Claude AI**
mail features.

Everything is configured through environment variables — no credentials ever
live in code. Tokens are encrypted (AES-256-GCM) into httpOnly cookies and are
refreshed automatically; nothing secret is readable from the browser.

```bash
cp .env.example .env.local     # then fill it in, step by step below
npm run dev
```

After changing `.env.local`, restart the dev server. The
**Settings → Connections** page shows live status for each integration and
tells you which variables are still missing.

---

## 1. Base configuration (required for everything)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Where the app runs. Locally: `http://localhost:3000`. In production: your HTTPS origin. |
| `TOKEN_ENCRYPTION_KEY` | Random string (≥32 chars) that encrypts all stored tokens. |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> Changing this key later invalidates existing connections (they simply need to
> be reconnected — nothing breaks).

---

## 2. Google — Calendar, Gmail, Contacts

**What you get:** two-way calendar sync (all calendars, colors, attendees,
recurring events, drag & drop), a full Gmail client (labels, search, compose,
reply, forward, attachments, archive/trash/spam/star), and your Google
contacts merged into the Contacts page.

### Create the OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a project (e.g. "Ember").
2. **APIs & Services → Library** — enable these three APIs:
   - **Google Calendar API**
   - **Gmail API**
   - **People API**
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**, then fill in app name + your email.
   - Add yourself under **Test users** (while the app is in "Testing" mode,
     only test users can sign in — that's exactly right for a personal OS).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URI — exactly:

     ```
     http://localhost:3000/api/google/callback
     ```

     (Swap the origin for your production URL when deploying; it must match
     `NEXT_PUBLIC_APP_URL`.)
5. Copy the **Client ID** and **Client secret** into `.env.local`:

   ```
   GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   ```

### Connect

Restart the dev server → **Settings → Connections → Connect Google** → approve
the consent screen. Ember requests these scopes:

| Scope | Used for |
|---|---|
| `calendar` | Read + write events across all your calendars |
| `gmail.modify` | Read, send, label, archive, trash (no permanent delete scope) |
| `contacts.readonly` | Show your contacts (read-only) |
| `openid email profile` | Display which account is connected |

Access tokens auto-refresh server-side. If Google ever revokes the refresh
token (password change, revoked consent), the Connections page shows a
**Reconnect** button.

> **Note (Testing mode):** Google expires refresh tokens after 7 days while the
> consent screen is in "Testing". Either reconnect weekly or publish the
> consent screen (Publishing status → "In production"; no verification is
> needed for personal use with these scopes, Google just shows an "unverified
> app" interstitial).

---

## 3. Bank — PSD2 open banking (Sparkasse Heidelberg)

Ember uses **Enable Banking** for regulated PSD2 access to 2,500+ European
banks, including **Sparkasse Heidelberg**. It's **free for your own accounts**
(their "restricted production" tier). No screen scraping — you authenticate at
your bank's own website with SCA, and Ember receives read-only access to
balances and transactions.

> **Why not GoCardless/Nordigen?** GoCardless closed new signups for its free
> Bank Account Data product. Enable Banking is the current self-serve, free
> replacement for individuals.

Enable Banking authenticates your app with a key pair you generate once (the
private half never leaves your machine). Three steps:

### Step 1 — generate your key

```bash
npm run bank:keys
```

This creates `enablebanking_private.pem` (kept private, git-ignored) and prints
a **public key** block to your terminal. Leave that terminal open — you'll
paste the public key in the next step.

### Step 2 — register a free Enable Banking app

1. Go to [enablebanking.com](https://enablebanking.com) → **Sign up** (free) →
   open the **Control Panel** → **Applications → New application**.
2. Fill in:
   - **Environment:** Production (the free tier covers your own accounts)
   - **Redirect URLs:** add exactly

     ```
     http://localhost:3000/api/bank/callback
     ```

     (use your production URL when deploying)
   - **Public key:** paste the whole
     `-----BEGIN PUBLIC KEY----- … -----END PUBLIC KEY-----` block that
     `npm run bank:keys` printed.
3. After saving, copy the **Application ID** into `.env.local`:

   ```
   ENABLEBANKING_APP_ID=00000000-0000-0000-0000-000000000000
   ```

### Step 3 — connect

Restart the dev server → **Settings → Connections → Connect bank** → search
"Sparkasse Heidelberg" → you're redirected to the Sparkasse login where you
approve with your usual online-banking SCA → back in Ember, the first sync
starts automatically.

> Want to try it without a real bank first? Search **"Mock ASPSP"** in the
> connect dialog — Enable Banking's sandbox bank with fake data and no login.

**What Ember does with the data:**

- Balances + 90 days of transactions
- Automatic categorization (German merchant rules: REWE, Miete, Deutsche
  Bahn, …) and merchant cleanup
- Recurring-payment detection (subscriptions)
- Monthly cash flow, income vs expenses, insights — on the Finance page and
  the dashboard

**Rate limits:** PSD2 providers allow roughly **4 syncs per account per day**.
Ember therefore caches bank data locally and only refetches when you press
**Sync now**. Consent lasts **90 days**; after that, reconnect from the
Connections page.

> Other German banks work too — search any institution in the connect dialog.

---

## 4. AI (optional) — mail summaries & smart replies

Works with **either** provider — Ember uses whichever key is present
(Anthropic wins if both are set):

```
# Claude:   https://platform.claude.com → API keys
ANTHROPIC_API_KEY=sk-ant-...
# or ChatGPT: https://platform.openai.com → API keys
OPENAI_API_KEY=sk-proj-...
```

⚠️ Keys belong ONLY in `.env.local` (git-ignored) — never paste a real key
into this file or any other committed file.

With a key present, mail gets a **Summarize with AI** button and the reply
composer offers three **Smart replies**. Without one, those affordances simply
don't appear. Calls run server-side; the key is never sent to the browser.

---

## 4b. Cloud sync (optional) — your data on every device, live

Without this, Ember keeps all data on the current device. With it, your
tasks, events, notes, habits, goals, finance entries, contacts and settings
sync in **realtime** between every device you sign in on (the vault syncs too,
but only as its encrypted ciphertext — the cloud never sees your secrets;
OAuth/bank tokens never leave the device at all).

1. Create a free project at [supabase.com](https://supabase.com) (name/region
   don't matter, note the database password somewhere safe).
2. In the project: **SQL Editor → New query** → paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**. This creates one
   row-level-secured table — every query is automatically scoped to the
   signed-in user.
3. **Project Settings → API** → copy two values into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

   (The anon key is designed to be public — row-level security does the
   protecting.)
4. **One-time template tweak (for the iPhone app):** Supabase → your project →
   **Authentication → Emails → Magic Link template** → add this line to the
   email body, then save:

   ```html
   <p>Dein Anmelde-Code: {{ .Token }}</p>
   ```

   Why: on an iOS home-screen app, email links open in Safari — a separate
   world that the app can't see. Typing the 6-digit code inside the app works
   everywhere.
5. Restart → **Settings → Connections → Cloud Sync** → enter your email →
   click the **magic link** (desktop) or type the **6-digit code** from the
   same email (iPhone app). No password, ever. Repeat the sign-in on your
   other devices and they stay in sync automatically.

---

## 5. Hosting on Netlify (or any server host)

Everything works the same when hosted — you just swap `http://localhost:3000`
for your live `https://…` address in three places. All secrets go into
Netlify's env-var UI, **never** `.env.local` (that file stays on your machine).

### a) Deploy

1. Push the project to GitHub, then in Netlify: **Add new site → Import from
   GitHub** and pick the repo.
2. Netlify auto-detects Next.js and installs the official Next runtime — the
   server-side API routes (Google, bank, AI) run as serverless functions. No
   build config needed; leave the defaults.
3. Note your site URL, e.g. `https://ember-tom.netlify.app`.

### b) Set environment variables

Netlify → **Site configuration → Environment variables → Add**. Add the same
keys as `.env.local`, but:

| Variable | Value on Netlify |
|---|---|
| `NEXT_PUBLIC_APP_URL` | your site URL, e.g. `https://ember-tom.netlify.app` (no trailing slash) |
| `TOKEN_ENCRYPTION_KEY` | same random string as local |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | same as local |
| `ENABLEBANKING_APP_ID` | same as local |
| `ENABLEBANKING_PRIVATE_KEY` | **new** — the key as one base64 line (there's no file on Netlify). Generate it locally:<br>`node -e "console.log(require('fs').readFileSync('enablebanking_private.pem','base64'))"` and paste the output. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as local (optional — cloud sync) |
| `ANTHROPIC_API_KEY` | same as local (optional) |

Redeploy after adding them (Netlify → Deploys → Trigger deploy).

### c) Register the live redirect URLs

The redirect URLs you added for localhost won't match your live site, so add
the production ones **alongside** them (keep both — localhost for dev, Netlify
for live):

- **Google Cloud → Credentials → your OAuth client → Authorized redirect URIs
  → Add**:
  `https://ember-tom.netlify.app/api/google/callback`
- **Enable Banking → your app → Redirect URLs → Add**:
  `https://ember-tom.netlify.app/api/bank/callback`

That's it — open your Netlify URL, go to **Settings → Connections**, and
connect exactly as you would locally.

> One caveat that isn't Netlify-specific: while your Google consent screen is
> in "Testing" mode, Google expires the login after 7 days (see §2). Publish
> the consent screen once it works to make it permanent.

### Local production build (optional)

`npm run build && npm start` runs the same server-side routes on your own
machine over `http://localhost:3000`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Page freezes / cards stuck on "Checking…" **in dev mode** (`npm run dev`) | A DOM-modifying browser extension (VPN/ad-block/dark-mode, e.g. Browsec) clashes with Next.js's dev overlay. Open localhost in an **Incognito window** (extensions off) or disable the extension for localhost. Production builds (`npm run build && npm start`) are unaffected. |
| Gmail shows "google_api_error" right after connecting | Fresh Google Cloud projects have tight per-user rate limits — Ember retries automatically; press Sync now again after a few seconds. |
| "Not configured" on Connections page | Env var missing/typo — the card lists exactly which. Restart dev server after editing `.env.local`. |
| Google `redirect_uri_mismatch` | The redirect URI in Google Cloud must be byte-identical to `NEXT_PUBLIC_APP_URL` + `/api/google/callback`. |
| Google works, then breaks after a week | Consent screen is in Testing mode — see note in §2. |
| Bank sync says rate limit reached | PSD2 allows ~4 syncs/day — Ember's cache keeps working; try again later. |
| Bank link shows "not authorized" | You aborted at the bank — press Connect bank again. |
