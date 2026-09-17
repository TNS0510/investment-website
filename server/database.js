/**
 * database.js
 *
 * Attempts to load better-sqlite3 (native, fast). If native bindings fail to
 * compile or load (e.g. no Visual Studio C++ Build Tools on Windows), it falls
 * back transparently to sql.js — a pure-JavaScript / WebAssembly port of SQLite
 * that requires no native compilation and works on every platform.
 *
 * The exported `db` object exposes the same synchronous better-sqlite3 surface
 * used by server.js:  db.prepare(sql).run(...params)  /  .all()  /  .get()
 */

import { createRequire } from 'module';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// On Vercel the project filesystem is read-only; only /tmp is writable.
const IS_VERCEL  = !!(process.env.VERCEL || process.env.VERCEL_ENV);
const WRITE_DIR  = IS_VERCEL ? '/tmp' : __dirname;

// ─── SQLite schema & seed ────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS yieldmax_applications (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at        TEXT,
    title               TEXT,
    surname             TEXT,
    firstname           TEXT,
    othername           TEXT,
    gender              TEXT,
    dob                 TEXT,
    phone               TEXT,
    email               TEXT,
    address             TEXT,
    nin                 TEXT,
    bvn                 TEXT,
    nextOfKinSurname    TEXT,
    nextOfKinFirstname  TEXT,
    nextOfKinOthername  TEXT,
    nextOfKinPhone      TEXT,
    nextOfKinRelationship TEXT,
    nextOfKinAddress    TEXT,
    investStartDate     TEXT,
    investTenure        TEXT,
    investAmount        REAL,
    sourceOfFunds       TEXT,
    bankName            TEXT,
    bankAccountName     TEXT,
    bankAccountNumber   TEXT,
    doc1Label           TEXT,
    doc2Label           TEXT,
    doc3Label           TEXT,
    doc4Label           TEXT,
    passportPhotoPath   TEXT,
    doc1FilePath        TEXT,
    doc2FilePath        TEXT,
    doc3FilePath        TEXT,
    doc4FilePath        TEXT,
    status              TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS loan_applications (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at            TEXT,
    loanType                TEXT,
    surname                 TEXT,
    middleName              TEXT,
    firstName               TEXT,
    email                   TEXT,
    gender                  TEXT,
    bvn                     TEXT,
    nin                     TEXT,
    homeAddress             TEXT,
    homeTelephone           TEXT,
    mobile                  TEXT,
    employer                TEXT,
    jobTitle                TEXT,
    employmentStatus        TEXT,
    nextOfKinFirstName      TEXT,
    nextOfKinLastName       TEXT,
    nextOfKinRelationship   TEXT,
    nextOfKinPhone          TEXT,
    nextOfKinAddress        TEXT,
    loanAmount              REAL,
    loanDate                TEXT,
    monthlyIncome           REAL,
    loanPurpose             TEXT,
    fileCacPath             TEXT,
    fileNepaPath            TEXT,
    fileNinPath             TEXT,
    fileSupplementalPath    TEXT,
    status                  TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS inquiries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at  TEXT,
    fullName      TEXT,
    email         TEXT,
    inquiryType   TEXT,
    message       TEXT,
    status        TEXT DEFAULT 'unread'
);
`;

// ─── Attempt 1: better-sqlite3 (native) ─────────────────────────────────────

function tryBetterSqlite3() {
    const BetterSqlite3 = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'alliance_global.db');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(SCHEMA_SQL);
    console.log('[db] Using better-sqlite3 (native)');
    return db;
}

// ─── Attempt 2: sql.js (pure JS / WASM fallback) ────────────────────────────

function buildSqlJsDb() {
    // sql.js stores everything in memory; we persist to a binary file manually.
    const initSqlJs = require('sql.js');
    const dbPath    = path.join(WRITE_DIR, 'alliance_global_sqljs.bin');

    // On Vercel, locate the pre-compiled WASM file that ships inside the
    // sql.js npm package so the runtime doesn't try to fetch it over HTTP.
    const wasmPath  = path.join(
        __dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'
    );
    const sqlJsConfig = existsSync(wasmPath)
        ? { locateFile: () => wasmPath }
        : {};

    return initSqlJs(sqlJsConfig).then(SQL => {
        let db;
        if (existsSync(dbPath)) {
            const fileBuffer = readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
        } else {
            db = new SQL.Database();
        }

        db.run(SCHEMA_SQL);

        function persist() {
            const data = db.export();
            writeFileSync(dbPath, Buffer.from(data));
        }

        // Wrap sql.js into a better-sqlite3-compatible synchronous API
        const wrapper = {
            prepare(sql) {
                return {
                    run(...params) {
                        // sql.js uses positional ? params passed as an array
                        db.run(sql, params);
                        persist();
                        // Emulate better-sqlite3's { lastInsertRowid, changes }
                        const meta = db.exec('SELECT last_insert_rowid() AS r, changes() AS c');
                        const row  = meta[0]?.values[0] ?? [0, 0];
                        return { lastInsertRowid: row[0], changes: row[1] };
                    },
                    get(...params) {
                        const stmt = db.prepare(sql);
                        stmt.bind(params);
                        if (stmt.step()) {
                            const row = stmt.getAsObject();
                            stmt.free();
                            return row;
                        }
                        stmt.free();
                        return undefined;
                    },
                    all(...params) {
                        const results = db.exec(sql, params);
                        if (!results.length) return [];
                        const { columns, values } = results[0];
                        return values.map(row =>
                            Object.fromEntries(columns.map((col, i) => [col, row[i]]))
                        );
                    }
                };
            },
            exec(sql) { db.run(sql); persist(); }
        };

        console.log('[db] Using sql.js (pure-JS WASM fallback — no native build required)');
        return wrapper;
    });
}

// ─── Bootstrap: try native → fall back to WASM ──────────────────────────────

let db;

try {
    db = tryBetterSqlite3();
} catch (nativeErr) {
    console.warn('[db] better-sqlite3 native load failed:', nativeErr.message);
    console.warn('[db] Falling back to sql.js (pure JS)…');

    // Top-level await is valid in ES modules (Node ≥ 14.8)
    db = await buildSqlJsDb();
}

export default db;
