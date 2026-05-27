"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.parseFoxAuthToken = exports.parseOwnAuthToken = exports.requireCsrfProtection = exports.hasValidCsrfToken = exports.issueCsrfToken = exports.clearAuthCookie = exports.setAuthCookie = exports.issueAuthToken = exports.isAuthEnabled = exports.CSRF_HEADER = exports.CSRF_COOKIE = exports.AUTH_COOKIE = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.AUTH_COOKIE = 'mediafox_auth';
exports.CSRF_COOKIE = 'mediafox_csrf';
exports.CSRF_HEADER = 'x-csrf-token';
const FOXAUTH_COOKIE = 'fox_auth';
const DEV_BYPASS_USER = {
    userId: 'local-dev-user',
    email: 'local-dev@mediafox',
    name: 'Local Dev',
    role: 'admin',
};
const isAuthEnabled = () => {
    if (process.env.AUTH_ENABLED)
        return process.env.AUTH_ENABLED === 'true';
    return process.env.NODE_ENV === 'production';
};
exports.isAuthEnabled = isAuthEnabled;
const canUseDevBypass = () => {
    if ((0, exports.isAuthEnabled)())
        return false;
    if (process.env.NODE_ENV === 'production')
        return false;
    return process.env.AUTH_DEV_BYPASS === 'true';
};
const getJwtSecret = () => {
    const s = (process.env.MEDIAFOX_JWT_SECRET || '').trim();
    if (!s)
        throw new Error('MEDIAFOX_JWT_SECRET is required when auth is enabled');
    return s;
};
const getFoxAuthSecret = () => process.env.FOXAUTH_JWT_SECRET || '';
const isSecureRequest = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https';
// ─── Own auth cookie ──────────────────────────────────────────────────────────
const issueAuthToken = (user) => jsonwebtoken_1.default.sign(user, getJwtSecret(), { expiresIn: '12h' });
exports.issueAuthToken = issueAuthToken;
const setAuthCookie = (req, res, token) => {
    res.cookie(exports.AUTH_COOKIE, token, {
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000,
    });
};
exports.setAuthCookie = setAuthCookie;
const clearAuthCookie = (req, res) => {
    res.clearCookie(exports.AUTH_COOKIE, { httpOnly: true, secure: isSecureRequest(req), sameSite: 'lax' });
    res.clearCookie(exports.CSRF_COOKIE, { httpOnly: true, secure: isSecureRequest(req), sameSite: 'lax' });
};
exports.clearAuthCookie = clearAuthCookie;
// ─── CSRF ─────────────────────────────────────────────────────────────────────
const isValidCsrfToken = (raw) => Boolean(raw && /^[a-f0-9]{64}$/i.test(raw.trim()));
const issueCsrfToken = (req, res) => {
    const existing = String(req.cookies?.[exports.CSRF_COOKIE] || '').trim();
    const token = isValidCsrfToken(existing) ? existing : crypto_1.default.randomBytes(32).toString('hex');
    res.cookie(exports.CSRF_COOKIE, token, {
        httpOnly: true,
        secure: isSecureRequest(req),
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000,
    });
    return token;
};
exports.issueCsrfToken = issueCsrfToken;
const hasValidCsrfToken = (req) => {
    const cookieToken = String(req.cookies?.[exports.CSRF_COOKIE] || '').trim();
    const headerRaw = req.headers[exports.CSRF_HEADER];
    const headerToken = Array.isArray(headerRaw)
        ? String(headerRaw[0] || '').trim()
        : String(headerRaw || '').trim();
    if (!isValidCsrfToken(cookieToken) || !isValidCsrfToken(headerToken))
        return false;
    const a = Buffer.from(cookieToken, 'utf8');
    const b = Buffer.from(headerToken, 'utf8');
    if (a.length !== b.length)
        return false;
    return crypto_1.default.timingSafeEqual(a, b);
};
exports.hasValidCsrfToken = hasValidCsrfToken;
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const requireCsrfProtection = (req, res, next) => {
    if (CSRF_SAFE_METHODS.has(req.method.toUpperCase())) {
        next();
        return;
    }
    if (!(0, exports.hasValidCsrfToken)(req)) {
        res.status(403).json({ error: 'Invalid CSRF token' });
        return;
    }
    next();
};
exports.requireCsrfProtection = requireCsrfProtection;
// ─── Token parsing ────────────────────────────────────────────────────────────
const parseOwnAuthToken = (req) => {
    const token = req.cookies?.[exports.AUTH_COOKIE];
    if (!token)
        return null;
    try {
        return jsonwebtoken_1.default.verify(token, getJwtSecret());
    }
    catch {
        return null;
    }
};
exports.parseOwnAuthToken = parseOwnAuthToken;
const parseFoxAuthToken = (req) => {
    const token = req.cookies?.[FOXAUTH_COOKIE];
    if (!token)
        return null;
    const secret = getFoxAuthSecret();
    if (!secret)
        return null;
    try {
        const claims = jsonwebtoken_1.default.verify(token, secret);
        if (!claims?.sub || !claims?.email)
            return null;
        return claims;
    }
    catch {
        return null;
    }
};
exports.parseFoxAuthToken = parseFoxAuthToken;
// ─── requireAuth ──────────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
    if (!(0, exports.isAuthEnabled)()) {
        if (!canUseDevBypass()) {
            res.status(403).json({ error: 'Auth disabled but AUTH_DEV_BYPASS not set.' });
            return;
        }
        req.mediafoxUser = DEV_BYPASS_USER;
        next();
        return;
    }
    const ownUser = (0, exports.parseOwnAuthToken)(req);
    if (ownUser) {
        req.mediafoxUser = ownUser;
        next();
        return;
    }
    const foxClaims = (0, exports.parseFoxAuthToken)(req);
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
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.js.map