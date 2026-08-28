const https = require('https');
const crypto = require('crypto');
const db = require('../db');

const BUNQ_BASE = 'https://api.bunq.com';

// ── Credential storage (survives Docker restarts) ──────────────────────────

function getSetting(key) {
  const row = db.prepare('SELECT value FROM bunq_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO bunq_settings (key, value) VALUES (?, ?)').run(key, String(value));
}

// ── Request signing (Bunq RSA-SHA256) ─────────────────────────────────────

function buildSignInput(method, endpoint, headers, body) {
  const include = [
    'Cache-Control', 'Content-Type', 'User-Agent',
    'X-Bunq-Client-Authentication', 'X-Bunq-Client-Request-Id',
    'X-Bunq-Geolocation', 'X-Bunq-Language', 'X-Bunq-Region',
  ];
  const headerLines = include
    .filter(h => headers[h] !== undefined)
    .map(h => `${h}: ${headers[h]}`)
    .join('\n');
  return `${method} ${endpoint}\n${headerLines}\n\n${body}`;
}

function sign(input, privateKeyPem) {
  return crypto.createSign('SHA256').update(input).sign(privateKeyPem, 'base64');
}

// ── Webhook signature verification ────────────────────────────────────────

function verifyWebhook(rawBody, signature) {
  const serverPublicKey = getSetting('server_public_key');
  if (!serverPublicKey || !signature) return false;
  try {
    return crypto.createVerify('SHA256').update(rawBody).verify(serverPublicKey, signature, 'base64');
  } catch {
    return false;
  }
}

// ── Core HTTP helper ───────────────────────────────────────────────────────

async function bunqRequest(method, endpoint, body, token, privateKeyPem) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = {
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'User-Agent': 'BudgetTracker/1.0',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'en_US',
  };
  if (token) headers['X-Bunq-Client-Authentication'] = token;
  if (privateKeyPem) {
    headers['X-Bunq-Client-Signature'] = sign(buildSignInput(method, endpoint, headers, bodyStr), privateKeyPem);
  }

  const url = new URL(BUNQ_BASE + endpoint);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.Error) {
              reject(new Error(parsed.Error[0]?.error_description || 'Bunq API error'));
            } else {
              resolve(parsed.Response);
            }
          } catch {
            reject(new Error(`Failed to parse Bunq response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Session management ─────────────────────────────────────────────────────

async function ensureSession() {
  const apiKey = process.env.BUNQ_API_KEY;
  if (!apiKey) throw new Error('BUNQ_API_KEY not configured');
  const installToken = getSetting('installation_token');
  const privateKey = getSetting('private_key');
  if (!installToken || !privateKey) throw new Error('Bunq not set up — run Setup from Settings first');

  const sessionAge = getSetting('session_created_at');
  if (sessionAge && Date.now() - Number(sessionAge) < 50 * 60 * 1000) return;

  const resp = await bunqRequest('POST', '/v1/session-server', { secret: apiKey }, installToken, privateKey);
  const token = resp.find(r => r.Token)?.Token?.token;
  const userObj = resp.find(r => r.UserPerson || r.UserCompany || r.UserApiKey);
  const userId = userObj?.UserPerson?.id ?? userObj?.UserCompany?.id ?? userObj?.UserApiKey?.id;
  setSetting('session_token', token);
  setSetting('user_id', String(userId));
  setSetting('session_created_at', String(Date.now()));
}

// ── One-time setup ─────────────────────────────────────────────────────────

async function setup() {
  const apiKey = process.env.BUNQ_API_KEY;
  if (!apiKey) throw new Error('BUNQ_API_KEY not configured');

  // 1. Generate RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  setSetting('private_key', privateKey);

  // 2. Installation — no auth needed
  const installResp = await bunqRequest('POST', '/v1/installation', { client_public_key: publicKey });
  const installToken = installResp.find(r => r.Token)?.Token?.token;
  const serverPublicKey = installResp.find(r => r.ServerPublicKey)?.ServerPublicKey?.server_public_key;
  setSetting('installation_token', installToken);
  setSetting('server_public_key', serverPublicKey);

  // 3. Register this device
  await bunqRequest('POST', '/v1/device-server', {
    description: 'Budget Tracker',
    secret: apiKey,
    permitted_ips: ['*'],
  }, installToken, privateKey);

  // 4. Create session
  const sessionResp = await bunqRequest('POST', '/v1/session-server', { secret: apiKey }, installToken, privateKey);
  const sessionToken = sessionResp.find(r => r.Token)?.Token?.token;
  const userObj = sessionResp.find(r => r.UserPerson || r.UserCompany || r.UserApiKey);
  const userId = userObj?.UserPerson?.id ?? userObj?.UserCompany?.id ?? userObj?.UserApiKey?.id;
  setSetting('session_token', sessionToken);
  setSetting('user_id', String(userId));
  setSetting('session_created_at', String(Date.now()));

  // 5. Auto-discover monetary account if not set
  let accountId = process.env.BUNQ_ACCOUNT_ID || getSetting('account_id');
  if (!accountId) {
    const accounts = await bunqRequest('GET', `/v1/user/${userId}/monetary-account`, null, sessionToken, privateKey);
    const active = accounts
      .map(a => a.MonetaryAccountBank || a.MonetaryAccount)
      .filter(a => a && a.status === 'ACTIVE');
    if (active.length > 0) {
      accountId = String(active[0].id);
      setSetting('account_id', accountId);
    }
  }

  // 6. Register webhook for MUTATION events
  const webhookUrl = process.env.BUNQ_WEBHOOK_URL;
  if (webhookUrl) {
    await bunqRequest('POST', `/v1/user/${userId}/notification-filter-url`, {
      notification_filters: [{
        notification_delivery_method: 'URL',
        notification_target: webhookUrl,
        category: 'MUTATION',
      }],
    }, sessionToken, privateKey);
  }

  return { userId, accountId };
}

// ── Fetch payments ─────────────────────────────────────────────────────────

async function getPayments(newerThanId) {
  await ensureSession();
  const sessionToken = getSetting('session_token');
  const privateKey = getSetting('private_key');
  const userId = getSetting('user_id');
  const accountId = process.env.BUNQ_ACCOUNT_ID || getSetting('account_id');
  if (!accountId) throw new Error('No Bunq account ID configured');

  let endpoint = `/v1/user/${userId}/monetary-account/${accountId}/payment?count=50`;
  if (newerThanId) endpoint += `&newer_id=${newerThanId}`;

  const resp = await bunqRequest('GET', endpoint, null, sessionToken, privateKey);
  return (resp || []).map(r => r.Payment).filter(Boolean);
}

// ── Payment → Transaction mapping ─────────────────────────────────────────

function paymentToTransaction(payment) {
  const amount = parseFloat(payment.amount?.value ?? '0');
  const endBalance = payment.balance_after_mutation
    ? parseFloat(payment.balance_after_mutation.value)
    : null;
  const startBalance = endBalance !== null ? Math.round((endBalance - amount) * 100) / 100 : null;

  return {
    id: `bunq_${payment.id}`,
    bunqId: String(payment.id),
    date: payment.created.substring(0, 10),
    amount,
    paidTo: payment.counterparty_alias?.display_name || '',
    bankText: payment.description || '',
    endBalance,
    startBalance,
    type: 'One off',
    category: '',
    subCategory: '',
    comment: '',
    budgeted: '',
    excludeFromAnalytics: false,
  };
}

function isConnected() {
  return !!(getSetting('installation_token') && getSetting('session_token'));
}

module.exports = { setup, ensureSession, getPayments, paymentToTransaction, verifyWebhook, getSetting, setSetting, isConnected };
