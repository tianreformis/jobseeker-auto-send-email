import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";

function dbPath(): string {
  // Isolated DB for tests (vitest sets VITEST automatically; allow explicit override).
  if (process.env.VITEST || process.env.JH_DB_PATH) {
    return process.env.JH_DB_PATH ?? path.join(process.cwd(), "data", "jobhunter.test.db");
  }
  return path.join(process.cwd(), "data", "jobhunter.db");
}

let sqlite: Database.Database | null = null;
let db: BetterSQLite3Database | null = null;

export function getDb(): BetterSQLite3Database {
  if (!db) {
    const p = dbPath();
    sqlite = new Database(p);
    sqlite.pragma("journal_mode = WAL");
    sqlite.exec(`CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, external_id TEXT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, company TEXT, description TEXT NOT NULL, location TEXT, remote INTEGER NOT NULL DEFAULT 1, budget_text TEXT, posted_at TEXT, contact_email TEXT, apply_method TEXT NOT NULL DEFAULT 'unknown', raw_json TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, fit_score INTEGER NOT NULL, tracks TEXT NOT NULL, matched_skills TEXT NOT NULL, gaps TEXT NOT NULL, red_flags TEXT NOT NULL, reasoning TEXT NOT NULL, model_used TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS applications (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', proposal_text TEXT, cv_variant_path TEXT, cover_letter_path TEXT, email_subject TEXT, approved_at TEXT, sent_at TEXT, error_message TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, scheduled_for TEXT, created_at TEXT NOT NULL);`);
    db = drizzle(sqlite);
  }
  return db;
}
