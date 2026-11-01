// Placeholder migration runner: creates tables with plain SQL (Drizzle schema is source of truth).
import Database from "better-sqlite3";
import path from "node:path";

const dbPath = process.env.JH_DB_PATH ?? path.join(process.cwd(), "data", "jobhunter.db");
const sqlite = new Database(dbPath);

sqlite.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company TEXT,
  description TEXT NOT NULL,
  location TEXT,
  remote INTEGER NOT NULL DEFAULT 1,
  budget_text TEXT,
  posted_at TEXT,
  contact_email TEXT,
  apply_method TEXT NOT NULL DEFAULT 'unknown',
  raw_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  fit_score INTEGER NOT NULL,
  tracks TEXT NOT NULL,
  matched_skills TEXT NOT NULL,
  gaps TEXT NOT NULL,
  red_flags TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  proposal_text TEXT,
  cv_variant_path TEXT,
  cover_letter_path TEXT,
  email_subject TEXT,
  approved_at TEXT,
  sent_at TEXT,
  error_message TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TEXT,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('mode', 'review');
INSERT OR IGNORE INTO settings (key, value) VALUES ('dry_run', 'true');
`);

console.log(`migrated: ${dbPath}`);
