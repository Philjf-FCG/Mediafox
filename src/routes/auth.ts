import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import {
  isAuthEnabled,
  issueAuthToken,
  issueCsrfToken,
  clearAuthCookie,
  setAuthCookie,
  parseOwnAuthToken,
  parseFoxAuthToken,
} from '../utils/auth';
import { getUserByEmail, createUser, updateUser } from '../utils/db';

dotenv.config();

const router = Router();

const ADMIN_EMAILS = new Set(
  (process.env.AUTH_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
);

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const ensureAdmins = (): void => {
  for (const email of ADMIN_EMAILS) {
    try {
      const existing = getUserByEmail(email);
      if (!existing) {
        createUser({ email, name: '', status: 'approved', role: 'admin' });
      } else if (existing.status !== 'approved' || existing.role !== 'admin') {
        updateUser(existing.id, { status: 'approved', role: 'admin' });
      }
    } catch { /* ignore if db not ready */ }
  }
};

ensureAdmins();

// GET /api/auth/csrf — issue CSRF token
router.get('/csrf', (req: Request, res: Response) => {
  const csrfToken = issueCsrfToken(req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ csrfToken });
});

// GET /api/auth/me — probe current auth state
router.get('/me', (req: Request, res: Response) => {
  issueCsrfToken(req, res);

  if (!isAuthEnabled()) {
    res.json({
      authEnabled: false,
      authenticated: true,
      user: { userId: 'local-dev-user', email: 'local-dev@mediafox', name: 'Local Dev', role: 'admin' },
    });
    return;
  }

  const ownUser = parseOwnAuthToken(req);
  if (ownUser) {
    res.json({ authEnabled: true, authenticated: true, user: ownUser });
    return;
  }

  const foxClaims = parseFoxAuthToken(req);
  if (foxClaims?.approved) {
    res.json({
      authEnabled: true,
      authenticated: true,
      user: { userId: foxClaims.sub, email: foxClaims.email, name: foxClaims.name, role: foxClaims.role },
    });
    return;
  }

  res.status(401).json({ authEnabled: true, authenticated: false });
});

// POST /api/auth/google — verify Google ID token, issue session
router.post('/google', async (req: Request, res: Response) => {
  if (!isAuthEnabled()) {
    res.status(400).json({ error: 'Auth is disabled in this environment.' });
    return;
  }
  if (!googleClient) {
    res.status(500).json({ error: 'Google login is not configured.', detail: 'GOOGLE_CLIENT_ID is not set.' });
    return;
  }

  const { credential } = req.body || {};
  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ error: 'Missing Google credential.' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(401).json({ error: 'Invalid Google credential.' });
      return;
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || '';
    const googleSub = payload.sub || '';
    const isAdmin = ADMIN_EMAILS.has(email);

    let user = getUserByEmail(email);
    if (!user) {
      user = createUser({ email, name, google_sub: googleSub, status: isAdmin ? 'approved' : 'pending', role: isAdmin ? 'admin' : 'user' });
    } else {
      updateUser(user.id, { name: name || user.name, google_sub: (googleSub || user.google_sub) ?? undefined });
      user = getUserByEmail(email)!;
    }

    if (user.status === 'pending') {
      res.status(403).json({ status: 'pending', error: 'Access request submitted. An admin must approve your account.' });
      return;
    }
    if (user.status === 'denied') {
      res.status(403).json({ status: 'denied', error: 'Access was denied by an admin.' });
      return;
    }

    updateUser(user.id, { last_login_at: new Date().toISOString() });

    const mfUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: (isAdmin ? 'admin' : user.role) as 'admin' | 'user',
    };

    const token = issueAuthToken(mfUser);
    setAuthCookie(req, res, token);
    issueCsrfToken(req, res);
    res.json({ user: mfUser });
  } catch (err: unknown) {
    res.status(401).json({ error: 'Google sign-in failed.', detail: String((err as Error)?.message || '') });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

export default router;
