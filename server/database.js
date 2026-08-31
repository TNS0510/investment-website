import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB_PATH: prefer DATABASE_PATH env var (for persistent volume mounts),
// otherwise default to a path relative to this file.
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'alliance_global.db');

// 1. Open or create the SQLite database instance using better-sqlite3
const db = new Database(DB_PATH);

console.log('Connected smoothly to the alliance_global.db SQL database (better-sqlite3).');

// 2. Initialize database schema synchronously
db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_at TEXT NOT NULL,
        title TEXT,
        surname TEXT,
        firstname TEXT,
        othername TEXT,
        email TEXT,
        nextofkin_surname TEXT,
        nextofkin_firstname TEXT,
        nextofkin_othername TEXT,
        status TEXT DEFAULT 'Pending'
    );

    CREATE TABLE IF NOT EXISTS yieldmax_applications (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_at            TEXT NOT NULL,
        title                   TEXT,
        surname                 TEXT,
        firstname               TEXT,
        othername               TEXT,
        gender                  TEXT,
        dob                     TEXT,
        phone                   TEXT,
        email                   TEXT,
        address                 TEXT,
        nin                     TEXT,
        bvn                     TEXT,
        nextOfKinSurname        TEXT,
        nextOfKinFirstname      TEXT,
        nextOfKinOthername      TEXT,
        nextOfKinPhone          TEXT,
        nextOfKinRelationship   TEXT,
        nextOfKinAddress        TEXT,
        investStartDate         TEXT,
        investTenure            TEXT,
        investAmount            REAL,
        sourceOfFunds           TEXT,
        bankName                TEXT,
        bankAccountName         TEXT,
        bankAccountNumber       TEXT,
        doc1Label               TEXT,
        doc2Label               TEXT,
        doc3Label               TEXT,
        doc4Label               TEXT,
        passportPhotoPath       TEXT,
        doc1FilePath            TEXT,
        doc2FilePath            TEXT,
        doc3FilePath            TEXT,
        doc4FilePath            TEXT,
        status                  TEXT DEFAULT 'Pending'
    );

    CREATE TABLE IF NOT EXISTS loan_applications (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_at            TEXT NOT NULL,
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
        status                  TEXT DEFAULT 'Pending'
    );

    CREATE TABLE IF NOT EXISTS inquiries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_at    TEXT NOT NULL,
        fullName        TEXT,
        email           TEXT,
        inquiryType     TEXT,
        message         TEXT
    );
`);

// 3. Migrate live DB: add missing columns safely
const migrateColumns = (table, columns) => {
    columns.forEach(col => {
        try {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
        } catch (err) {
            // Ignore error if column already exists
            if (!err.message.includes('duplicate column name')) {
                console.error(`Migration error on ${table} (${col}):`, err.message);
            }
        }
    });
};

migrateColumns('yieldmax_applications', ['passportPhotoPath', 'doc1FilePath', 'doc2FilePath', 'doc3FilePath', 'doc4FilePath']);
migrateColumns('loan_applications', ['fileCacPath', 'fileNepaPath', 'fileNinPath', 'fileSupplementalPath']);

export default db;