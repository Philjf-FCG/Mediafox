"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshExpiringTokens = void 0;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const refreshBluesky = async (account) => {
    if (!account.refresh_token) {
        (0, db_1.updateAccountStatus)(account.id, 'expired');
        return;
    }
    const refreshJwt = (0, crypto_1.decryptToken)(account.refresh_token);
    const res = await axios_1.default.post('https://bsky.social/xrpc/com.atproto.server.refreshSession', null, { headers: { Authorization: `Bearer ${refreshJwt}` }, timeout: 10000 });
    (0, db_1.updateAccountTokens)(account.id, (0, crypto_1.encryptToken)(res.data.accessJwt), (0, crypto_1.encryptToken)(res.data.refreshJwt), null);
    (0, db_1.updateAccountStatus)(account.id, 'active');
};
const refreshLinkedIn = async (account) => {
    if (!account.refresh_token) {
        (0, db_1.updateAccountStatus)(account.id, 'expired');
        return;
    }
    try {
        const refreshToken = (0, crypto_1.decryptToken)(account.refresh_token);
        const res = await axios_1.default.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: process.env.LINKEDIN_CLIENT_ID,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
        const expiresAt = new Date(Date.now() + res.data.expires_in * 1000).toISOString();
        (0, db_1.updateAccountTokens)(account.id, (0, crypto_1.encryptToken)(res.data.access_token), res.data.refresh_token ? (0, crypto_1.encryptToken)(res.data.refresh_token) : account.refresh_token, expiresAt);
        (0, db_1.updateAccountStatus)(account.id, 'active');
    }
    catch {
        (0, db_1.updateAccountStatus)(account.id, 'expired');
    }
};
const refreshExpiringTokens = async () => {
    // Refresh tokens expiring within the next 7 days
    const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const accounts = (0, db_1.getDb)()
        .prepare(`SELECT * FROM accounts WHERE status='active' AND token_expires_at IS NOT NULL AND token_expires_at < ?`)
        .all(threshold);
    for (const account of accounts) {
        try {
            if (account.platform === 'bluesky')
                await refreshBluesky(account);
            else if (account.platform === 'linkedin')
                await refreshLinkedIn(account);
            // Meta tokens can be exchanged for new long-lived tokens before expiry
            else if (account.platform === 'facebook' || account.platform === 'instagram') {
                if (!process.env.META_APP_ID || !process.env.META_APP_SECRET)
                    continue;
                const accessToken = (0, crypto_1.decryptToken)(account.access_token);
                const res = await axios_1.default.get('https://graph.facebook.com/v19.0/oauth/access_token', {
                    params: {
                        grant_type: 'fb_exchange_token',
                        client_id: process.env.META_APP_ID,
                        client_secret: process.env.META_APP_SECRET,
                        fb_exchange_token: accessToken,
                    },
                    timeout: 10000,
                });
                const expiresAt = new Date(Date.now() + res.data.expires_in * 1000).toISOString();
                (0, db_1.updateAccountTokens)(account.id, (0, crypto_1.encryptToken)(res.data.access_token), null, expiresAt);
                (0, db_1.updateAccountStatus)(account.id, 'active');
            }
        }
        catch (err) {
            console.error(`Token refresh failed for account ${account.id} (${account.platform}):`, err);
        }
    }
};
exports.refreshExpiringTokens = refreshExpiringTokens;
//# sourceMappingURL=tokenRefresh.js.map