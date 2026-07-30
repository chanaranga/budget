#!/usr/bin/env node
// Seed the SQLite database from public/seed-data.json
// Run once after deployment: node scripts/seed-db.js
//
// Optional flags:
//   --clear     Delete all existing transactions before importing
//   --db <path> Override the database path

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const clear = args.includes('--clear');
const dbFlag = args.indexOf('--db');
const DB_PATH = dbFlag !== -1
  ? args[dbFlag + 1]
  : path.join(__dirname, '..', 'backend', 'data', 'finance.db');

const SEED_FILE = path.join(__dirname, '..', 'public', 'seed-data.json');

if (!fs.existsSync(SEED_FILE)) {
  console.error('Error: public/seed-data.json not found');
  process.exit(1);
}

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
`);

if (clear) {
  db.exec('DELETE FROM transactions');
  console.log('Cleared existing transactions.');
}

const transactions = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

const insert = db.prepare(`
  INSERT OR REPLACE INTO transactions
    (id, date, start_balance, end_balance, amount, type, category, sub_category, paid_to, comment, bank_text, budgeted)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec('BEGIN');
for (const t of transactions) {
  insert.run(
    t.id, t.date, t.startBalance ?? null, t.endBalance ?? null, t.amount ?? null,
    t.type, t.category, t.subCategory, t.paidTo, t.comment, t.bankText, t.budgeted
  );
}
db.exec('COMMIT');

const { n } = db.prepare('SELECT COUNT(*) as n FROM transactions').get();
console.log(`Done: ${n} transactions in ${DB_PATH}`);
