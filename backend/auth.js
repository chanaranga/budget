const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ALLOWED_EMAILS = ['chanaranga@gmail.com', 'umeaha.alwis@gmail.com'];

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: auth.slice(7),
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!ALLOWED_EMAILS.includes(payload.email)) {
      return res.status(403).json({ error: `Access denied for ${payload.email}` });
    }
    req.user = { email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
