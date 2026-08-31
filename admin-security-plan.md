# Admin Dashboard Security & Multi-Table Plan

## Overview

`admin.html` is currently an open page — no login, no token, no session. Any visitor who knows the URL can read all applications and change their statuses. The three new data tables (`yieldmax_applications`, `loan_applications`, `inquiries`) are also invisible to the dashboard entirely.

This plan secures the admin surface with a stateless JWT token strategy (no extra npm packages — Node's built-in `crypto` module is sufficient for HMAC-SHA256 token signing) and extends both the API and the UI to cover all four tables.

**Files touched:** `server/server.js`, `server/database.js` (one new table), `admin.html`, `.env` (new file), `server/package.json` (one new dev-only dependency: `dotenv`)

---

## Auth Strategy Decision: Stateless Token over Session Cookies

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Session cookies + express-session | Familiar browser UX | Requires a session store (file or DB); adds a dependency | ❌ Overkill for a single-admin internal tool |
| JWT (jsonwebtoken) | Industry standard | Adds a dependency; RS256 requires key management | ❌ Unnecessary complexity |
| HMAC-SHA256 signed token (built-in crypto) | Zero new dependencies; fully auditable; stateless | Must implement sign/verify manually (20 lines) | ✅ Selected |
| Basic Auth header | Trivial to implement | Credentials visible in network logs on every request | ❌ Unsuitable |

**Selected approach:** A simple signed token using Node's built-in `crypto.createHmac('sha256', secret)`. The token encodes `{ sub: 'admin', exp: <unix timestamp> }` as a base64url payload with an HMAC signature appended. The token lives in `localStorage` on the client and is sent as a `Bearer` token in the `Authorization` header on all admin API requests. It expires after **8 hours**.

There is no need to install `jsonwebtoken` — the token structure is intentionally minimal and self-contained.

---

## Sub-Task 1 — Create `.env` and Install `dotenv`

**Status:** [ ] pending

### Intent
All secrets and admin credentials must come from environment variables, not hardcoded strings. `dotenv` loads a `.env` file into `process.env` at server startup. The `.env` file is never committed to version control.

### Expected Outcomes
- `server/.env` exists with required variables (never committed — add to `.gitignore`)
- `dotenv` is in `server/package.json` dependencies
- `server/server.js` loads env vars at startup and fails fast if required ones are missing

### `.env` File Contents
```
PORT=5000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_strong_password
TOKEN_SECRET=replace_with_a_64_char_random_hex_string
TOKEN_EXPIRY_HOURS=8
```

### Startup Guard (in `server/server.js`)
```js
const REQUIRED_ENV = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'TOKEN_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}
```
This prevents the server from running silently with empty credentials.

### `.gitignore` Addition
```
server/.env
server/uploads/
server/alliance_global.db
```

### Todo List
1. Add `"dotenv": "^16.0.0"` to `server/package.json` `dependencies`
2. Run `npm install` in `server/`
3. Create `server/.env` with the five variables above
4. Create or update `.gitignore` at the project root to exclude `server/.env`, `server/uploads/`, `server/alliance_global.db`
5. Add `import 'dotenv/config';` as the **first** import in `server/server.js`
6. Add the `REQUIRED_ENV` startup guard immediately after imports

### Relevant Context
- `server/server.js` line 1 — first import slot
- `server/package.json` lines 13–18 — `dependencies` block
- No `.env` or `.gitignore` exists anywhere in the project currently

---

## Sub-Task 2 — Implement Token Auth Utilities in `server/server.js`

**Status:** [ ] pending

### Intent
Add three pure functions — `signToken()`, `verifyToken()`, and `requireAuth` middleware — that handle the full auth lifecycle. No new npm packages.

### Expected Outcomes
- `POST /api/admin/login` accepts username + password, returns a signed token on success
- `requireAuth` middleware validates the `Authorization: Bearer <token>` header and rejects with `401` if missing, malformed, or expired
- All admin data/status routes are wrapped with `requireAuth`

### Token Format
```
base64url(payload) + '.' + base64url(hmac_signature)
```
Where `payload = JSON.stringify({ sub: 'admin', exp: Date.now() + hours * 3600000 })`.

Verification: re-compute the HMAC over the payload using the same secret; compare with the stored signature using `crypto.timingSafeEqual` to prevent timing attacks. Then check `exp > Date.now()`.

### Proposed Code Structure

```js
import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const TOKEN_EXPIRY_MS = (parseInt(process.env.TOKEN_EXPIRY_HOURS) || 8) * 3600 * 1000;

function b64url(str) {
    return Buffer.from(str).toString('base64url');
}

function signToken() {
    const payload = b64url(JSON.stringify({ sub: 'admin', exp: Date.now() + TOKEN_EXPIRY_MS }));
    const sig = b64url(createHmac('sha256', TOKEN_SECRET).update(payload).digest());
    return `${payload}.${sig}`;
}

function verifyToken(token) {
    if (!token || !token.includes('.')) return false;
    const [payload, sig] = token.split('.');
    const expected = b64url(createHmac('sha256', TOKEN_SECRET).update(payload).digest());
    try {
        if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    } catch {
        return false;  // buffers differ in length
    }
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Date.now() < exp;
}

function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !verifyToken(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    next();
}
```

### Login Route
```
POST /api/admin/login
Body: { username, password }
Response (200): { success: true, token: '...' }
Response (401): { success: false, message: 'Invalid credentials.' }
```

Credential comparison uses `crypto.timingSafeEqual` to prevent timing-based username/password enumeration.

### Todo List
1. Add `import { createHmac, timingSafeEqual } from 'crypto';` — extend the existing `import { randomUUID } from 'crypto'` line
2. Add `TOKEN_SECRET` and `TOKEN_EXPIRY_MS` constants after the `REQUIRED_ENV` guard
3. Implement `b64url()`, `signToken()`, `verifyToken()`, `requireAuth()` helper functions
4. Add `POST /api/admin/login` route (public — no auth required)
5. Wrap all three existing admin routes with `requireAuth`:
   - `GET /api/applications` → `app.get('/api/applications', requireAuth, ...)`
   - `PATCH /api/applications/:id` → `app.patch('/api/applications/:id', requireAuth, ...)`
   - New routes added in Sub-Task 3 will also include `requireAuth`

### Relevant Context
- `server/server.js` line 7 — `import { randomUUID } from 'crypto'` — extend this line
- `server/server.js` lines 369–393 — existing `GET /api/applications` and `PATCH /api/applications/:id` routes — add `requireAuth` as second argument

---

## Sub-Task 3 — New Admin API Endpoints

**Status:** [ ] pending

### Intent
The dashboard needs to read and update records from all three new tables. Add four new routes — one `GET` and one `PATCH` per new table — following the exact same patterns as the existing `applications` routes.

### New Routes

| Method | Route | Table | Auth |
|---|---|---|---|
| `GET` | `/api/admin/yieldmax` | `yieldmax_applications` | `requireAuth` |
| `PATCH` | `/api/admin/yieldmax/:id` | `yieldmax_applications` | `requireAuth` |
| `GET` | `/api/admin/loans` | `loan_applications` | `requireAuth` |
| `PATCH` | `/api/admin/loans/:id` | `loan_applications` | `requireAuth` |
| `GET` | `/api/admin/inquiries` | `inquiries` | `requireAuth` |

> `inquiries` has no `status` column — no PATCH route needed. If status tracking on inquiries is wanted in future, a `status` column can be added via migration.

### Column Selection per Route

**`GET /api/admin/yieldmax`** — returns all columns. File path columns (`passportPhotoPath`, `doc1FilePath`–`doc4FilePath`) are included so the UI can render download links.

**`GET /api/admin/loans`** — returns all columns. File path columns (`fileCacPath`, `fileNepaPath`, `fileNinPath`, `fileSupplementalPath`) included.

**`GET /api/admin/inquiries`** — returns all 6 columns (`id`, `submitted_at`, `fullName`, `email`, `inquiryType`, `message`).

All `GET` routes order by `id DESC` (newest first), consistent with the existing `applications` route.

### PATCH Route Behaviour
Identical to the existing `PATCH /api/applications/:id` — accepts `{ status }` in the body, updates the single matching row, returns `{ success: true }`.

### Todo List
1. After the existing `PATCH /api/applications/:id` route in `server/server.js`, add:
   - `GET /api/admin/yieldmax` with `requireAuth`
   - `PATCH /api/admin/yieldmax/:id` with `requireAuth`
   - `GET /api/admin/loans` with `requireAuth`
   - `PATCH /api/admin/loans/:id` with `requireAuth`
   - `GET /api/admin/inquiries` with `requireAuth`
2. Each route follows the `db.all` / `db.run` pattern already established in the codebase

### Relevant Context
- `server/server.js` lines 369–393 — existing admin routes as the exact reference pattern
- All five new routes are structurally identical to existing ones; `requireAuth` is the only new element

---

## Sub-Task 4 — Add `admin_sessions` Table for Token Revocation (Optional but Recommended)

**Status:** [ ] pending

### Intent
Stateless tokens cannot be invalidated server-side without a revocation list. This sub-task adds a lightweight `admin_sessions` table that records issued tokens (by hash) and a `revoked` flag. Logout sets `revoked = 1`. `requireAuth` queries this table as an additional check.

**This sub-task is optional for the first release but should not be skipped in production.** Without it, a stolen token remains valid until it expires (up to 8 hours).

### Schema
```sql
CREATE TABLE IF NOT EXISTS admin_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash  TEXT NOT NULL UNIQUE,
    issued_at   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    revoked     INTEGER DEFAULT 0
);
```

`token_hash` stores `SHA-256(raw_token)` — the token itself is never stored.

### New Route
```
POST /api/admin/logout   (requireAuth)
Body: none — reads token from Authorization header
Action: sets revoked = 1 for matching token_hash
```

### `requireAuth` Enhancement
After signature and expiry checks pass, query:
```sql
SELECT revoked FROM admin_sessions WHERE token_hash = ? LIMIT 1
```
If `revoked = 1` or no row found → return `401`.

### Todo List
1. Add `CREATE TABLE IF NOT EXISTS admin_sessions (...)` to `server/database.js` `db.serialize()` block
2. Update `signToken()` to also INSERT a row into `admin_sessions`
3. Update `verifyToken()` / `requireAuth` to check `revoked` flag in `admin_sessions`
4. Add `POST /api/admin/logout` route

### Relevant Context
- `server/database.js` lines 139–155 — `inquiries` table block — add the new table after it
- This sub-task can be deferred to a follow-up implementation cycle

---

## Sub-Task 5 — Rebuild `admin.html` with Login Gate and Multi-Table Tabs

**Status:** [ ] pending

### Intent
Replace the current unprotected single-table dashboard with:
1. A **login screen** shown when no valid token is in `localStorage`
2. A **three-tab interface** (YIELDMAX Applications / Loan Applications / General Inquiries) once authenticated
3. A **logout button** that clears the token from `localStorage` (and calls `POST /api/admin/logout` if Sub-Task 4 is implemented)
4. File download links in the YIELDMAX and Loan tabs wherever file paths exist in the DB row

### Page State Machine

```
Page load
  └─> Check localStorage for token
        ├─> Token missing or expired → show #loginPanel, hide #dashboardPanel
        └─> Token present and valid  → show #dashboardPanel, hide #loginPanel
                                        → load default tab (YIELDMAX)
```

### Login Panel Structure
```html
<section id="loginPanel">
  <form id="loginForm">
    <input name="username" type="text" ...>
    <input name="password" type="password" ...>
    <button type="submit">Sign In</button>
    <p id="loginError" class="hidden text-red-500">...</p>
  </form>
</section>
```

On submit: `POST /api/admin/login` with `{ username, password }` → on success store token in `localStorage.setItem('agc_admin_token', token)` → show dashboard. On failure: display error message in `#loginError`.

### Dashboard Panel Structure
```html
<section id="dashboardPanel" class="hidden">
  <!-- Tab switcher -->
  <div id="tabBar">
    <button data-tab="yieldmax">YIELDMAX Applications</button>
    <button data-tab="loans">Loan Applications</button>
    <button data-tab="inquiries">General Inquiries</button>
  </div>

  <!-- Tab panels -->
  <div id="tab-yieldmax">...</div>
  <div id="tab-loans" class="hidden">...</div>
  <div id="tab-inquiries" class="hidden">...</div>

  <!-- Logout -->
  <button id="logoutBtn">Sign Out</button>
</section>
```

### Column Layout per Tab

**YIELDMAX tab** — columns:
| Date | Client Name | Email | Phone | Amount (₦) | Tenure | Documents | Status |
All file path columns render as `<a href="/uploads/yieldmax/..." target="_blank">View</a>` links; `null` paths render as `—`.

**Loans tab** — columns:
| Date | Client Name | Email | Mobile | Loan Amount (₦) | Loan Type | Documents | Status |
File paths render as `<a href="/uploads/loan/..." target="_blank">View</a>` links.

**Inquiries tab** — columns (read-only, no status dropdown):
| Date | Full Name | Email | Inquiry Type | Message |

### All Fetch Calls Include the Token
```js
function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('agc_admin_token')}`
    };
}
```

On any `401` response from an admin endpoint → automatically clear token from `localStorage`, hide dashboard, show login panel (handles expired or revoked tokens gracefully).

### Logout Handler
```js
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('agc_admin_token');
    showLogin();
});
```

### Status Dropdown Behaviour
YIELDMAX and Loan tabs retain the existing `change`-event delegation pattern — the status dropdown fires a `PATCH` request to the corresponding endpoint (`/api/admin/yieldmax/:id` or `/api/admin/loans/:id`). The same colour-coding (green/red/neutral) applies.

### Todo List
1. Replace the entire `<body>` content of `admin.html` with the two-panel structure (login + dashboard)
2. Add `#loginPanel` HTML with the login form
3. Add `#dashboardPanel` HTML with three tab buttons and three `<div>` panels
4. Add the three column headers for each tab's `<table>`
5. Write the JavaScript module:
   - `checkAuth()` — reads localStorage token, decodes expiry from base64url payload, shows correct panel
   - `showLogin()` / `showDashboard()` — panel switchers
   - `authHeaders()` — returns headers object with Bearer token
   - `loadTab(tabName)` — fetches from the correct endpoint, renders rows
   - `renderYieldmaxRow(app)` — builds one `<tr>` for the YIELDMAX tab
   - `renderLoanRow(app)` — builds one `<tr>` for the Loans tab
   - `renderInquiryRow(app)` — builds one `<tr>` for the Inquiries tab
   - Login form submit handler
   - Tab button click handlers
   - Logout button click handler
   - Status `change` event delegation for YIELDMAX and Loan tables
6. Apply the same Tailwind styling conventions as the existing `admin.html`

### Relevant Context
- `admin.html` lines 61–159 — existing JS block; to be fully replaced
- `admin.html` lines 36–58 — existing table structure; to be replaced with the tabbed layout
- The existing `status-updater` class and colour-coding logic (lines 96–102) should be preserved and reused in the new YIELDMAX and Loans tables

---

## Dependency Order

```
Sub-Task 1 (dotenv + .env)
    └─> Sub-Task 2 (token auth utilities + login route)
            └─> Sub-Task 3 (new admin API routes)
                    └─> Sub-Task 5 (rebuild admin.html)
                            ^
Sub-Task 4 (token revocation table) — optional, can follow Sub-Task 5
```

Sub-Tasks 1 and 2 must be completed and validated before Sub-Task 3. Sub-Task 5 can begin once Sub-Task 3 routes are working.

---

## Security Controls Summary

| Control | Mechanism |
|---|---|
| Credential storage | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TOKEN_SECRET` in `server/.env` only |
| Password comparison | `crypto.timingSafeEqual` — prevents timing attacks |
| Token signing | HMAC-SHA256 with `TOKEN_SECRET` — no external library |
| Token transport | `Authorization: Bearer <token>` header — not a cookie, not a query param |
| Token storage (client) | `localStorage` — acceptable for an internal admin tool |
| Token expiry | Configurable via `TOKEN_EXPIRY_HOURS` env var; default 8 hours |
| Token revocation | Optional `admin_sessions` table (Sub-Task 4) |
| Credential leak prevention | `server/.env` excluded from version control via `.gitignore` |
| Missing env vars | Server exits on startup with a clear error message |
| File serving | `/uploads` static route exists but directory listing is disabled by default in `express.static` |

---

## Out of Scope

- **HTTPS/TLS** — should be enforced at the reverse proxy (nginx/Caddy) layer in production; out of scope here
- **Rate limiting on `/api/admin/login`** — brute-force protection; recommended as a follow-up
- **Multi-admin user support** — this plan is designed for a single admin account; a `users` table would be needed for multiple admins
- **Audit log** — recording which admin changed which application status; noted as a future enhancement
