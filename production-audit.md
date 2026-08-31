# Production Readiness & Deployment Audit

## Summary

The application has passed all 26/26 end-to-end tests. This audit identifies the gaps that must be closed before production deployment. Items are rated:

- 🔴 **Critical** — must fix before any public-facing deployment
- 🟡 **High** — must fix before taking real financial data
- 🟢 **Low** — good practice; fix when time allows

---

## 1. Production Configuration

### 1.1 Environment Variables ✅ Correct foundation, 🟡 Incomplete

**What's in place:**
- `dotenv/config` loaded as first import in `server/server.js`
- Startup guard exits on missing `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `TOKEN_SECRET`
- `PORT` reads from `process.env.PORT` with fallback to `5000`

**Gaps:**
- `server/.env` does not exist yet — the startup guard will `process.exit(1)` immediately on any deployment that forgets to inject env vars
- `TOKEN_SECRET` placeholder value in the template (`replace_with_a_64_char_random_hex_string`) is not production-safe — must be a real 64-char hex before deployment
- `NODE_ENV` is never set or read anywhere — Express does not enter production mode (compression, error message sanitisation) without `NODE_ENV=production`
- No `CORS_ORIGIN` env var exists — the CORS origin is hardcoded as wildcard (see §2.1)

**Required env vars for production:**
```
PORT=5000
NODE_ENV=production
ADMIN_USERNAME=<strong_username>
ADMIN_PASSWORD=<strong_password_min_16_chars>
TOKEN_SECRET=<64_char_hex_from_crypto_randomBytes>
TOKEN_EXPIRY_HOURS=8
CORS_ORIGIN=https://your-frontend-domain.com
DATABASE_PATH=/data/alliance_global.db
```

### 1.2 Database Path — 🔴 Critical for containerised deployment

`server/database.js` line 5:
```js
const DB_PATH = path.join(process.cwd(), 'alliance_global.db');
```

`process.cwd()` is the directory from which `node` was launched, not the server directory. This has worked locally because `node server.js` is run from inside `server/`. In a containerised or managed environment, `cwd` is unpredictable.

**Fix:** Replace with `path.join(__dirname, 'alliance_global.db')` and add a `DATABASE_PATH` env var override for persistent volume mounts in production.

### 1.3 Uploads Directory — 🟡 High for containerised deployment

Uploaded files land in `server/uploads/yieldmax/` and `server/uploads/loan/`. In any environment that does not provide a persistent volume (Render free tier, Railway ephemeral containers, Heroku dynos), uploaded files **will be lost on every redeploy or dyno restart**.

**Fix:** Add a `UPLOADS_DIR` env var that points to a persistent volume mount (e.g. `/data/uploads`). Pair with object storage migration (see §5 Action Plan).

---

## 2. Production Security

### 2.1 CORS — 🔴 Critical

`server/server.js` line 157:
```js
app.use(cors());
```

`cors()` with no options defaults to `Access-Control-Allow-Origin: *` — **any domain can make API requests**. This must be locked to the specific production frontend domain.

**Fix:**
```js
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 2.2 Security Headers (Helmet) — 🟡 High

No `helmet` middleware is installed. Without it, Express sends no security headers:
- Missing `X-Content-Type-Options: nosniff`
- Missing `X-Frame-Options: DENY`
- Missing `Content-Security-Policy`
- Missing `Strict-Transport-Security`
- Express `X-Powered-By: Express` header is exposed (fingerprinting vector)

**Fix:** Install `helmet` and add `app.use(helmet())` before all other middleware. This is a one-line change with a single npm install.

### 2.3 `/api/test` Route — 🟢 Low

```js
app.get('/api/test', (req, res) => {
    res.json({ message: "Hello from the Alliance Global backend control tower!" });
});
```

This route is open to the public with no auth. In production it reveals the server is Express-based and running. Should either be removed or gated behind `requireAuth`.

### 2.4 Legacy `/api/submit` Route — 🟡 High (data leak / console.log)

`server/server.js` lines 165–215: The legacy `/api/submit` route logs the **entire incoming request body** to stdout:
```js
console.log('--- Incoming Data for SQL Engine ---');
console.log(incomingData);
```

In production, this dumps applicant PII (names, emails, NIN, BVN) to server logs. This route is also dead code — no frontend calls it anymore (YIELDMAX was migrated to `/api/submit/yieldmax`). It should be removed entirely.

### 2.5 Uploaded Files Publicly Accessible — 🟡 High

`express.static` is not currently configured to serve `/uploads`, but the file paths are stored in the DB and returned in admin API responses. If `express.static` is added later without auth gating, **all uploaded documents become publicly accessible** by URL-guessing. The plan document notes this; it needs an explicit `requireAuth` guard on any `/uploads` static route before it's added.

### 2.6 Rate Limiting on `/api/admin/login` — 🔴 Critical

No rate limiting exists on the login route. An attacker can make unlimited `POST /api/admin/login` attempts — a pure brute-force vector against `ADMIN_PASSWORD`. At minimum, add `express-rate-limit` to throttle login attempts to ~5 per minute per IP.

### 2.7 Request Body Size Limit — 🟡 High

`express.json()` with no options defaults to a 100 KB body limit. For the inquiry route this is fine. However, there is no explicit `limit` set. For the multipart routes, multer handles the 5 MB file cap, but the text fields portion has no cap. Best practice is to set:
```js
app.use(express.json({ limit: '50kb' }));
```

### 2.8 `submissions.json` and `server/alliance_global.db` in Root — 🟡 High

The live database file `alliance_global.db` exists in **two locations**:
- `alliance_global.db` (project root — from original setup)
- `server/alliance_global.db` (server directory — active one)

This is a source of confusion and a deployment hazard. The root-level copy should be removed. Additionally, `server/submissions.json` (legacy JSON backup with one real applicant's PII) exists in the server directory with no protection.

---

## 3. Build & Process Management

### 3.1 `package.json` Scripts — 🔴 Critical (missing `start`)

Current `server/package.json` scripts block:
```json
"scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
}
```

There is **no `start` script**. Most hosting platforms (Render, Railway, Heroku) detect and run `npm start` to launch the application. Without it:
- Render will fail to start the service
- Railway will fail to detect the entry point
- PM2 ecosystem files have nothing to point at

**Required additions:**
```json
"scripts": {
    "start": "node server.js",
    "dev":   "node --watch server.js"
}
```

### 3.2 Node Version — 🟡 High (not pinned)

No `engines` field in `package.json`. `crypto.randomUUID()` requires Node ≥ 15.6.0. `Buffer.from(...).toString('base64url')` requires Node ≥ 16. The codebase requires **Node ≥ 18 LTS** (also required for the `fetch` API used in test scripts). Without pinning, a hosting provider might use Node 14 or 12.

**Fix — add to `package.json`:**
```json
"engines": { "node": ">=18.0.0" }
```

Also add a `.node-version` or `.nvmrc` file at the project root containing `18`.

### 3.3 PM2 Ecosystem File — 🟢 Low (nice-to-have)

No `ecosystem.config.js` exists. For VPS/DigitalOcean deployments, PM2 requires an ecosystem config to manage the process, auto-restart on crash, set `NODE_ENV`, and handle log rotation.

### 3.4 No Dockerfile — 🟢 Low

No `Dockerfile` exists. Not required for Render/Railway (they auto-detect Node apps) but required for DigitalOcean App Platform with Docker, or self-hosted container deployments.

---

## 4. Code Quality Gaps for Production

### 4.1 Duplicate `console.log` statements — 🟡 High

8 `console.log` calls exist in `server/server.js` (confirmed by grep). In production, row IDs and incoming data should not be logged at `info` level — they clutter managed log services and expose PII in log aggregators. The legacy route body dump (§2.4) is the most urgent.

### 4.2 `NODE_ENV` not used to conditionally silence logs — 🟢 Low

No logging library (Winston, Pino) is in use. Structured logging with log levels (`debug`/`info`/`warn`/`error`) would allow suppressing verbose output in production without changing code.

### 4.3 Duplicate comment lines — 🟢 Low

`server/server.js` lines 165–166 contain duplicate comment text (artefact from earlier edits):
```js
// 5. SUBMISSION ROUTE: Listens for incoming data and commits it permanently to disk
// 5. SUBMISSION ROUTE: Intercepts form data and saves it into the SQL database
```
Minor, but should be cleaned up.

---

## 5. Deployment Plan

### Target Platform Recommendation

| Platform | Fit for this app | SQLite support | File persistence | Free tier |
|---|---|---|---|---|
| **Railway** | ✅ Best fit | ✅ Persistent volume | ✅ Volume mounts | ✅ $5 credit |
| **Render** | ✅ Good | ⚠️ Disk resets on free tier | ⚠️ Paid plan for disk | ✅ Free tier |
| **DigitalOcean Droplet** | ✅ Full control | ✅ Persistent | ✅ Persistent | ❌ $6/month |
| **Heroku** | ⚠️ Ephemeral filesystem | ❌ DB lost on restart | ❌ No persistent FS | ❌ No free tier |

**Recommended: Railway** (persistent volume, $5 free credit, native Node detection).

---

### Step-by-Step Deployment Checklist

#### Phase 1 — Pre-Deployment Code Fixes (in order)

1. **Add `start` and `dev` scripts** to `server/package.json`
2. **Add `engines: { "node": ">=18.0.0" }** to `server/package.json`
3. **Fix `DB_PATH`** in `server/database.js` to use `__dirname` + `DATABASE_PATH` env var fallback
4. **Remove legacy `/api/submit` route** from `server/server.js` (eliminates PII console.log)
5. **Restrict CORS** to env-var-configured origin (remove wildcard `cors()`)
6. **Install `helmet`** (`npm install helmet --save` in `server/`) and add `app.use(helmet())` before all routes
7. **Install `express-rate-limit`** and add rate limiting to `POST /api/admin/login` (max 5 req/min per IP)
8. **Remove `/api/test` route** or gate it behind `requireAuth`
9. **Remove or archive** `server/submissions.json` (contains real PII) and root-level `alliance_global.db`

#### Phase 2 — Repository Setup

10. Create `.gitignore` (already defined in plan — must be done manually due to Bob ignore rules):
    ```
    server/.env
    server/uploads/
    server/alliance_global.db
    server/node_modules/
    node_modules/
    *.md
    ```
11. Initialise a git repository if not already: `git init && git add . && git commit -m "initial"`
12. Push to a GitHub/GitLab repository (required by Railway/Render for auto-deploy)

#### Phase 3 — Railway Deployment

13. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
14. Select the repository; Railway auto-detects Node.js
15. In Railway project settings → **Source Directory**: set to `server/` (the Express app root)
16. Add a **Volume** in Railway:
    - Mount path: `/data`
    - This is where the SQLite DB and uploads will persist across redeploys
17. Set all environment variables in Railway dashboard → Variables:
    ```
    NODE_ENV=production
    PORT=5000
    ADMIN_USERNAME=<strong_value>
    ADMIN_PASSWORD=<strong_value>
    TOKEN_SECRET=<64_char_hex>
    TOKEN_EXPIRY_HOURS=8
    CORS_ORIGIN=https://<your-frontend-domain>
    DATABASE_PATH=/data/alliance_global.db
    UPLOADS_DIR=/data/uploads
    ```
    Generate `TOKEN_SECRET` with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
18. Railway triggers the first deployment. Verify startup logs show:
    - `Server running smoothly with persistent database on port 5000`
    - All 4 table creation logs (no FATAL errors)
19. Test the live health check: `curl https://<railway-url>/api/test`

#### Phase 4 — Frontend Configuration

20. In `products.html` (YIELDMAX fetch handler) and `app.js` (inquiry handler), replace all `http://localhost:5000` URLs with the production Railway URL (or an env-configurable constant)
21. Deploy the static frontend files (`index.html`, `products.html`, `admin.html`, `app.js`, `assets/`) to a static host:
    - **Netlify / Vercel** (free, drag-and-drop static deployment)
    - Or serve them from the same Express app by adding `app.use(express.static(path.join(__dirname, '../')))` (serves the project root HTML files)
22. Update `CORS_ORIGIN` in Railway to match the Netlify/Vercel domain

#### Phase 5 — Post-Deployment Verification

23. Open `admin.html` in browser → sign in with production credentials → verify all three tabs load
24. Submit a test YIELDMAX application and verify the admin dashboard shows it with file links
25. Attempt `GET /api/admin/yieldmax` from browser devtools without a token → must return 401
26. Verify uploaded files persist across a forced redeploy (confirm Railway volume is working)
27. Check Railway logs for any unexpected `console.log` output or errors

---

## 6. Critical Fixes Summary (Priority Order)

| # | File | Fix | Severity |
|---|---|---|---|
| 1 | `server/package.json` | Add `"start": "node server.js"` and `"engines"` | 🔴 Critical |
| 2 | `server/server.js` | Restrict `cors()` to `CORS_ORIGIN` env var | 🔴 Critical |
| 3 | `server/server.js` | Add rate limiting to `/api/admin/login` | 🔴 Critical |
| 4 | `server/server.js` | Remove legacy `/api/submit` route (PII console.log) | 🔴 Critical |
| 5 | `server/database.js` | Fix `DB_PATH` to use `__dirname` + `DATABASE_PATH` env var | 🔴 Critical |
| 6 | `server/server.js` | Install and add `helmet()` middleware | 🟡 High |
| 7 | `server/package.json` | Set `NODE_ENV=production` in deploy environment | 🟡 High |
| 8 | `products.html` / `app.js` | Replace hardcoded `localhost:5000` with configurable API base URL | 🟡 High |
| 9 | `server/submissions.json` | Remove (contains real applicant PII) | 🟡 High |
| 10 | `server/server.js` | Remove or auth-gate `/api/test` route | 🟢 Low |
