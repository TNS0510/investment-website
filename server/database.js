import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundled DB lives alongside this file in the deployed bundle
const BUNDLED_DB = path.join(__dirname, 'alliance_global.db');

// Determine database path:
//   • Vercel / production: copy bundled DB into /tmp once per container lifetime,
//     so the file is writable while reads and writes share the same instance.
//   • Local dev: use the file in-place (writable, persists across restarts).
const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
let dbPath;

if (isVercel) {
    dbPath = '/tmp/alliance_global.db';
    // Copy the seed DB into /tmp only if it hasn't been placed there yet.
    // This ensures schema + any pre-seeded rows are present on a cold start,
    // and subsequent warm-invocation writes are visible within the same container.
    if (!fs.existsSync(dbPath)) {
        if (fs.existsSync(BUNDLED_DB)) {
            fs.copyFileSync(BUNDLED_DB, dbPath);
        }
        // If the bundled file doesn't exist either, better-sqlite3 will create a fresh DB below.
    }
} else {
    dbPath = BUNDLED_DB;
}

// Initialize SQLite database instance
const db = new Database(dbPath);

// WAL mode improves concurrent read performance; safe to enable everywhere.
db.pragma('journal_mode = WAL');

// Initialize Database Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS yieldmax_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at TEXT,
    title TEXT,
    surname TEXT,
    firstname TEXT,
    othername TEXT,
    gender TEXT,
    dob TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    nin TEXT,
    bvn TEXT,
    nextOfKinSurname TEXT,
    nextOfKinFirstname TEXT,
    nextOfKinOthername TEXT,
    nextOfKinPhone TEXT,
    nextOfKinRelationship TEXT,
    nextOfKinAddress TEXT,
    investStartDate TEXT,
    investTenure TEXT,
    investAmount REAL,
    sourceOfFunds TEXT,
    bankName TEXT,
    bankAccountName TEXT,
    bankAccountNumber TEXT,
    doc1Label TEXT,
    doc2Label TEXT,
    doc3Label TEXT,
    doc4Label TEXT,
    passportPhotoPath TEXT,
    doc1FilePath TEXT,
    doc2FilePath TEXT,
    doc3FilePath TEXT,
    doc4FilePath TEXT,
    status TEXT DEFAULT 'Pending'
  );

  CREATE TABLE IF NOT EXISTS loan_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at TEXT,
    loanType TEXT,
    surname TEXT,
    middleName TEXT,
    firstName TEXT,
    email TEXT,
    gender TEXT,
    bvn TEXT,
    nin TEXT,
    homeAddress TEXT,
    homeTelephone TEXT,
    mobile TEXT,
    employer TEXT,
    jobTitle TEXT,
    employmentStatus TEXT,
    nextOfKinFirstName TEXT,
    nextOfKinLastName TEXT,
    nextOfKinRelationship TEXT,
    nextOfKinPhone TEXT,
    nextOfKinAddress TEXT,
    loanAmount REAL,
    loanDate TEXT,
    monthlyIncome REAL,
    loanPurpose TEXT,
    fileCacPath TEXT,
    fileNepaPath TEXT,
    fileNinPath TEXT,
    fileSupplementalPath TEXT,
    status TEXT DEFAULT 'Pending'
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_at TEXT,
    fullName TEXT,
    email TEXT,
    inquiryType TEXT,
    message TEXT,
    status TEXT DEFAULT 'Pending'
  );
`);

export default db;