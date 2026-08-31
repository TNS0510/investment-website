import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine database path: Use /tmp in Vercel serverless environment, otherwise local folder
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const dbDir = isVercel ? '/tmp' : __dirname;
const dbPath = path.join(dbDir, 'database.sqlite');

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database instance
const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance locally
if (!isVercel) {
    db.pragma('journal_mode = WAL');
}

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