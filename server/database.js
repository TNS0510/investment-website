import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB_PATH: prefer DATABASE_PATH env var (for persistent volume mounts in production),
// otherwise default to a path relative to this file — reliable regardless of cwd.
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'alliance_global.db');

// 2. Open or create the SQLite database file
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Failed to connect to the SQLite database:', err.message);
    } else {
        console.log('Connected smoothly to the alliance_global.db SQL database.');
    }
});

// 3. Wrap our table initialization logic inside a standard database serialization block
db.serialize(() => {
    // Legacy table — preserved for backward compatibility
    db.run(`
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
        )
    `, (err) => {
        if (err) {
            console.error('Error creating applications table:', err.message);
        } else {
            console.log('Applications table verified and ready.');
        }
    });

    // Full YIELDMAX investment application table
    db.run(`
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
        )
    `, (err) => {
        if (err) {
            console.error('Error creating yieldmax_applications table:', err.message);
        } else {
            console.log('YieldMax applications table verified and ready.');
        }
    });

    // Migrate live DB: add file path columns if they don't exist yet
    ['passportPhotoPath', 'doc1FilePath', 'doc2FilePath', 'doc3FilePath', 'doc4FilePath'].forEach(col => {
        db.run(`ALTER TABLE yieldmax_applications ADD COLUMN ${col} TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error(`yieldmax_applications migration error (${col}):`, err.message);
            }
        });
    });

    // Full Institutional Loan application table
    db.run(`
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
        )
    `, (err) => {
        if (err) {
            console.error('Error creating loan_applications table:', err.message);
        } else {
            console.log('Loan applications table verified and ready.');
        }
    });

    // Migrate live DB: add file path columns if they don't exist yet
    ['fileCacPath', 'fileNepaPath', 'fileNinPath', 'fileSupplementalPath'].forEach(col => {
        db.run(`ALTER TABLE loan_applications ADD COLUMN ${col} TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error(`loan_applications migration error (${col}):`, err.message);
            }
        });
    });

    // Homepage inquiry / contact form submissions
    db.run(`
        CREATE TABLE IF NOT EXISTS inquiries (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            submitted_at    TEXT NOT NULL,
            fullName        TEXT,
            email           TEXT,
            inquiryType     TEXT,
            message         TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Error creating inquiries table:', err.message);
        } else {
            console.log('Inquiries table verified and ready.');
        }
    });
});

// 4. Export the database connection instance to be used elsewhere
export default db;