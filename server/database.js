import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Vercel (production), write to the ephemeral /tmp directory.
// Locally, keep using the local directory.
const dbPath = process.env.NODE_ENV === 'production' || process.env.VERCEL
  ? path.join(os.tmpdir(), 'database.db')
  : path.join(__dirname, 'database.db');

const db = new Database(dbPath);

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

export default db;