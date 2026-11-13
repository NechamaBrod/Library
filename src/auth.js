// הגנה בסיסמה לאתר ובטוקן ל-MCP. בלי APP_PASSWORD אין הגנה - מתאים רק להרצה על המחשב האישי.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'library_session';
const SESSION_DAYS = 180;
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

const sha = (s) => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(sha(a), sha(b));

export function createAuth({
  password = process.env.APP_PASSWORD,
  mcpToken = process.env.MCP_TOKEN,
  secret = process.env.SESSION_SECRET,
} = {}) {
  const enabled = Boolean(password);
  const key = sha(`session:${secret || password}`);
  const sign = (exp) => createHmac('sha256', key).update(String(exp)).digest('base64url');
  const attempts = new Map(); // ip -> { count, resetAt }

  function isLoggedIn(req) {
    if (!enabled) return true;
    const raw = (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`));
    if (!raw) return false;
    const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
    return Boolean(exp && sig) && Number(exp) > Date.now() && same(sig, sign(exp));
  }

  function setCookie(req, res, value, maxAgeSec) {
    const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
    if (req.secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  return {
    enabled,

    login(req, res) {
      const now = Date.now();
      const entry = attempts.get(req.ip);
      if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'יותר מדי ניסיונות. נסי שוב בעוד רבע שעה.' });
      }
      if (!enabled || !same(req.body?.password ?? '', password)) {
        if (!entry || entry.resetAt <= now) attempts.set(req.ip, { count: 1, resetAt: now + WINDOW_MS });
        else entry.count++;
        return res.status(401).json({ error: 'סיסמה שגויה' });
      }
      attempts.delete(req.ip);
      const exp = now + SESSION_DAYS * 86400000;
      setCookie(req, res, `${exp}.${sign(exp)}`, SESSION_DAYS * 86400);
      res.status(204).end();
    },

    logout(req, res) {
      setCookie(req, res, '', 0);
      res.status(204).end();
    },

    requireLogin(req, res, next) {
      if (isLoggedIn(req)) return next();
      res.status(401).json({ error: 'נדרשת התחברות' });
    },

    /**
     * MCP: כשיש סיסמה לאתר חייבים טוקן - בכותרת Authorization: Bearer או בסוף הכתובת (/mcp/<token>).
     * בלי MCP_TOKEN נקודת ה-MCP כבויה.
     */
    requireMcpToken(req, res, next) {
      if (!enabled) return next();
      const given = req.params.token ?? req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
      if (mcpToken && given && same(given, mcpToken)) return next();
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
    },
  };
}
