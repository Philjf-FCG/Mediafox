"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_auth_library_1 = require("google-auth-library");
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = require("../utils/auth");
const db_1 = require("../utils/db");
dotenv_1.default.config();
const router = (0, express_1.Router)();
const ADMIN_EMAILS = new Set((process.env.AUTH_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean));
const parseList = (raw) => raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
const DEFAULT_GOOGLE_CLIENT_ID = '407954380639-barlsc8co4l6ts5tjcll1sho5djdd72j.apps.googleusercontent.com';
const GOOGLE_CLIENT_IDS = Array.from(new Set([
    DEFAULT_GOOGLE_CLIENT_ID,
    ...parseList(process.env.GOOGLE_CLIENT_IDS || ''),
    ...(process.env.GOOGLE_CLIENT_ID ? [process.env.GOOGLE_CLIENT_ID.trim()] : []),
])).filter(Boolean);
const googleClient = GOOGLE_CLIENT_IDS.length > 0 ? new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_IDS[0]) : null;
const readJwtAudience = (token) => {
    try {
        const parts = token.split('.');
        if (parts.length < 2)
            return null;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return payload.aud || null;
    }
    catch {
        return null;
    }
};
const ensureAdmins = () => {
    for (const email of ADMIN_EMAILS) {
        try {
            const existing = (0, db_1.getUserByEmail)(email);
            if (!existing) {
                (0, db_1.createUser)({ email, name: '', status: 'approved', role: 'admin' });
            }
            else if (existing.status !== 'approved' || existing.role !== 'admin') {
                (0, db_1.updateUser)(existing.id, { status: 'approved', role: 'admin' });
            }
        }
        catch { /* ignore if db not ready */ }
    }
};
ensureAdmins();
// GET /api/auth/csrf — issue CSRF token
router.get('/csrf', (req, res) => {
    const csrfToken = (0, auth_1.issueCsrfToken)(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ csrfToken });
});
// GET /api/auth/me — probe current auth state
router.get('/me', (req, res) => {
    (0, auth_1.issueCsrfToken)(req, res);
    if (!(0, auth_1.isAuthEnabled)()) {
        res.json({
            authEnabled: false,
            authenticated: true,
            user: { userId: 'local-dev-user', email: 'local-dev@mediafox', name: 'Local Dev', role: 'admin' },
        });
        return;
    }
    const ownUser = (0, auth_1.parseOwnAuthToken)(req);
    if (ownUser) {
        res.json({ authEnabled: true, authenticated: true, user: ownUser });
        return;
    }
    const foxClaims = (0, auth_1.parseFoxAuthToken)(req);
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
router.post('/google', async (req, res) => {
    if (!(0, auth_1.isAuthEnabled)()) {
        res.status(400).json({ error: 'Auth is disabled in this environment.' });
        return;
    }
    if (!googleClient) {
        res.status(500).json({ error: 'Google login is not configured.', detail: 'Set GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS.' });
        return;
    }
    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
        res.status(400).json({ error: 'Missing Google credential.' });
        return;
    }
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_IDS });
        const payload = ticket.getPayload();
        if (!payload?.email) {
            res.status(401).json({ error: 'Invalid Google credential.' });
            return;
        }
        const email = payload.email.toLowerCase();
        const name = payload.name || '';
        const googleSub = payload.sub || '';
        const isAdmin = ADMIN_EMAILS.has(email);
        let user = (0, db_1.getUserByEmail)(email);
        if (!user) {
            user = (0, db_1.createUser)({ email, name, google_sub: googleSub, status: isAdmin ? 'approved' : 'pending', role: isAdmin ? 'admin' : 'user' });
        }
        else {
            (0, db_1.updateUser)(user.id, { name: name || user.name, google_sub: (googleSub || user.google_sub) ?? undefined });
            user = (0, db_1.getUserByEmail)(email);
        }
        if (user.status === 'pending') {
            res.status(403).json({ status: 'pending', error: 'Access request submitted. An admin must approve your account.' });
            return;
        }
        if (user.status === 'denied') {
            res.status(403).json({ status: 'denied', error: 'Access was denied by an admin.' });
            return;
        }
        (0, db_1.updateUser)(user.id, { last_login_at: new Date().toISOString() });
        const mfUser = {
            userId: user.id,
            email: user.email,
            name: user.name,
            role: (isAdmin ? 'admin' : user.role),
        };
        const token = (0, auth_1.issueAuthToken)(mfUser);
        (0, auth_1.setAuthCookie)(req, res, token);
        (0, auth_1.issueCsrfToken)(req, res);
        res.json({ user: mfUser });
    }
    catch (err) {
        const audience = readJwtAudience(credential);
        const configured = GOOGLE_CLIENT_IDS.join(', ');
        const message = String(err?.message || '');
        const detail = audience
            ? `${message} (token aud=${audience}; expected one of: ${configured})`
            : message;
        res.status(401).json({ error: 'Google sign-in failed.', detail });
    }
});
// POST /api/auth/logout
router.post('/logout', (req, res) => {
    (0, auth_1.clearAuthCookie)(req, res);
    res.json({ ok: true });
});
exports.default = router;
//# sourceMappingURL=auth.js.map