"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const planGating_1 = require("../utils/planGating");
const bluesky_1 = require("../adapters/bluesky");
const router = (0, express_1.Router)();
// ─── List accounts ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const accounts = (0, db_1.getAccountsByStudio)(req.studioId).map(a => ({
        id: a.id, type: a.type, platform: a.platform, platform_id: a.platform_id,
        display_name: a.display_name, avatar_url: a.avatar_url,
        token_expires_at: a.token_expires_at, status: a.status, connected_at: a.connected_at,
        extra: JSON.parse(a.extra),
    }));
    res.json({ accounts });
});
// ─── Account health ───────────────────────────────────────────────────────────
router.get('/:id/health', (req, res) => {
    const account = (0, db_1.getAccountById)(req.params.id);
    if (!account || account.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, account.platform);
    res.json({ status: account.status, token_expires_at: account.token_expires_at, rate_limit: rl });
});
// ─── Disconnect ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const account = (0, db_1.getAccountById)(req.params.id);
    if (!account || account.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    (0, db_1.deleteAccount)(req.params.id);
    res.json({ ok: true });
});
// ─── Bluesky connection ───────────────────────────────────────────────────────
router.post('/connect/bluesky', async (req, res) => {
    const { handle, app_password, account_type = 'company' } = req.body;
    if (!handle || !app_password) {
        res.status(400).json({ error: 'handle and app_password required' });
        return;
    }
    const quota = await (0, planGating_1.checkAccountLimit)(req.studioId);
    if (!quota.allowed) {
        res.status(402).json({ error: `Account limit reached (${quota.current}/${quota.max}) on your ${quota.plan} plan. Upgrade to connect more accounts.` });
        return;
    }
    try {
        const session = await (0, bluesky_1.createBlueskySession)(handle, app_password);
        const id = (0, uuid_1.v4)();
        const account = (0, db_1.upsertAccount)({
            id,
            studio_id: req.studioId,
            owner_user_id: account_type === 'personal' ? req.mediafoxUser.userId : null,
            type: account_type,
            platform: 'bluesky',
            platform_id: session.did,
            display_name: `@${session.handle}`,
            avatar_url: null,
            access_token: (0, crypto_1.encryptToken)(session.accessJwt),
            refresh_token: (0, crypto_1.encryptToken)(session.refreshJwt),
            token_expires_at: null,
            scope: null,
            extra: JSON.stringify({ did: session.did }),
        });
        res.json({ account: { id: account.id, platform: 'bluesky', display_name: account.display_name } });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        res.status(400).json({ error: msg });
    }
});
// ─── Discord Webhook connection ───────────────────────────────────────────────
router.post('/connect/discord/webhook', async (req, res) => {
    const { webhook_url, display_name, account_type = 'company' } = req.body;
    if (!webhook_url) {
        res.status(400).json({ error: 'webhook_url required' });
        return;
    }
    const quota = await (0, planGating_1.checkAccountLimit)(req.studioId);
    if (!quota.allowed) {
        res.status(402).json({ error: `Account limit reached (${quota.current}/${quota.max}) on your ${quota.plan} plan. Upgrade to connect more accounts.` });
        return;
    }
    // Validate by sending a test ping
    try {
        await axios_1.default.post(`${webhook_url}?wait=true`, {
            embeds: [{ description: '✅ MediaFox connected', color: 0x5865f2 }],
        }, { timeout: 10000 });
    }
    catch {
        res.status(400).json({ error: 'Failed to validate webhook URL — check it is correct and the channel exists' });
        return;
    }
    const id = (0, uuid_1.v4)();
    const parts = webhook_url.split('/');
    const platformId = parts[parts.length - 2] ?? id;
    const account = (0, db_1.upsertAccount)({
        id,
        studio_id: req.studioId,
        owner_user_id: account_type === 'personal' ? req.mediafoxUser.userId : null,
        type: account_type,
        platform: 'discord',
        platform_id: platformId,
        display_name: display_name || 'Discord Webhook',
        avatar_url: null,
        access_token: (0, crypto_1.encryptToken)('webhook-only'),
        refresh_token: null,
        token_expires_at: null,
        scope: 'webhook',
        extra: JSON.stringify({ webhook_url: (0, crypto_1.encryptToken)(webhook_url) }),
    });
    res.json({ account: { id: account.id, platform: 'discord', display_name: account.display_name } });
});
// ─── Slack OAuth ──────────────────────────────────────────────────────────────
router.get('/connect/slack', (req, res) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) {
        res.status(503).json({ error: 'Slack integration not configured' });
        return;
    }
    const state = Buffer.from(JSON.stringify({ studioId: req.studioId, type: req.query.account_type ?? 'company' })).toString('base64');
    const scopes = 'chat:write,channels:read,channels:history,reactions:read';
    const redirect = process.env.SLACK_REDIRECT_URI;
    res.json({ url: `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirect}&state=${state}` });
});
router.get('/connect/slack/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
        res.status(400).send('Invalid callback');
        return;
    }
    const { studioId, type } = JSON.parse(Buffer.from(state, 'base64').toString());
    try {
        const tokenRes = await axios_1.default.post('https://slack.com/api/oauth.v2.access', new URLSearchParams({
            code,
            client_id: process.env.SLACK_CLIENT_ID,
            client_secret: process.env.SLACK_CLIENT_SECRET,
            redirect_uri: process.env.SLACK_REDIRECT_URI,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
        if (!tokenRes.data.ok)
            throw new Error('Slack token exchange failed');
        const { access_token, team } = tokenRes.data;
        // Fetch default channel list
        const chanRes = await axios_1.default.get('https://slack.com/api/conversations.list', { headers: { Authorization: `Bearer ${access_token}` }, params: { limit: 20 }, timeout: 10000 });
        const firstChannel = chanRes.data.channels?.[0];
        (0, db_1.upsertAccount)({
            id: (0, uuid_1.v4)(),
            studio_id: studioId,
            owner_user_id: null,
            type: type,
            platform: 'slack',
            platform_id: team.id,
            display_name: team.name,
            avatar_url: null,
            access_token: (0, crypto_1.encryptToken)(access_token),
            refresh_token: null,
            token_expires_at: null,
            scope: 'chat:write,channels:read,channels:history',
            extra: JSON.stringify({ workspace_id: team.id, channel_id: firstChannel?.id ?? '', channel_name: firstChannel?.name ?? '' }),
        });
        res.redirect(`/?connected=slack&workspace=${encodeURIComponent(team.name)}`);
    }
    catch (err) {
        console.error('Slack OAuth error:', err);
        res.status(500).send('Slack connection failed');
    }
});
// ─── Meta OAuth (Facebook + Instagram) ───────────────────────────────────────
router.get('/connect/meta', (req, res) => {
    const appId = process.env.META_APP_ID;
    if (!appId) {
        res.status(503).json({ error: 'Meta integration not configured. META_APP_ID is not set.' });
        return;
    }
    const state = Buffer.from(JSON.stringify({ studioId: req.studioId, type: req.query.account_type ?? 'company' })).toString('base64');
    const scopes = 'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,instagram_manage_insights';
    const redirect = process.env.META_REDIRECT_URI;
    res.json({ url: `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scopes}&state=${state}&response_type=code` });
});
router.get('/connect/meta/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
        res.status(400).send('Invalid callback');
        return;
    }
    const { studioId, type } = JSON.parse(Buffer.from(state, 'base64').toString());
    try {
        // Exchange code for short-lived token
        const tokenRes = await axios_1.default.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                redirect_uri: process.env.META_REDIRECT_URI,
                code,
            },
            timeout: 15000,
        });
        const shortToken = tokenRes.data.access_token;
        // Exchange for long-lived token (60 days)
        const llRes = await axios_1.default.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                fb_exchange_token: shortToken,
            },
            timeout: 15000,
        });
        const longToken = llRes.data.access_token;
        const expiresAt = new Date(Date.now() + llRes.data.expires_in * 1000).toISOString();
        // Get Pages and their tokens
        const { getFacebookPages } = await Promise.resolve().then(() => __importStar(require('../adapters/facebook')));
        const pages = await getFacebookPages(longToken);
        for (const page of pages) {
            (0, db_1.upsertAccount)({
                id: (0, uuid_1.v4)(),
                studio_id: studioId,
                owner_user_id: null,
                type: type,
                platform: 'facebook',
                platform_id: page.id,
                display_name: page.name,
                avatar_url: null,
                access_token: (0, crypto_1.encryptToken)(page.access_token),
                refresh_token: null,
                token_expires_at: expiresAt,
                scope: 'pages_manage_posts,pages_read_engagement',
                extra: JSON.stringify({ page_id: page.id }),
            });
            // Check for linked Instagram business account
            try {
                const { getInstagramAccounts } = await Promise.resolve().then(() => __importStar(require('../adapters/instagram')));
                const igAccounts = await getInstagramAccounts(page.access_token, page.id);
                for (const ig of igAccounts) {
                    (0, db_1.upsertAccount)({
                        id: (0, uuid_1.v4)(),
                        studio_id: studioId,
                        owner_user_id: null,
                        type: type,
                        platform: 'instagram',
                        platform_id: ig.id,
                        display_name: `@${ig.username}`,
                        avatar_url: null,
                        access_token: (0, crypto_1.encryptToken)(page.access_token),
                        refresh_token: null,
                        token_expires_at: expiresAt,
                        scope: 'instagram_basic,instagram_content_publish',
                        extra: JSON.stringify({ page_id: page.id, page_access_token: (0, crypto_1.encryptToken)(page.access_token) }),
                    });
                }
            }
            catch {
                // No Instagram account linked to this page
            }
        }
        res.redirect(`/?connected=meta&pages=${pages.length}`);
    }
    catch (err) {
        console.error('Meta OAuth error:', err);
        res.status(500).send('Meta connection failed');
    }
});
// ─── LinkedIn OAuth ───────────────────────────────────────────────────────────
router.get('/connect/linkedin', (req, res) => {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
        res.status(503).json({ error: 'LinkedIn integration not configured. LINKEDIN_CLIENT_ID is not set.' });
        return;
    }
    const state = Buffer.from(JSON.stringify({ studioId: req.studioId, type: req.query.account_type ?? 'company' })).toString('base64');
    const scopes = 'r_basicprofile,w_member_social,r_organization_social,w_organization_social';
    const redirect = process.env.LINKEDIN_REDIRECT_URI;
    res.json({ url: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&scope=${encodeURIComponent(scopes)}&state=${state}` });
});
router.get('/connect/linkedin/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
        res.status(400).send('Invalid callback');
        return;
    }
    const { studioId, type } = JSON.parse(Buffer.from(state, 'base64').toString());
    try {
        const tokenRes = await axios_1.default.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: process.env.LINKEDIN_CLIENT_ID,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET,
            redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
        const { access_token, expires_in } = tokenRes.data;
        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
        const { getLinkedInProfile } = await Promise.resolve().then(() => __importStar(require('../adapters/linkedin')));
        const profile = await getLinkedInProfile(access_token);
        const name = `${profile.localizedFirstName} ${profile.localizedLastName}`.trim();
        (0, db_1.upsertAccount)({
            id: (0, uuid_1.v4)(),
            studio_id: studioId,
            owner_user_id: type === 'personal' ? req.mediafoxUser?.userId ?? null : null,
            type: type,
            platform: 'linkedin',
            platform_id: profile.id,
            display_name: name,
            avatar_url: null,
            access_token: (0, crypto_1.encryptToken)(access_token),
            refresh_token: null,
            token_expires_at: expiresAt,
            scope: 'r_basicprofile,w_member_social',
            extra: JSON.stringify({}),
        });
        res.redirect(`/?connected=linkedin&name=${encodeURIComponent(name)}`);
    }
    catch (err) {
        console.error('LinkedIn OAuth error:', err);
        res.status(500).send('LinkedIn connection failed');
    }
});
// ─── Token refresh ────────────────────────────────────────────────────────────
router.post('/:id/refresh', async (req, res) => {
    const account = (0, db_1.getAccountById)(req.params.id);
    if (!account || account.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    // Only Bluesky supports programmatic refresh currently
    if (account.platform === 'bluesky' && account.refresh_token) {
        try {
            const refreshJwt = (await Promise.resolve().then(() => __importStar(require('../utils/crypto')))).decryptToken(account.refresh_token);
            const r = await axios_1.default.post('https://bsky.social/xrpc/com.atproto.server.refreshSession', null, {
                headers: { Authorization: `Bearer ${refreshJwt}` }, timeout: 10000,
            });
            const d = r.data;
            (0, db_1.updateAccountTokens)(account.id, (0, crypto_1.encryptToken)(d.accessJwt), (0, crypto_1.encryptToken)(d.refreshJwt), null);
            res.json({ ok: true });
        }
        catch {
            res.status(400).json({ error: 'Refresh failed — please reconnect your Bluesky account' });
        }
        return;
    }
    res.json({ ok: false, message: 'Manual reconnection required for this platform' });
});
exports.default = router;
//# sourceMappingURL=accounts.js.map