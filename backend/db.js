const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'finance.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id            TEXT PRIMARY KEY,
    date          TEXT NOT NULL,
    start_balance REAL,
    end_balance   REAL,
    amount        REAL,
    type          TEXT DEFAULT '',
    category      TEXT DEFAULT '',
    sub_category  TEXT DEFAULT '',
    paid_to       TEXT DEFAULT '',
    comment       TEXT DEFAULT '',
    bank_text     TEXT DEFAULT '',
    budgeted      TEXT DEFAULT '',
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS summary (
    month TEXT PRIMARY KEY,
    data  TEXT NOT NULL
  );
`);

// Add columns introduced after initial schema
try { db.exec(`ALTER TABLE transactions ADD COLUMN exclude_from_analytics INTEGER DEFAULT 0`); } catch (_) { /* already exists */ }
try { db.exec(`ALTER TABLE transactions ADD COLUMN bunq_id TEXT`); } catch (_) {}
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bunq_id ON transactions(bunq_id) WHERE bunq_id IS NOT NULL`); } catch (_) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS bunq_settings (key TEXT PRIMARY KEY, value TEXT)`); } catch (_) {}
db.exec(`PRAGMA foreign_keys = ON`);

module.exports = db;
