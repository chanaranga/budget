const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const bunq = require('../bunq/client');

// ── Helpers ────────────────────────────────────────────────────────────────

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO transactions
    (id, date, start_balance, end_balance, amount, type, category, sub_category,
     paid_to, comment, bank_text, budgeted, exclude_from_analytics, bunq_id)
  VALUES
    (@id, @date, @start_balance, @end_balance, @amount, @type, @category, @sub_category,
     @paid_to, @comment, @bank_text, @budgeted, @exclude_from_analytics, @bunq_id)
`);

// Update Bunq-owned fields on existing rows; preserve user-set category/comment/budgeted
const updateStmt = db.prepare(`
  UPDATE transactions SET
    date = @date,
    amount = @amount,
    paid_to = @paid_to,
    bank_text = @bank_text,
    end_balance = @end_balance,
    start_balance = @start_balance
  WHERE bunq_id = @bunq_id
`);

function upsertPayment(payment) {
  const t = bunq.paymentToTransaction(payment);
  const row = {
    id: t.id,
    date: t.date,
    start_balance: t.startBalance,
    end_balance: t.endBalance,
    amount: t.amount,
    type: t.type,
    category: '',
    sub_category: '',
    paid_to: t.paidTo,
    comment: '',
    bank_text: t.bankText,
    budgeted: '',
    exclude_from_analytics: 0,
    bunq_id: t.bunqId,
  };
  const inserted = insertStmt.run(row).changes;
  if (!inserted) {
    // Row already exists — update Bunq-owned fields only
    updateStmt.run({
      date: t.date,
      amount: t.amount,
      paid_to: t.paidTo,
      bank_text: t.bankText,
      end_balance: t.endBalance,
      start_balance: t.startBalance,
      bunq_id: t.bunqId,
    });
  }
  return inserted;
}

// ── POST /api/bunq/webhook — public, verified by Bunq signature ───────────

router.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  const signature = req.headers['x-bunq-server-signature'];

  if (!bunq.verifyWebhook(rawBody, signature)) {
    console.warn('[Bunq] Webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const payment = payload?.NotificationUrl?.object?.Payment;
  if (payment) {
    try {
      const inserted = upsertPayment(payment);
      console.log(`[Bunq] Webhook: payment ${payment.id} ${inserted ? 'inserted' : 'updated'}`);
      bunq.setSetting('last_sync', String(Date.now()));
    } catch (err) {
      console.error('[Bunq] Webhook upsert failed:', err.message);
    }
  }

  res.json({ ok: true });
});

// All routes below require auth
router.use(requireAuth);

// ── POST /api/bunq/setup ──────────────────────────────────────────────────

router.post('/setup', async (req, res) => {
  try {
    const result = await bunq.setup();
    bunq.setSetting('last_sync', String(Date.now()));
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Bunq] Setup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bunq/sync — manual or scheduled full sync ──────────────────

router.post('/sync', async (req, res) => {
  try {
    const payments = await bunq.getPayments();
    let imported = 0;
    let updated = 0;

    db.exec('BEGIN');
    try {
      for (const payment of payments) {
        const ins = upsertPayment(payment);
        if (ins) imported++; else updated++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // Track the most recent payment ID for incremental polls
    if (payments.length > 0) {
      const maxId = Math.max(...payments.map(p => p.id));
      bunq.setSetting('last_payment_id', String(maxId));
    }
    bunq.setSetting('last_sync', String(Date.now()));

    console.log(`[Bunq] Sync: ${imported} imported, ${updated} updated`);
    res.json({ imported, updated });
  } catch (err) {
    console.error('[Bunq] Sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bunq/status ──────────────────────────────────────────────────

router.get('/status', (req, res) => {
  const lastSyncRaw = bunq.getSetting('last_sync');
  const accountId = process.env.BUNQ_ACCOUNT_ID || bunq.getSetting('account_id');
  res.json({
    connected: bunq.isConnected(),
    lastSync: lastSyncRaw ? new Date(Number(lastSyncRaw)).toISOString() : null,
    accountId: accountId || null,
  });
});

module.exports = router;
