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
exports.pollAllInboxes = void 0;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const upsertInboxItem = async (item) => {
    await (0, db_1.getPool)().query(`
    INSERT INTO inbox_items
      (id, studio_id, account_id, platform, platform_item_id, type, author_name, author_platform_id, body, status, received_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unread', NOW())
    ON CONFLICT(account_id, platform_item_id) DO NOTHING
  `, [item.id, item.studio_id, item.account_id, item.platform, item.platform_item_id, item.type,
        item.author_name, item.author_id, item.body]);
};
/** Update a JSON extra field by key in the accounts table */
const updateAccountExtraKey = async (accountId, key, value) => {
    // Fetch current extra, merge in application code, write back
    const { rows } = await (0, db_1.getPool)().query('SELECT extra FROM accounts WHERE id=$1', [accountId]);
    const current = rows[0];
    let parsed = {};
    try {
        parsed = JSON.parse(current?.extra ?? '{}');
    }
    catch { /* use empty */ }
    parsed[key] = value;
    await (0, db_1.getPool)().query('UPDATE accounts SET extra=$1 WHERE id=$2', [JSON.stringify(parsed), accountId]);
};
// ─── Bluesky ──────────────────────────────────────────────────────────────────
const pollBluesky = async (account) => {
    const { BskyAgent } = await Promise.resolve().then(() => __importStar(require('@atproto/api')));
    const extra = JSON.parse(account.extra);
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent.session = {
        did: extra.did, handle: account.display_name, email: undefined,
        accessJwt: (0, crypto_1.decryptToken)(account.access_token),
        refreshJwt: account.refresh_token ? (0, crypto_1.decryptToken)(account.refresh_token) : '',
        active: true,
    };
    const res = await agent.listNotifications({ limit: 25, cursor: extra.cursor });
    const notifications = res.data.notifications.filter(n => ['mention', 'reply'].includes(n.reason));
    for (const notif of notifications) {
        const record = notif.record;
        await upsertInboxItem({
            id: (0, uuid_1.v4)(),
            studio_id: account.studio_id,
            account_id: account.id,
            platform: 'bluesky',
            platform_item_id: notif.uri,
            type: notif.reason,
            author_name: notif.author.displayName ?? notif.author.handle,
            author_id: notif.author.did,
            body: record?.text ?? null,
        });
    }
    if (res.data.cursor) {
        await updateAccountExtraKey(account.id, 'cursor', res.data.cursor);
    }
};
// ─── Facebook ─────────────────────────────────────────────────────────────────
const pollFacebook = async (account) => {
    const token = (0, crypto_1.decryptToken)(account.access_token);
    const extra = JSON.parse(account.extra);
    const since = extra.since ?? Math.floor(Date.now() / 1000) - 86400;
    const res = await axios_1.default.get(`https://graph.facebook.com/v19.0/${account.platform_id}/conversations`, { params: { fields: 'messages{from,message,created_time}', since, access_token: token }, timeout: 15000 });
    for (const conv of res.data.data ?? []) {
        await upsertInboxItem({
            id: (0, uuid_1.v4)(),
            studio_id: account.studio_id,
            account_id: account.id,
            platform: 'facebook',
            platform_item_id: conv.id,
            type: 'message',
            author_name: conv.from?.name ?? null,
            author_id: conv.from?.id ?? null,
            body: conv.message ?? null,
        });
    }
    await updateAccountExtraKey(account.id, 'since', Math.floor(Date.now() / 1000));
};
// ─── LinkedIn ─────────────────────────────────────────────────────────────────
const pollLinkedIn = async (account) => {
    const token = (0, crypto_1.decryptToken)(account.access_token);
    const extra = JSON.parse(account.extra);
    const params = {
        q: 'socialActivities',
        authors: `List(urn:li:person:${account.platform_id})`,
        count: 20,
    };
    if (extra.since)
        params.start = extra.since;
    const res = await axios_1.default.get('https://api.linkedin.com/v2/socialActions', { headers: { Authorization: `Bearer ${token}` }, params, timeout: 15000 }).catch(() => ({ data: { elements: [] } }));
    for (const el of res.data.elements ?? []) {
        await upsertInboxItem({
            id: (0, uuid_1.v4)(),
            studio_id: account.studio_id,
            account_id: account.id,
            platform: 'linkedin',
            platform_item_id: el.id,
            type: 'comment',
            author_name: el.actor ?? null,
            author_id: el.actor ?? null,
            body: el.message?.text ?? null,
        });
    }
    await updateAccountExtraKey(account.id, 'since', Date.now());
};
// ─── Discord (bot) ────────────────────────────────────────────────────────────
const pollDiscord = async (account) => {
    const extra = JSON.parse(account.extra);
    if (!extra.channel_id)
        return;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken)
        return;
    const params = { limit: 25 };
    if (extra.last_message_id)
        params.after = extra.last_message_id;
    const res = await axios_1.default.get(`https://discord.com/api/v10/channels/${extra.channel_id}/messages`, { headers: { Authorization: `Bot ${botToken}` }, params, timeout: 10000 }).catch(() => ({ data: [] }));
    let lastId = extra.last_message_id;
    for (const msg of res.data ?? []) {
        await upsertInboxItem({
            id: (0, uuid_1.v4)(),
            studio_id: account.studio_id,
            account_id: account.id,
            platform: 'discord',
            platform_item_id: msg.id,
            type: 'message',
            author_name: msg.author?.username ?? null,
            author_id: msg.author?.id ?? null,
            body: msg.content ?? null,
        });
        if (!lastId || msg.id > lastId)
            lastId = msg.id;
    }
    if (lastId && lastId !== extra.last_message_id) {
        await updateAccountExtraKey(account.id, 'last_message_id', lastId);
    }
};
// ─── Slack ────────────────────────────────────────────────────────────────────
const pollSlack = async (account) => {
    const token = (0, crypto_1.decryptToken)(account.access_token);
    const extra = JSON.parse(account.extra);
    if (!extra.channel_id)
        return;
    const params = { channel: extra.channel_id, limit: 25 };
    if (extra.oldest)
        params.oldest = extra.oldest;
    const res = await axios_1.default.get('https://slack.com/api/conversations.history', { headers: { Authorization: `Bearer ${token}` }, params, timeout: 10000 }).catch(() => ({ data: { ok: false, messages: [] } }));
    if (!res.data.ok)
        return;
    let newest = extra.oldest;
    for (const msg of res.data.messages ?? []) {
        await upsertInboxItem({
            id: (0, uuid_1.v4)(),
            studio_id: account.studio_id,
            account_id: account.id,
            platform: 'slack',
            platform_item_id: msg.ts,
            type: 'message',
            author_name: msg.username ?? msg.user ?? null,
            author_id: msg.user ?? null,
            body: msg.text ?? null,
        });
        if (!newest || msg.ts > newest)
            newest = msg.ts;
    }
    if (newest && newest !== extra.oldest) {
        await updateAccountExtraKey(account.id, 'oldest', newest);
    }
};
// ─── Main poller ──────────────────────────────────────────────────────────────
const pollAllInboxes = async () => {
    const { rows: accounts } = await (0, db_1.getPool)().query(`SELECT * FROM accounts WHERE status='active' AND platform IN ('bluesky','facebook','linkedin','discord','slack')`);
    for (const account of accounts) {
        try {
            switch (account.platform) {
                case 'bluesky':
                    await pollBluesky(account);
                    break;
                case 'facebook':
                    await pollFacebook(account);
                    break;
                case 'linkedin':
                    await pollLinkedIn(account);
                    break;
                case 'discord':
                    await pollDiscord(account);
                    break;
                case 'slack':
                    await pollSlack(account);
                    break;
            }
        }
        catch (err) {
            console.error(`[inbox] poll failed for ${account.platform} account ${account.id}:`, err);
            // Mark expired if auth error
            if (axios_1.default.isAxiosError(err) && err.response?.status === 401) {
                await (0, db_1.updateAccountStatus)(account.id, 'expired');
            }
        }
    }
};
exports.pollAllInboxes = pollAllInboxes;
//# sourceMappingURL=inboxPollers.js.map