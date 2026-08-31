# Data Persistence Layer — Implementation Plan

## Overview

The investment website has three forms that currently fail to persist data end-to-end:

1. **YIELDMAX form** (`products.html` `#yieldmaxForm`) — submits JSON to `/api/submit` but only 5 of ~25 collected fields have `name` attributes, so `FormData` silently drops the rest.
2. **Loan Desk form** (`products.html` `#loanForm`) — every input lacks a `name` attribute; `FormData` collects nothing; submission is intercepted with `console.log` only, never sent to the backend.
3. **Homepage inquiry form** (`index.html` `#inquiryForm`) — all inputs lack `name` attributes; `app.js` reads values by positional DOM query and then `console.log`s them — no API call is made.

The fix requires four coordinated changes:
- Add `name` attributes to every form field in `products.html` and `index.html`
- Expand the SQLite schema in `server/database.js` with two tables: `yieldmax_applications` and `loan_applications`, plus a lightweight `inquiries` table
- Update `server/server.js` to accept and store the full payloads via dedicated routes
- Update `app.js` to send the inquiry form data to the backend

This plan covers text/JSON fields only. File upload handling (multer, disk storage) is a separate concern and is noted but not in scope here.

---

## Sub-Task 1 — Add `name` Attributes to All Form Fields in `products.html`

**Status:** [ ] pending

### Intent
`FormData` only captures inputs that have a `name` attribute. Without names, every field is invisible to both `FormData` serialisation and standard form submission. This is the root cause of all data loss. Adding `name` attributes is a pure HTML change with zero logic risk.

### Expected Outcomes
- Every input, select, and textarea in `#yieldmaxForm` and `#loanForm` is capturable by `new FormData(form)`
- `Object.fromEntries(formData.entries())` produces a complete object with all field values
- No behavioural or visual change to the page

### Todo List
1. Open `products.html`
2. For `#yieldmaxForm`, add the following `name` attributes to the fields that are currently missing them (fields that already have names are marked ✓):

   **Personal Information block:**
   | Field Label | Proposed `name` value | Already has name? |
   |---|---|---|
   | Title | `title` | ✓ |
   | Surname | `surname` | ✓ |
   | First Name | `firstname` | ✓ |
   | Other Name | `othername` | ✓ |
   | Gender | `gender` | ✗ — add |
   | Date of Birth | `dob` | ✗ — add |
   | Phone number | `phone` | ✗ — add |
   | Email | `email` | ✓ |
   | Contact Address | `address` | ✗ — add |
   | NIN | `nin` | ✗ — add |
   | BVN | `bvn` | ✗ — add |
   | Upload Passport Photo | `passport_photo` | ✗ — add |

   **Next of Kin block:**
   | Field Label | Proposed `name` value | Already has name? |
   |---|---|---|
   | Surname | `nextofkin_surname` | ✓ |
   | First Name | `nextofkin_firstname` | ✓ |
   | Other Name | `nextofkin_othername` | ✓ |
   | Phone | `nextofkin_phone` | ✗ — add |
   | Relationship | `nextofkin_relationship` | ✗ — add |
   | Contact Address | `nextofkin_address` | ✗ — add |

   **YIELDINVEST Details block:**
   | Field Label | Proposed `name` value |
   |---|---|
   | Start Date | `invest_start_date` |
   | Account Name | `bank_account_name` |
   | Tenure | `invest_tenure` |
   | Account No | `bank_account_number` |
   | Amount (₦) | `invest_amount` |
   | Source of Funds | `source_of_funds` |
   | Bank Name | `bank_name` |

   **Verification Vault (4 document pairs):**
   | Slot | Text field `name` | File field `name` |
   |---|---|---|
   | 1 | `doc1_label` | `doc1_file` |
   | 2 | `doc2_label` | `doc2_file` |
   | 3 | `doc3_label` | `doc3_file` |
   | 4 | `doc4_label` | `doc4_file` |

3. For `#loanForm`, add `name` attributes to every field (none currently exist):

   **Loan Config Selector:**
   | Field Label | Proposed `name` value |
   |---|---|
   | Loan Type | `loan_type` |

   **Personal Information block:**
   | Field Label | Proposed `name` value |
   |---|---|
   | Surname | `surname` |
   | Middle Name | `middlename` |
   | First Name | `firstname` |
   | Email | `email` |
   | Gender | `gender` |
   | BVN | `bvn` |
   | NIN | `nin` |

   **Contact Details block:**
   | Field Label | Proposed `name` value |
   |---|---|
   | Home Address | `home_address` |
   | Home Telephone | `home_telephone` |
   | Mobile number | `mobile` |

   **Professional Details block:**
   | Field Label | Proposed `name` value |
   |---|---|
   | Place of Work | `employer` |
   | Position Held | `job_title` |
   | Are you confirmed? | `employment_status` |

   **Next of Kin block:**
   | Field Label | Proposed `name` value |
   |---|---|
   | First Name | `nextofkin_firstname` |
   | Last Name | `nextofkin_lastname` |
   | Relationship | `nextofkin_relationship` |
   | Phone | `nextofkin_phone` |
   | Address | `nextofkin_address` |

   **Transaction Information block:**
   | Field Label | Proposed `name` value |
   |---|---|
   | Amount | `loan_amount` |
   | Date | `loan_date` |
   | Net Monthly Income | `monthly_income` |
   | Purpose | `loan_purpose` |

   **Facility Verification Attachments (4 file inputs):**
   | Document | Proposed `name` value |
   |---|---|
   | CAC Incorporation Documents | `file_cac` |
   | Recent Utility Bill (NEPA Bill) | `file_nepa` |
   | National Identity Slip (NIN Slip) | `file_nin` |
   | Supplemental Supporting Assets | `file_supplemental` |

4. For `index.html` `#inquiryForm`, add `name` attributes:
   | Field | Proposed `name` value |
   |---|---|
   | Full Name | `fullname` |
   | Email Address | `email` |
   | Inquiry Type | `inquiry_type` |
   | Message / Requirements | `message` |

### Relevant Context
- `products.html` lines 98–288 (YIELDMAX form)
- `products.html` lines 325–508 (Loan Desk form)
- `index.html` lines 245–274 (inquiry form)
- The YIELDMAX submit handler at `products.html:545` uses `new FormData(yieldmaxForm)` — once name attributes exist, this will automatically pick up all values
- The Loan submit handler at `products.html:573` uses `new FormData(this)` — same pattern; will work once names are added

---

## Sub-Task 2 — Expand the Database Schema in `server/database.js`

**Status:** [ ] pending

### Intent
The current `applications` table has 10 columns and stores only names and email. All other fields are silently discarded on INSERT. We need a schema that matches the full data contracts of both forms and the inquiry form. Rather than cramming everything into one table (which would create many NULL columns per row type), we create three focused tables.

### Expected Outcomes
- `yieldmax_applications` table holds all YIELDMAX investment form data
- `loan_applications` table holds all Loan Desk form data
- `inquiries` table holds homepage inquiry submissions
- Existing `applications` table is left untouched to avoid data loss on the live record

### Proposed Schema

**Table: `yieldmax_applications`**
```sql
CREATE TABLE IF NOT EXISTS yieldmax_applications (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at          TEXT NOT NULL,
    -- Personal
    title                 TEXT,
    surname               TEXT,
    firstname             TEXT,
    othername             TEXT,
    gender                TEXT,
    dob                   TEXT,
    phone                 TEXT,
    email                 TEXT,
    address               TEXT,
    nin                   TEXT,
    bvn                   TEXT,
    -- Next of Kin
    nextofkin_surname     TEXT,
    nextofkin_firstname   TEXT,
    nextofkin_othername   TEXT,
    nextofkin_phone       TEXT,
    nextofkin_relationship TEXT,
    nextofkin_address     TEXT,
    -- Investment Details
    invest_start_date     TEXT,
    invest_tenure         TEXT,
    invest_amount         REAL,
    source_of_funds       TEXT,
    bank_name             TEXT,
    bank_account_name     TEXT,
    bank_account_number   TEXT,
    -- Document Labels (file paths stored separately when file upload is implemented)
    doc1_label            TEXT,
    doc2_label            TEXT,
    doc3_label            TEXT,
    doc4_label            TEXT,
    -- Workflow
    status                TEXT DEFAULT 'Pending'
);
```

**Table: `loan_applications`**
```sql
CREATE TABLE IF NOT EXISTS loan_applications (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at          TEXT NOT NULL,
    -- Loan Config
    loan_type             TEXT,
    -- Personal
    surname               TEXT,
    middlename            TEXT,
    firstname             TEXT,
    email                 TEXT,
    gender                TEXT,
    bvn                   TEXT,
    nin                   TEXT,
    -- Contact
    home_address          TEXT,
    home_telephone        TEXT,
    mobile                TEXT,
    -- Professional
    employer              TEXT,
    job_title             TEXT,
    employment_status     TEXT,
    -- Next of Kin
    nextofkin_firstname   TEXT,
    nextofkin_lastname    TEXT,
    nextofkin_relationship TEXT,
    nextofkin_phone       TEXT,
    nextofkin_address     TEXT,
    -- Transaction
    loan_amount           REAL,
    loan_date             TEXT,
    monthly_income        REAL,
    loan_purpose          TEXT,
    -- Workflow
    status                TEXT DEFAULT 'Pending'
);
```

**Table: `inquiries`**
```sql
CREATE TABLE IF NOT EXISTS inquiries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at TEXT NOT NULL,
    fullname     TEXT,
    email        TEXT,
    inquiry_type TEXT,
    message      TEXT
);
```

### Todo List
1. Open `server/database.js`
2. Inside the existing `db.serialize()` block, add three new `db.run(CREATE TABLE IF NOT EXISTS ...)` calls for the three tables above
3. Do NOT remove or alter the existing `applications` table — there is a live record in the database

### Relevant Context
- `server/database.js` lines 17–40 (existing serialize block)
- `server/alliance_global.db` contains 1 live row in `applications` — leave that table intact
- SQLite `CREATE TABLE IF NOT EXISTS` is safe to run on restart; it is a no-op if the table already exists

---

## Sub-Task 3 — Add API Routes in `server/server.js`

**Status:** [ ] pending

### Intent
The current `/api/submit` route only writes 9 columns from the YIELDMAX form and nothing from the Loan Desk or Inquiry form. We need three dedicated routes — one per form — that each INSERT the full payload into the correct table.

### Expected Outcomes
- `POST /api/submit/yieldmax` inserts a complete row into `yieldmax_applications`
- `POST /api/submit/loan` inserts a complete row into `loan_applications`
- `POST /api/submit/inquiry` inserts a row into `inquiries`
- Each route returns `{ success: true, id: <lastID> }` on success
- The existing `POST /api/submit` route is left intact (it may still receive legacy requests)

### Proposed Route Logic

**`POST /api/submit/yieldmax`** — extract every named field from `req.body`, map to the `yieldmax_applications` column list, execute parameterized INSERT, return `lastID`.

**`POST /api/submit/loan`** — same pattern for `loan_applications`.

**`POST /api/submit/inquiry`** — same pattern for `inquiries`.

All three routes follow the same guard pattern as the existing route:
- Wrap in try/catch
- Use parameterized `?` placeholders (already in use — no SQL injection risk)
- `db.run(sql, params, function(err) { ... })` callback using `this.lastID`

### Todo List
1. Open `server/server.js`
2. After the existing `POST /api/submit` route (line 74), add the three new routes
3. Each route destructures `req.body` with fallback to `null` for optional fields
4. No changes to existing routes

### Relevant Context
- `server/server.js` lines 26–74 (existing `/api/submit` as a reference pattern to follow)
- `server/server.js` line 17 — `app.use(express.json())` is already configured; JSON body parsing works
- The Loan Desk form will be changed to send to `/api/submit/loan` in Sub-Task 4

---

## Sub-Task 4 — Wire Frontend Submission in `products.html` and `app.js`

**Status:** [ ] pending

### Intent
After Sub-Tasks 1–3 are complete, all field data is capturable and the routes exist. The final step connects the frontend submission handlers to the correct endpoints.

### Expected Outcomes
- YIELDMAX form submits JSON to `/api/submit/yieldmax`
- Loan Desk form submits JSON to `/api/submit/loan` (replacing the current `console.log`-only handler)
- Homepage inquiry form submits JSON to `/api/submit/inquiry` (replacing the current `alert`-only handler in `app.js`)
- All three show a user-facing success or error message after submission

### Required Frontend Changes

**`products.html` — YIELDMAX submit handler (lines 538–566):**
- Change fetch URL from `http://localhost:5000/api/submit` → `http://localhost:5000/api/submit/yieldmax`
- No other changes needed (FormData + `Object.fromEntries` pattern is correct)

**`products.html` — Loan Desk submit handler (lines 569–580):**
- Replace the current `console.log` + `alert` body with a `fetch` call to `http://localhost:5000/api/submit/loan`
- Follow the identical pattern used by the YIELDMAX handler

**`app.js` — Inquiry form handler:**
- Replace the current `console.log` at line 21 with a `fetch` POST to `http://localhost:5000/api/submit/inquiry`
- Build the request body from the three values already being read: `clientName`, `clientEmail`, `inquiryType`
- Also capture the `message` textarea value (currently not read at all — add a 4th querySelector)
- Keep the existing `alert` as the success message; add a catch block for network errors

### Todo List
1. Open `products.html`, find the YIELDMAX submit handler (~line 549) and update the URL
2. Open `products.html`, find the Loan submit handler (~line 569–580) and replace with a proper fetch
3. Open `app.js` and replace lines 16–21 with a fetch call to `/api/submit/inquiry`

### Relevant Context
- `products.html` lines 538–566 (YIELDMAX fetch handler — use as template for Loan)
- `products.html` lines 569–580 (Loan handler — currently broken, full replacement needed)
- `app.js` lines 16–21 (inquiry handler — read 3 DOM values then console.log; needs fetch added)
- Note: `index.html` inquiry form inputs have no `name` attributes (fixed in Sub-Task 1), so `app.js` continues to read values via `querySelector` rather than `FormData` — this is acceptable for a 4-field form

---

## Dependency Order

```
Sub-Task 1 (name attributes)
    └─> Sub-Task 2 (schema) — can run in parallel with Sub-Task 1
            └─> Sub-Task 3 (API routes) — requires schema to exist
                    └─> Sub-Task 4 (frontend wiring) — requires routes to exist
```

Sub-Tasks 1 and 2 are independent and can be implemented simultaneously.

---

## Out of Scope (Separate Plan Needed)

- **File upload handling** — requires `multer` middleware, `uploads/` directory, and storing file paths in the DB. The `name` attributes added in Sub-Task 1 (`passport_photo`, `doc1_file`…`doc4_file`, `file_cac`, etc.) will be in place but the files themselves will not be stored until a file upload plan is executed.
- **Admin dashboard columns** — `admin.html` renders a fixed set of columns; once new tables exist, the admin view will need a tab or separate page to view yieldmax/loan/inquiry records.
- **Environment variables** — hardcoded `localhost:5000` URLs are a known gap addressed in the environment config plan.
- **Input validation** — server-side validation middleware is a separate security task.
