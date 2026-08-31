# Git Initialization & Initial Commit — Phase 3 Plan

## Top-Level Overview

The project has never been version-controlled (`no .git` directory exists). Before the first commit
can be made, three preconditions must be satisfied:

1. **Ignore rules** — a root `.gitignore` and a populated `server/.gitignore` must exist so that
   secrets, databases, uploaded user files, and generated artifacts are never tracked.
2. **Syntax / runtime verification** — confirm `products.html` is structurally valid and the
   tab-switch fix is in place before the code is frozen into the initial commit.
3. **Git workflow** — initialize the repo, stage only clean source files, create the commit, and
   link to a remote origin (without pushing automatically).

No backend routes, database schema, or form logic are touched by this plan.

---

## Findings Summary (Pre-Flight Audit)

| Item | Status | Notes |
|------|--------|-------|
| `.git/` at root | ❌ Missing | Project is not a git repo yet |
| Root `.gitignore` | ❌ Missing | Must be created |
| `server/.gitignore` | ⚠️ Empty | Must be populated |
| `server/.env` keys | ✅ Confirmed | PORT, NODE_ENV, ADMIN_USERNAME, ADMIN_PASSWORD, TOKEN_SECRET, TOKEN_EXPIRY_HOURS, CORS_ORIGIN — values must stay out of VCS |
| `alliance_global.db` (root) | ⚠️ Must ignore | Live SQLite database |
| `server/alliance_global.db` | ⚠️ Must ignore | Server-side SQLite database |
| `server/node_modules/` | ⚠️ Must ignore | 100+ installed packages |
| `server/uploads/` | ⚠️ Must ignore | Contains real user-uploaded PDFs |
| `products.html` tab fix | ✅ Confirmed | onclick attributes removed, addEventListener wiring in place |
| `assets/images/logo.png` | ✅ Track | Static frontend asset |

---

## Sub-Tasks

---

### Sub-Task 1 — Create Root `.gitignore`

**Intent**
The project has no `.gitignore` at the root. Without one, `git add .` would stage the SQLite
databases, any OS artefacts, and editor config files into the initial commit. This task creates the
root-level ignore file covering all project-wide patterns.

**Expected Outcomes**
- A `.gitignore` file exists at the project root.
- `*.db` files are ignored project-wide.
- OS/editor noise (`*.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/`) is ignored.
- The file is committed as part of the initial commit.

**Todo List**
1. Create `/.gitignore` at the project root with the following content sections:
   - `# Databases` → `*.db`
   - `# OS & editor artefacts` → `.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/`
   - `# Env files (root-level guard)` → `.env`, `.env.*`

**Relevant Context**
- Root database file: `alliance_global.db`
- No `node_modules` at root (only in `server/`)

**Status**
[ ] pending

---

### Sub-Task 2 — Populate `server/.gitignore`

**Intent**
`server/.gitignore` exists but is empty. This sub-task adds all server-specific ignore patterns so
that secrets, installed packages, uploaded user files, and the server database never enter VCS.

**Expected Outcomes**
- `server/.env` is untracked (secrets stay local).
- `server/node_modules/` is untracked (100+ packages not committed).
- `server/uploads/` and all subdirectories are untracked (real user PDFs stay local).
- `server/alliance_global.db` is untracked (live database not committed).
- A `.gitkeep` placeholder is added inside `server/uploads/` so the directory structure is
  preserved in the repository without tracking any upload content.

**Todo List**
1. Populate `server/.gitignore` with:
   - `# Environment secrets` → `.env`, `.env.*`
   - `# Installed packages` → `node_modules/`
   - `# User-uploaded files` → `uploads/`
   - `# Server-side database` → `*.db`
2. Create `server/uploads/.gitkeep` (empty placeholder file) so the `uploads/` directory
   skeleton is present after a fresh clone without any user files.

**Relevant Context**
- `server/.env` keys: PORT, NODE_ENV, ADMIN_USERNAME, ADMIN_PASSWORD, TOKEN_SECRET,
  TOKEN_EXPIRY_HOURS, CORS_ORIGIN
- Upload subdirs in use: `server/uploads/loan/`, `server/uploads/yieldmax/`
- Real uploaded PDFs currently present — must NOT be committed

**Status**
[ ] pending

---

### Sub-Task 3 — Verify `products.html` Syntax & Tab-Fix

**Intent**
Before freezing code into the initial commit, confirm that the HTML is well-formed and the
tab-switching fix is exactly as intended: no `onclick` attributes remain on the tab buttons, and
both `addEventListener` wires are present in the script block.

**Expected Outcomes**
- `#btn-yieldmax` and `#btn-loan` have no `onclick` attribute.
- The inline `<script>` block contains `addEventListener` calls for both buttons.
- The `switchTab` function correctly toggles `hidden` on both panels and swaps button
  active/inactive class strings for both directions.
- The form submit listeners for `#yieldmaxForm` and `#loanForm` are intact and unchanged.

**Todo List**
1. Read `products.html` lines 49–60 — confirm no `onclick` on either button.
2. Read `products.html` lines 515–545 — confirm `addEventListener` wiring and `switchTab` logic.
3. Read `products.html` lines 545–605 — confirm form submit handlers are intact.
4. Report pass/fail on each check.

**Relevant Context**
- Fixed in previous session: `onclick` attributes removed, `addEventListener` added at lines 537–539
- CSP in `server/server.js` lines 176–186 blocks `script-src-attr` (inline event attrs)

**Status**
[ ] pending

---

### Sub-Task 4 — Git Initialization & Initial Commit (Terminal Commands)

**Intent**
Provide the exact, copy-pasteable terminal command sequence for: initializing the git repository,
verifying what will be staged, creating the initial commit, and linking to a remote GitHub
repository. No automatic push is performed.

**Expected Outcomes**
- Exact commands are documented and ready to run.
- The staging verification step (`git status` / `git diff --cached`) is included so the developer
  can confirm no secrets or databases appear in the diff before committing.
- The remote-linking command uses a placeholder `<GITHUB_REPO_URL>` that the developer replaces.

**Todo List**
1. Provide the command to initialize the git repository at the project root.
2. Provide the command to stage all files (`.gitignore` rules will automatically exclude secrets
   and databases).
3. Provide the command to verify what is staged (safety check before commit).
4. Provide the command to create the initial commit with a conventional commit message.
5. Provide the command to set the default branch name to `main`.
6. Provide the command to add the GitHub remote origin.
7. Provide the command to verify the remote was added correctly.
8. Clearly note that `git push` must be run manually by the developer after reviewing the staged
   output — it is NOT included in this plan.

**Relevant Context**
- PowerShell is the active shell (Windows 10, x64)
- Server runs on port 5000 (`server/.env` → PORT)
- No automated test suite configured (`server/package.json` test script is a no-op echo)

**Status**
[ ] pending

---

## Files to Be Created / Modified by This Plan

| File | Action | Reason |
|------|--------|--------|
| `.gitignore` | Create | Root-level ignore rules (missing) |
| `server/.gitignore` | Modify | Populate the currently empty file |
| `server/uploads/.gitkeep` | Create | Preserve uploads/ directory structure in VCS |

## Files That Must NEVER Appear in the Commit

| File | Reason |
|------|--------|
| `server/.env` | Contains ADMIN_PASSWORD, TOKEN_SECRET, and other secrets |
| `*.db` (both locations) | Live SQLite databases |
| `server/node_modules/` | Generated artefact, 100+ packages |
| `server/uploads/**` | Real user-uploaded PDFs |
