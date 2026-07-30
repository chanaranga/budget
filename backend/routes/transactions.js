const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

router.use(requireAuth);

function toRow(t) {
  return {
    id: t.id,
    date: t.date,
    start_balance: t.startBalance ?? null,
    end_balance: t.endBalance ?? null,
    amount: t.amount ?? null,
    type: t.type ?? '',
    category: t.category ?? '',
    sub_category: t.subCategory ?? '',
    paid_to: t.paidTo ?? '',
    comment: t.comment ?? '',
    bank_text: t.bankText ?? '',
    budgeted: t.budgeted ?? '',
  };
}

function fromRow(row) {
  return {
    id: row.id,
    date: row.date,
    startBalance: row.start_balance,
    endBalance: row.end_balance,
    amount: row.amount,
    type: row.type,
    category: row.category,
    subCategory: row.sub_category,
    paidTo: row.paid_to,
    comment: row.comment,
    bankText: row.bank_text,
    budgeted: row.budgeted,
  };
}

// GET all transactions
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM transactions ORDER BY date, rowid').all();
  res.json(rows.map(fromRow));
});

// POST create
router.post('/', (req, res) => {
  const row = toRow(req.body);
  db.prepare(`
    INSERT INTO transactions (id, date, start_balance, end_balance, amount, type, category, sub_category, paid_to, comment, bank_text, budgeted)
    VALUES (@id, @date, @start_balance, @end_balance, @amount, @type, @category, @sub_category, @paid_to, @comment, @bank_text, @budgeted)
  `).run(row);
  res.status(201).json(req.body);
});

// PUT update
router.put('/:id', (req, res) => {
  const row = toRow(req.body);
  db.prepare(`
    UPDATE transactions SET
      date = @date, start_balance = @start_balance, end_balance = @end_balance,
      amount = @amount, type = @type, category = @category, sub_category = @sub_category,
      paid_to = @paid_to, comment = @comment, bank_text = @bank_text, budgeted = @budgeted
    WHERE id = @id
  `).run(row);
  res.json(req.body);
});

// DELETE
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// POST bulk import (seed / one-time import)
router.post('/bulk', (req, res) => {
  const transactions = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'Expected array' });

  const insert = db.prepare(`
    INSERT OR REPLACE INTO transactions (id, date, start_balance, end_balance, amount, type, category, sub_category, paid_to, comment, bank_text, budgeted)
    VALUES (@id, @date, @start_balance, @end_balance, @amount, @type, @category, @sub_category, @paid_to, @comment, @bank_text, @budgeted)
  `);

  const insertMany = db.transaction(txns => {
    for (const t of txns) insert.run(toRow(t));
  });

  insertMany(transactions);
  res.json({ imported: transactions.length });
});

module.exports = router;
