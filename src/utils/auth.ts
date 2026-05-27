import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface MediaFoxUser {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface FoxAuthClaims {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  approved: boolean;
}

export const AUTH_COOKIE = 'mediafox_auth';
export const CSRF_COOKIE = 'mediafox_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const FOXAUTH_COOKIE = 'fox_auth';

const DEV_BYPASS_USER: MediaFoxUser = {
  userId: 'local-dev-user',
  email: 'local-dev@mediafox',
  name: 'Local Dev',
  role: 'admin',
};

export const isAuthEnabled = (): boolean => {
  if (process.env.AUTH_ENABLED) return process.env.AUTH_ENABLED === 'true';
  return process.env.NODE_ENV === 'production';
};

const canUseDevBypass = (): boolean => {
  if (isAuthEnabled()) return false;
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.AUTH_DEV_BYPASS === 'true';
};

const getJwtSecret = (): string => {
  const s = (process.env.MEDIAFOX_JWT_SECRET || '').trim();
  if (!s) throw new Error('MEDIAFOX_JWT_SECRET is required when auth is enabled');
  return s;
};

const getFoxAuthSecret = (): string => process.env.FOXAUTH_JWT_SECRET || '';

const isSecureRequest = (req: Request): boolean =>
  req.secure || req.headers['x-forwarded-proto'] === 'https';

// ─── Own auth cookie ──────────────────────────────────────────────────────────

export const issueAuthToken = (user: MediaFoxUser): string =>
  jwt.sign(user, getJwtSecret(), { expiresIn: '12h' });

export const setAuthCookie = (req: Request, res: Response, token: string): void => {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
};

export const clearAuthCookie = (req: Request, res: Response): void => {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, secure: isSecureRequest(req), sameSite: 'lax' });
  res.clearCookie(CSRF_COOKIE, { httpOnly: true, secure: isSecureRequest(req), sameSite: 'lax' });
};

// ─── CSRF ─────────────────────────────────────────────────────────────────────

const isValidCsrfToken = (raw: string | undefined | null): raw is string =>
  Boolean(raw && /^[a-f0-9]{64}$/i.test(raw.trim()));

export const issueCsrfToken = (req: Request, res: Response): string => {
  const existing = String(req.cookies?.[CSRF_COOKIE] || '').trim();
  const token = isValidCsrfToken(existing) ? existing : crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
  return token;
};

export const hasValidCsrfToken = (req: Request): boolean => {
  const cookieToken = String(req.cookies?.[CSRF_COOKIE] || '').trim();
  const headerRaw = req.headers[CSRF_HEADER];
  const headerToken = Array.isArray(headerRaw)
    ? String(headerRaw[0] || '').trim()
    : String(headerRaw || '').trim();
  if (!isValidCsrfToken(cookieToken) || !isValidCsrfToken(headerToken)) return false;
  const a = Buffer.from(cookieToken, 'utf8');
  const b = Buffer.from(headerToken, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireCsrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  if (CSRF_SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (!hasValidCsrfToken(req)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
};

// ─── Token parsing ────────────────────────────────────────────────────────────

export const parseOwnAuthToken = (req: Request): MediaFoxUser | null => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret()) as MediaFoxUser;
  } catch { return null; }
};

export const parseFoxAuthToken = (req: Request): FoxAuthClaims | null => {
  const token = req.cookies?.[FOXAUTH_COOKIE];
  if (!token) return null;
  const secret = getFoxAuthSecret();
  if (!secret) return null;
  try {
    const claims = jwt.verify(token, secret) as FoxAuthClaims;
    if (!claims?.sub || !claims?.email) return null;
    return claims;
  } catch { return null; }
};

// ─── requireAuth ──────────────────────────────────────────────────────────────

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!isAuthEnabled()) {
    if (!canUseDevBypass()) {
      res.status(403).json({ error: 'Auth disabled but AUTH_DEV_BYPASS not set.' });
      return;
    }
    req.mediafoxUser = DEV_BYPASS_USER;
    next();
    return;
  }

  const ownUser = parseOwnAuthToken(req);
  if (ownUser) {
    req.mediafoxUser = ownUser;
    next();
    return;
  }

  const foxClaims = parseFoxAuthToken(req);
  if (foxClaims?.approved) {
    req.mediafoxUser = {
      userId: foxClaims.sub,
      email: foxClaims.email,
      name: foxClaims.name,
      role: foxClaims.role,
    };
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required', authEnabled: true });
};

declare global {
  namespace Express {
    interface Request {
      mediafoxUser?: MediaFoxUser;
      studioId?: string;
    }
  }
}
