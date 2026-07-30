const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'finance.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

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

module.exports = db;
