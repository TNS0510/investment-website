# File Upload Implementation Plan

## Overview

Both `#yieldmaxForm` and `#loanForm` in `products.html` collect documents from applicants, but the current submission pipeline serialises payloads as `application/json` — browsers cannot include binary file data in JSON. Files are silently dropped today.

This plan integrates `multer` (the standard Node.js multipart middleware) to receive, validate, and persist uploaded files to disk. Saved file paths are then stored in the existing database rows alongside the text fields.

**Files touched:** `server/package.json`, `server/server.js`, `server/database.js`, `products.html`  
**New directory created at runtime:** `server/uploads/` (auto-created by multer on first run)

---

## File Input Inventory

### `#yieldmaxForm`

| `name` attribute | Label | Required |
|---|---|---|
| `passportPhoto` | Upload Passport Photo | ✅ Yes |
| `doc1File` | Vault Document 1 | ✅ Yes |
| `doc2File` | Vault Document 2 | ✅ Yes |
| `doc3File` | Vault Document 3 | ✅ Yes |
| `doc4File` | Vault Document 4 | ✅ Yes |

**Total: 5 file fields**

### `#loanForm`

| `name` attribute | Label | Required |
|---|---|---|
| `fileCac` | CAC Incorporation Documents | ✅ Yes |
| `fileNepa` | Recent Utility Bill (NEPA Bill) | ✅ Yes |
| `fileNin` | National Identity Slip (NIN Slip) | ✅ Yes |
| `fileSupplemental` | Supplemental Supporting Assets | No |

**Total: 4 file fields**

---

## Sub-Task 1 — Install `multer` and `uuid`

**Status:** [ ] pending

### Intent
`multer` is the de-facto Express multipart body parser. `uuid` generates collision-proof filenames. Neither is currently in `server/package.json`.

### Expected Outcomes
- `multer` and `uuid` appear in `server/package.json` `dependencies`
- `node_modules` inside `server/` contains both packages after `npm install`

### Todo List
1. In `server/package.json`, add to `dependencies`:
   ```json
   "multer": "^1.4.5-lts.2",
   "uuid": "^9.0.0"
   ```
   > Use `multer@1.4.5-lts.2` — this is the maintained LTS fork; the original `^1.4.4` has a known ReDoS vulnerability in filename handling.
2. Run `npm install` inside `server/`

### Relevant Context
- `server/package.json` line 13 — `dependencies` block
- `"type": "module"` is set — both `multer` and `uuid` support ES module `import` syntax

---

## Sub-Task 2 — Configure `multer` Storage and Security Rules in `server/server.js`

**Status:** [ ] pending

### Intent
Configure a single shared `multer` instance with:
- Disk storage to `server/uploads/` organised into per-form sub-directories
- A UUID-based filename strategy that prevents collisions and strips dangerous characters from original names
- Strict `fileFilter` rejecting any MIME type outside the allowed list
- A hard size cap of **5 MB per file**

### Expected Outcomes
- Uploading a PDF or image writes a file to `server/uploads/yieldmax/` or `server/uploads/loan/`
- Uploading an `.exe`, `.sh`, `.js`, or any non-whitelisted type returns HTTP 400 with `{ success: false, message: "..." }`
- A file exceeding 5 MB returns HTTP 400 with a clear error
- The original filename is never used directly on disk

### Storage Strategy

**Directory layout:**
```
server/
  uploads/
    yieldmax/      ← passport photos + vault docs
    loan/          ← CAC, NEPA, NIN, supplemental
```

**Filename strategy:**
```
{uuid-v4}-{timestamp}.{sanitised-extension}
```
Example: `f47ac10b-58cc-4372-a567-0e02b2c3d479-1721904000000.pdf`

Rationale:
- UUID prefix ensures global uniqueness
- Timestamp enables chronological sorting without querying the DB
- Extension is extracted from the original MIME type (not the filename) to prevent extension-spoofing

### Allowed MIME Types (whitelist)
```
image/jpeg, image/png, image/webp       ← passport photos
application/pdf                          ← all document types
image/tiff                               ← scanned documents
```

### Security Rules Summary
| Control | Value |
|---|---|
| Max file size | 5 MB (5 × 1024 × 1024 bytes) |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `image/tiff` |
| Filename on disk | UUID + timestamp + MIME-derived extension only |
| Path traversal | Prevented — `destination` is a hardcoded absolute path via `path.join(__dirname)` |
| Executable block | Any MIME not in whitelist → rejected before writing to disk |
| Directory auto-create | `multer` `destination` callback calls `fs.mkdirSync` with `{ recursive: true }` |

### Proposed Code Structure in `server/server.js`

```js
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'image/tiff'
]);

const MIME_TO_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'application/pdf': 'pdf', 'image/tiff': 'tif'
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function createStorage(subDir) {
    return multer.diskStorage({
        destination(req, file, cb) {
            const dir = path.join(__dirname, 'uploads', subDir);
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename(req, file, cb) {
            const ext = MIME_TO_EXT[file.mimetype] || 'bin';
            cb(null, `${uuidv4()}-${Date.now()}.${ext}`);
        }
    });
}

function fileFilter(req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
}

const uploadYieldmax = multer({
    storage: createStorage('yieldmax'),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
}).fields([
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'doc1File',      maxCount: 1 },
    { name: 'doc2File',      maxCount: 1 },
    { name: 'doc3File',      maxCount: 1 },
    { name: 'doc4File',      maxCount: 1 }
]);

const uploadLoan = multer({
    storage: createStorage('loan'),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
}).fields([
    { name: 'fileCac',          maxCount: 1 },
    { name: 'fileNepa',         maxCount: 1 },
    { name: 'fileNin',          maxCount: 1 },
    { name: 'fileSupplemental', maxCount: 1 }
]);
```

**Using `.fields()` instead of `.array()` or `.single()`:** Each file field has a distinct `name` — `.fields()` maps them exactly, putting each uploaded file under `req.files['fieldName'][0]` for safe, named access.

**Multer error handler wrapper:** Because `multer` throws synchronously on limit/filter failures, each route wraps the middleware in a small Promise helper to surface errors cleanly:
```js
function runMulter(middleware, req, res) {
    return new Promise((resolve, reject) => {
        middleware(req, res, (err) => err ? reject(err) : resolve());
    });
}
```

This lets the async route handler `await runMulter(uploadYieldmax, req, res)` and `catch` the multer error to return a proper 400 JSON response.

### Todo List
1. Add `import` statements for `multer`, `uuid`, `fs.mkdirSync`, and `url.fileURLToPath` to the top of `server/server.js`
2. Add `__dirname` shim (ES Module environments do not have `__dirname` natively)
3. Define `ALLOWED_MIME_TYPES`, `MIME_TO_EXT`, `MAX_FILE_SIZE` constants
4. Implement `createStorage(subDir)`, `fileFilter`, `runMulter()` helpers
5. Instantiate `uploadYieldmax` and `uploadLoan` multer middleware objects using `.fields()`

### Relevant Context
- `server/server.js` lines 1–17 — existing imports and middleware; new imports go here
- `"type": "module"` in `server/package.json` means `__dirname` is not available natively — must be derived from `import.meta.url`
- `app.use(express.json())` at line 17 must remain for the other routes; `multer` handles `multipart/form-data` separately — the two do not conflict

---

## Sub-Task 3 — Add File Path Columns to the Database Schema

**Status:** [ ] pending

### Intent
The existing `yieldmax_applications` and `loan_applications` tables have no columns to store file paths. SQLite's `ALTER TABLE … ADD COLUMN` adds columns to a live table non-destructively — no existing rows are affected and the new columns default to `NULL`.

### Expected Outcomes
- `yieldmax_applications` gains 5 new `TEXT` columns for file paths
- `loan_applications` gains 4 new `TEXT` columns for file paths
- Existing rows are untouched (new columns default to `NULL`)
- `CREATE TABLE IF NOT EXISTS` blocks for future fresh installs include the columns from the start

### Proposed Schema Additions

**`yieldmax_applications` — 5 new columns:**
```sql
passportPhotoPath   TEXT,
doc1FilePath        TEXT,
doc2FilePath        TEXT,
doc3FilePath        TEXT,
doc4FilePath        TEXT,
```

**`loan_applications` — 4 new columns:**
```sql
fileCacPath         TEXT,
fileNepaPath        TEXT,
fileNinPath         TEXT,
fileSupplementalPath TEXT,
```

### Migration Approach
Because the tables already exist in the live database (`server/alliance_global.db`), `CREATE TABLE IF NOT EXISTS` will not re-run the `CREATE` statement with the new columns. Two complementary changes are needed:

1. **Update the `CREATE TABLE IF NOT EXISTS` block** in `server/database.js` to include the new columns — this handles fresh installations.
2. **Add `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements** in the `db.serialize()` block immediately after each `CREATE TABLE` run — this migrates the live database on the next server start. SQLite 3.35.0+ supports `IF NOT EXISTS` on `ALTER TABLE ADD COLUMN`; for older SQLite, wrap in a `db.run` that ignores `SQLITE_ERROR` (duplicate column).

### Implementation Strategy for `database.js`
After each existing `CREATE TABLE IF NOT EXISTS` call, add a `db.run` series of `ALTER TABLE`:
```js
// After yieldmax CREATE TABLE:
const yieldmaxFileCols = [
    'passportPhotoPath', 'doc1FilePath', 'doc2FilePath', 'doc3FilePath', 'doc4FilePath'
];
yieldmaxFileCols.forEach(col => {
    db.run(`ALTER TABLE yieldmax_applications ADD COLUMN ${col} TEXT`, (err) => {
        // Ignore "duplicate column" errors — means column already exists
        if (err && !err.message.includes('duplicate column')) {
            console.error(`Migration error adding ${col}:`, err.message);
        }
    });
});

// After loan CREATE TABLE:
const loanFileCols = [
    'fileCacPath', 'fileNepaPath', 'fileNinPath', 'fileSupplementalPath'
];
loanFileCols.forEach(col => {
    db.run(`ALTER TABLE loan_applications ADD COLUMN ${col} TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error(`Migration error adding ${col}:`, err.message);
        }
    });
});
```

### Todo List
1. Open `server/database.js`
2. Add the 5 new columns to the `CREATE TABLE IF NOT EXISTS yieldmax_applications` block
3. Add the 4 new columns to the `CREATE TABLE IF NOT EXISTS loan_applications` block
4. Add the `ALTER TABLE … ADD COLUMN` migration loops after each respective `CREATE TABLE` call
5. No changes to `inquiries` or `applications` tables

### Relevant Context
- `server/database.js` lines 42–82 — `yieldmax_applications` CREATE block
- `server/database.js` lines 84–120 — `loan_applications` CREATE block
- `server/alliance_global.db` is a live file; `ALTER TABLE IF NOT EXISTS` protects it

---

## Sub-Task 4 — Update the API Routes to Store File Paths

**Status:** [ ] pending

### Intent
The two existing submission routes (`/api/submit/yieldmax` and `/api/submit/loan`) currently read only `req.body`. After adding multer as route-level middleware, `req.files` will contain the uploaded file metadata. The routes must extract paths from `req.files` and include them in the SQL INSERT.

### Expected Outcomes
- `POST /api/submit/yieldmax` uses `uploadYieldmax` middleware, extracts file paths from `req.files`, and inserts them alongside text fields
- `POST /api/submit/loan` uses `uploadLoan` middleware, extracts file paths from `req.files`, and inserts them alongside text fields
- If a required file is missing or fails validation, the route returns HTTP 400 with a descriptive JSON error — no partial DB write occurs
- File paths stored are **relative to the server root** (e.g. `uploads/yieldmax/uuid-timestamp.pdf`) not absolute OS paths

### File Path Extraction Pattern

```js
// Helper — safely extract the relative path of an uploaded file
function filePath(req, fieldName) {
    const file = req.files?.[fieldName]?.[0];
    if (!file) return null;
    // Store relative path: "uploads/yieldmax/uuid.pdf"
    return path.relative(path.join(__dirname), file.path).replace(/\\/g, '/');
}
```

### Route Changes

**`/api/submit/yieldmax`:**
- Replace `app.post(...)` with `app.post(..., async (req, res) => { ... })`
- Before accessing `req.body`, `await runMulter(uploadYieldmax, req, res)` inside a try/catch
- Catch block checks `err.code === 'LIMIT_FILE_SIZE'` → 400, `err.message.includes('not allowed')` → 400, otherwise 500
- Add 5 new params to the SQL INSERT and the params array:
  ```
  passportPhotoPath, doc1FilePath, doc2FilePath, doc3FilePath, doc4FilePath
  ```
- SQL column list grows from 29 → 34; `?` count grows from 29 → 34; params array grows from 29 → 34

**`/api/submit/loan`:**
- Same async/await + runMulter pattern with `uploadLoan`
- Add 4 new params:
  ```
  fileCacPath, fileNepaPath, fileNinPath, fileSupplementalPath
  ```
- SQL column list grows from 24 → 28; `?` count 24 → 28; params 24 → 28

### Todo List
1. Add `filePath()` helper function near the other helpers at the top of `server/server.js`
2. Convert `/api/submit/yieldmax` to `async` and insert `await runMulter(uploadYieldmax, req, res)` as the first statement
3. Add multer error handling in the catch block for YIELDMAX route
4. Extend the YIELDMAX SQL INSERT column list and VALUES placeholders by 5
5. Extend the YIELDMAX params array by 5 `filePath(req, 'fieldName')` calls
6. Repeat steps 2–5 for `/api/submit/loan` with `uploadLoan` and its 4 file fields

### Relevant Context
- `server/server.js` lines 76–146 — YIELDMAX route (current)
- `server/server.js` lines 148–213 — Loan route (current)
- `req.body` is populated by multer when using `multipart/form-data` — `express.json()` middleware does NOT process multipart; after adding multer, `req.body` still contains all text fields from the form (multer populates both `req.body` and `req.files`)

---

## Sub-Task 5 — Update Frontend Submission Handlers in `products.html`

**Status:** [ ] pending

### Intent
Both form handlers currently use `Object.fromEntries(formData.entries())` + `JSON.stringify()`. This pipeline strips file objects — `FormData.entries()` includes files but `JSON.stringify` cannot serialise `File` objects and silently omits them. The fix is to send the raw `FormData` object directly as the `fetch` body, removing `Content-Type` from the headers so the browser sets `multipart/form-data` with the correct boundary automatically.

### Expected Outcomes
- YIELDMAX form submission sends `multipart/form-data` with both text and file fields
- Loan form submission sends `multipart/form-data` with both text and file fields
- Progress/loading state is shown while large files upload (optional UX improvement)
- Inquiry form (`app.js`) is unaffected — it has no file fields and continues sending JSON

### Change Per Handler

**Before (current — both handlers):**
```js
const formData = new FormData(form);
const payload = Object.fromEntries(formData.entries());  // ← strips files

fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },     // ← wrong content type
    body: JSON.stringify(payload)                         // ← files lost here
})
```

**After:**
```js
const formData = new FormData(form);   // ← keep raw FormData, do NOT call .entries()

fetch(url, {
    method: 'POST',
    // NO Content-Type header — browser sets multipart/form-data + boundary automatically
    body: formData
})
```

**Two-line change per handler.** No other logic changes.

### Todo List
1. Open `products.html`, find the YIELDMAX submit handler (~line 544)
2. Remove the `const payload = Object.fromEntries(formData.entries())` line
3. Remove `headers: { 'Content-Type': 'application/json' }` from the YIELDMAX `fetch()` call
4. Change `body: JSON.stringify(payload)` → `body: formData`
5. Update the success alert to use `formData.get('surname')` instead of `payload.surname` (or remove the name reference from the alert)
6. Repeat steps 2–5 for the Loan form handler (~line 575)

### Relevant Context
- `products.html` lines 544–565 — YIELDMAX submit handler
- `products.html` lines 575–596 — Loan submit handler
- `app.js` — inquiry form handler; no changes needed (no file fields)
- **Do not set `Content-Type` manually** when sending `FormData` — the browser must set it with the correct multipart boundary string; manually setting it will break the boundary and multer will not parse the request

---

## Sub-Task 6 — Serve Uploaded Files as Static Assets

**Status:** [ ] pending

### Intent
Once files are on disk, they need to be accessible for the admin dashboard to display or download them. Express can serve them as static files with a single middleware line. This must be scoped to prevent serving other server internals.

### Expected Outcomes
- A file at `server/uploads/yieldmax/some-uuid.pdf` is accessible at `http://localhost:5000/uploads/yieldmax/some-uuid.pdf`
- Only the `uploads/` subdirectory is served — `server.js`, `database.js`, etc. are not reachable via HTTP
- The static middleware is added after the existing `app.use(cors())` and `app.use(express.json())` lines

### Proposed Change

```js
// Serve uploaded documents as static assets
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));
```

### Todo List
1. Open `server/server.js`, locate the middleware block (~line 15–17)
2. Add the `UPLOADS_DIR` constant and `app.use('/uploads', express.static(...))` line after `app.use(express.json())`

### Relevant Context
- `server/server.js` line 17 — `app.use(express.json())` is the last middleware line currently

---

## Dependency Order

```
Sub-Task 1 (npm install multer + uuid)
    └─> Sub-Task 2 (configure multer middleware)  — requires packages
            ├─> Sub-Task 3 (DB schema: add file path columns)  — independent, can run in parallel with Sub-Task 2
            └─> Sub-Task 4 (update routes to store paths)      — requires Sub-Task 2 + Sub-Task 3
                    └─> Sub-Task 5 (update frontend to send FormData)  — requires Sub-Task 4 (routes must accept multipart)
                            └─> Sub-Task 6 (serve static uploads)  — can run alongside Sub-Task 5
```

Sub-Tasks 2 and 3 can be implemented in the same session. Sub-Task 5 and 6 can be implemented together.

---

## Out of Scope

- **Virus/malware scanning** — integration of ClamAV or similar; noted as a future hardening step
- **Cloud storage** (AWS S3, Cloudinary) — current plan uses local disk; migration path is to swap the `multer.diskStorage` for `multer-s3` without touching the route logic
- **Admin dashboard file download UI** — static serving in Sub-Task 6 enables file access; UI changes to `admin.html` are a separate plan
- **File deletion** on application rejection — out of scope for initial implementation
