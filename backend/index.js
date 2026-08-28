require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors({
  origin: (process.env.FRONTEND_URLS || 'http://localhost:5173').split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/summary', require('./routes/summary'));
app.use('/api/bunq', require('./routes/bunq'));

app.get('/health', (req, res) => res.json({ ok: true }));

// Serve built frontend in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);

  // 2-hour background poll to catch Bunq field updates
  const bunq = require('./bunq/client');
  const db = require('./db');

  async function pollBunq() {
    if (!bunq.isConnected()) return;
    try {
      const { getPayments, paymentToTransaction, setSetting } = bunq;
      const lastId = bunq.getSetting('last_payment_id');
      const payments = await getPayments(lastId || undefined);
      if (payments.length === 0) return;

      const updateStmt = db.prepare(`
        UPDATE transactions SET date=@date, amount=@amount, paid_to=@paid_to,
          bank_text=@bank_text, end_balance=@end_balance, start_balance=@start_balance
        WHERE bunq_id=@bunq_id
      `);
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO transactions
          (id, date, start_balance, end_balance, amount, type, category, sub_category,
           paid_to, comment, bank_text, budgeted, exclude_from_analytics, bunq_id)
        VALUES
          (@id, @date, @start_balance, @end_balance, @amount, @type, @category, @sub_category,
           @paid_to, @comment, @bank_text, @budgeted, @exclude_from_analytics, @bunq_id)
      `);

      db.exec('BEGIN');
      let imported = 0, updated = 0;
      try {
        for (const payment of payments) {
          const t = paymentToTransaction(payment);
          const ins = insertStmt.run({
            id: t.id, date: t.date, start_balance: t.startBalance, end_balance: t.endBalance,
            amount: t.amount, type: t.type, category: '', sub_category: '', paid_to: t.paidTo,
            comment: '', bank_text: t.bankText, budgeted: '', exclude_from_analytics: 0, bunq_id: t.bunqId,
          }).changes;
          if (ins) { imported++; } else {
            updateStmt.run({ date: t.date, amount: t.amount, paid_to: t.paidTo,
              bank_text: t.bankText, end_balance: t.endBalance, start_balance: t.startBalance, bunq_id: t.bunqId });
            updated++;
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const maxId = Math.max(...payments.map(p => p.id));
      setSetting('last_payment_id', String(maxId));
      setSetting('last_sync', String(Date.now()));
      console.log(`[Bunq] Poll: ${imported} imported, ${updated} updated`);
    } catch (err) {
      console.error('[Bunq] Poll error:', err.message);
    }
  }

  setInterval(pollBunq, 2 * 60 * 60 * 1000);
});
