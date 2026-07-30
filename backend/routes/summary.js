const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

router.use(requireAuth);

const DEFAULT_MONEY_IN_ROWS = [
  { label: 'Umesha budget gap', amount: 0 },
  { label: '', amount: 0 },
  { label: '', amount: 0 },
  { label: '', amount: 0 },
];

function defaultData() {
  return {
    recurringBudgets: {},
    oneoffBudgets: {},
    salary: 0,
    fromPrevious: 0,
    moneyInRows: DEFAULT_MONEY_IN_ROWS,
  };
}

router.get('/:yearMonth', (req, res) => {
  const row = db.prepare('SELECT data FROM summary WHERE month = ?').get(req.params.yearMonth);
  if (row) {
    return res.json(JSON.parse(row.data));
  }
  res.json(defaultData());
});

router.put('/:yearMonth', (req, res) => {
  const data = JSON.stringify(req.body);
  db.prepare('INSERT OR REPLACE INTO summary (month, data) VALUES (?, ?)').run(req.params.yearMonth, data);
  res.json(req.body);
});

module.exports = router;
