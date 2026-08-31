import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import multer from 'multer';
import db from './database.js';

// Resolve __dirname in ES Module context
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Startup Validation ───────────────────────────────────────────────────────
const REQUIRED_ENV = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'TOKEN_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error('Create server/.env with ADMIN_USERNAME, ADMIN_PASSWORD, and TOKEN_SECRET.');
    process.exit(1);
}

// ─── Auth Configuration ───────────────────────────────────────────────────────
const TOKEN_SECRET       = process.env.TOKEN_SECRET;
const TOKEN_EXPIRY_MS    = (parseInt(process.env.TOKEN_EXPIRY_HOURS) || 8) * 3600 * 1000;
const ADMIN_USERNAME     = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD     = process.env.ADMIN_PASSWORD;

// ─── Token Utilities ─────────────────────────────────────────────────────────

function b64url(input) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf.toString('base64url');
}

function signToken() {
    const payload = b64url(JSON.stringify({ sub: 'admin', exp: Date.now() + TOKEN_EXPIRY_MS }));
    const sig     = b64url(createHmac('sha256', TOKEN_SECRET).update(payload).digest());
    return `${payload}.${sig}`;
}

function verifyToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const expected = b64url(createHmac('sha256', TOKEN_SECRET).update(payload).digest());
    try {
        const sigBuf = Buffer.from(sig);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length) return false;
        if (!timingSafeEqual(sigBuf, expBuf)) return false;
    } catch {
        return false;
    }
    try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return typeof exp === 'number' && Date.now() < exp;
    } catch {
        return false;
    }
}

function requireAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !verifyToken(token)) {
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }
    next();
}

// Initialize Express
const app = express();
const PORT = parseInt(process.env.PORT) || 5000;

// ─── Upload Directory ─────────────────────────────────────────────────────────
const UPLOADS_ROOT  = process.env.UPLOADS_PATH || path.join(__dirname, 'uploads');
const FRONTEND_DIR  = path.join(__dirname, '..');

// ─── File Upload Configuration ───────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'image/tiff'
]);

const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'image/tiff': 'tif'
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function fileFilter(req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `File type not allowed: ${file.mimetype}`));
    }
}

function createStorage(subDir) {
    return multer.diskStorage({
        destination(req, file, cb) {
            const dir = path.join(UPLOADS_ROOT, subDir);
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename(req, file, cb) {
            const ext = MIME_TO_EXT[file.mimetype] || 'bin';
            cb(null, `${randomUUID()}-${Date.now()}.${ext}`);
        }
    });
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

function runMulter(middleware, req, res) {
    return new Promise((resolve, reject) => {
        middleware(req, res, (err) => (err ? reject(err) : resolve()));
    });
}

function filePath(req, fieldName) {
    const file = req.files?.[fieldName]?.[0];
    if (!file) return null;
    return path.relative(path.dirname(UPLOADS_ROOT), file.path).replace(/\\/g, '/');
}

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs:         15 * 60 * 1000,
    max:              5,
    standardHeaders:  true,
    legacyHeaders:    false,
    message:          { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' }
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "https://cdn.tailwindcss.com", "'unsafe-inline'"],
            styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
            fontSrc:     ["'self'", "https://fonts.gstatic.com"],
            imgSrc:      ["'self'", "data:", "https://images.unsplash.com"],
            connectSrc:  ["'self'"],
        }
    }
}));
app.use(cors({
    origin:         process.env.CORS_ORIGIN || '*',
    methods:        ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50kb' }));

// 5. YIELDMAX SUBMISSION ROUTE
app.post('/api/submit/yieldmax', async (req, res) => {
    try {
        await runMulter(uploadYieldmax, req, res);
    } catch (err) {
        if (err instanceof multer.MulterError) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'File exceeds the 5 MB size limit.'
                : `Upload error: ${err.message}`;
            return res.status(400).json({ success: false, message: msg });
        }
        console.error('YieldMax upload error:', err);
        return res.status(500).json({ success: false, message: 'File upload failed.' });
    }

    try {
        const d = req.body;
        const stmt = db.prepare(`
            INSERT INTO yieldmax_applications (
                submitted_at, title, surname, firstname, othername,
                gender, dob, phone, email, address, nin, bvn,
                nextOfKinSurname, nextOfKinFirstname, nextOfKinOthername,
                nextOfKinPhone, nextOfKinRelationship, nextOfKinAddress,
                investStartDate, investTenure, investAmount, sourceOfFunds,
                bankName, bankAccountName, bankAccountNumber,
                doc1Label, doc2Label, doc3Label, doc4Label,
                passportPhotoPath, doc1FilePath, doc2FilePath, doc3FilePath, doc4FilePath
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?, ?
            )
        `);

        const params = [
            new Date().toISOString(),
            d.title              || null,
            d.surname            || null,
            d.firstname          || null,
            d.othername          || null,
            d.gender             || null,
            d.dob                || null,
            d.phone              || null,
            d.email              || null,
            d.address            || null,
            d.nin                || null,
            d.bvn                || null,
            d.nextofkin_surname    || null,
            d.nextofkin_firstname  || null,
            d.nextofkin_othername  || null,
            d.nextOfKinPhone       || null,
            d.nextOfKinRelationship || null,
            d.nextOfKinAddress     || null,
            d.investStartDate    || null,
            d.investTenure       || null,
            d.investAmount       ? parseFloat(d.investAmount) : null,
            d.sourceOfFunds      || null,
            d.bankName           || null,
            d.bankAccountName    || null,
            d.bankAccountNumber  || null,
            d.doc1Label          || null,
            d.doc2Label          || null,
            d.doc3Label          || null,
            d.doc4Label          || null,
            filePath(req, 'passportPhoto'),
            filePath(req, 'doc1File'),
            filePath(req, 'doc2File'),
            filePath(req, 'doc3File'),
            filePath(req, 'doc4File')
        ];

        const info = stmt.run(...params);
        console.log(`YieldMax application saved — row ID: ${info.lastInsertRowid}`);
        res.status(200).json({ success: true, id: info.lastInsertRowid, message: 'YieldMax application saved successfully.' });

    } catch (error) {
        console.error('YieldMax route error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// 7. LOAN SUBMISSION ROUTE
app.post('/api/submit/loan', async (req, res) => {
    try {
        await runMulter(uploadLoan, req, res);
    } catch (err) {
        if (err instanceof multer.MulterError) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'File exceeds the 5 MB size limit.'
                : `Upload error: ${err.message}`;
            return res.status(400).json({ success: false, message: msg });
        }
        console.error('Loan upload error:', err);
        return res.status(500).json({ success: false, message: 'File upload failed.' });
    }

    try {
        const d = req.body;
        const stmt = db.prepare(`
            INSERT INTO loan_applications (
                submitted_at, loanType,
                surname, middleName, firstName, email, gender, bvn, nin,
                homeAddress, homeTelephone, mobile,
                employer, jobTitle, employmentStatus,
                nextOfKinFirstName, nextOfKinLastName, nextOfKinRelationship,
                nextOfKinPhone, nextOfKinAddress,
                loanAmount, loanDate, monthlyIncome, loanPurpose,
                fileCacPath, fileNepaPath, fileNinPath, fileSupplementalPath
            ) VALUES (
                ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?
            )
        `);

        const params = [
            new Date().toISOString(),
            d.loanType              || null,
            d.surname               || null,
            d.middleName            || null,
            d.firstName             || null,
            d.email                 || null,
            d.gender                || null,
            d.bvn                   || null,
            d.nin                   || null,
            d.homeAddress           || null,
            d.homeTelephone         || null,
            d.mobile                || null,
            d.employer              || null,
            d.jobTitle              || null,
            d.employmentStatus      || null,
            d.nextOfKinFirstName    || null,
            d.nextOfKinLastName     || null,
            d.nextOfKinRelationship || null,
            d.nextOfKinPhone        || null,
            d.nextOfKinAddress      || null,
            d.loanAmount    ? parseFloat(d.loanAmount)    : null,
            d.loanDate              || null,
            d.monthlyIncome ? parseFloat(d.monthlyIncome) : null,
            d.loanPurpose           || null,
            filePath(req, 'fileCac'),
            filePath(req, 'fileNepa'),
            filePath(req, 'fileNin'),
            filePath(req, 'fileSupplemental')
        ];

        const info = stmt.run(...params);
        console.log(`Loan application saved — row ID: ${info.lastInsertRowid}`);
        res.status(200).json({ success: true, id: info.lastInsertRowid, message: 'Loan application saved successfully.' });

    } catch (error) {
        console.error('Loan route error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// 8. INQUIRY SUBMISSION ROUTE
app.post('/api/submit/inquiry', (req, res) => {
    try {
        const d = req.body;
        const stmt = db.prepare(`
            INSERT INTO inquiries (submitted_at, fullName, email, inquiryType, message)
            VALUES (?, ?, ?, ?, ?)
        `);

        const params = [
            new Date().toISOString(),
            d.fullName     || null,
            d.email        || null,
            d.inquiryType  || null,
            d.message      || null
        ];

        const info = stmt.run(...params);
        console.log(`Inquiry saved — row ID: ${info.lastInsertRowid}`);
        res.status(200).json({ success: true, id: info.lastInsertRowid, message: 'Inquiry saved successfully.' });

    } catch (error) {
        console.error('Inquiry route error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// 9. ADMIN LOGIN ROUTE
app.post('/api/admin/login', loginLimiter, (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        const usernameMatch = (() => {
            try {
                const a = Buffer.from(String(username).padEnd(64));
                const b = Buffer.from(String(ADMIN_USERNAME).padEnd(64));
                return timingSafeEqual(a, b) && username === ADMIN_USERNAME;
            } catch { return false; }
        })();

        const passwordMatch = (() => {
            try {
                const a = Buffer.from(String(password).padEnd(128));
                const b = Buffer.from(String(ADMIN_PASSWORD).padEnd(128));
                return timingSafeEqual(a, b) && password === ADMIN_PASSWORD;
            } catch { return false; }
        })();

        if (!usernameMatch || !passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const token = signToken();
        res.status(200).json({ success: true, token });
    } catch (error) {
        console.error('Login route error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// 10. LEGACY ADMINISTRATIVE ROUTE
app.get('/api/applications', requireAuth, (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM applications ORDER BY id DESC").all();
        res.status(200).json(rows);
    } catch (error) {
        console.error('GET /api/applications error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// 11. LEGACY STATUS UPDATE
app.patch('/api/applications/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        db.prepare("UPDATE applications SET status = ? WHERE id = ?").run(status, id);
        res.status(200).json({ success: true, message: 'Status updated.' });
    } catch (error) {
        console.error('PATCH /api/applications/:id error:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// ─── Protected Admin Routes ───────────────────────────────────────────────────

// 12. GET YIELDMAX APPLICATIONS
app.get('/api/admin/yieldmax', requireAuth, (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM yieldmax_applications ORDER BY id DESC").all();
        res.status(200).json(rows);
    } catch (error) {
        console.error('DB retrieval error (yieldmax):', error);
        res.status(500).json({ success: false, message: 'Database read error.' });
    }
});

// 13. UPDATE YIELDMAX APPLICATION STATUS
app.patch('/api/admin/yieldmax/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        db.prepare("UPDATE yieldmax_applications SET status = ? WHERE id = ?").run(status, id);
        res.status(200).json({ success: true, message: 'Status updated.' });
    } catch (error) {
        console.error('DB update error (yieldmax):', error);
        res.status(500).json({ success: false, message: 'Database update error.' });
    }
});

// 14. GET LOAN APPLICATIONS
app.get('/api/admin/loans', requireAuth, (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM loan_applications ORDER BY id DESC").all();
        res.status(200).json(rows);
    } catch (error) {
        console.error('DB retrieval error (loans):', error);
        res.status(500).json({ success: false, message: 'Database read error.' });
    }
});

// 15. UPDATE LOAN APPLICATION STATUS
app.patch('/api/admin/loans/:id', requireAuth, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        db.prepare("UPDATE loan_applications SET status = ? WHERE id = ?").run(status, id);
        res.status(200).json({ success: true, message: 'Status updated.' });
    } catch (error) {
        console.error('DB update error (loans):', error);
        res.status(500).json({ success: false, message: 'Database update error.' });
    }
});

// 16. GET INQUIRIES
app.get('/api/admin/inquiries', requireAuth, (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM inquiries ORDER BY id DESC").all();
        res.status(200).json(rows);
    } catch (error) {
        console.error('DB retrieval error (inquiries):', error);
        res.status(500).json({ success: false, message: 'Database read error.' });
    }
});

// ─── Static File Serving ──────────────────────────────────────────────────────
app.use('/uploads', express.static(UPLOADS_ROOT, { index: false }));
app.use('/assets', express.static(path.join(FRONTEND_DIR, 'assets'), { index: false }));
app.use(express.static(FRONTEND_DIR, { index: 'index.html', extensions: ['html'] }));

// 17. Start server
app.listen(PORT, () => {
    console.log(`Server running smoothly with persistent database on port ${PORT}`);
});