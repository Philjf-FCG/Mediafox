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
const db_1 = require("../utils/db");
const discord_1 = require("../adapters/discord");
const slack_1 = require("../adapters/slack");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("../utils/crypto");
const router = (0, express_1.Router)();
router.get('/', (req, res) => {
    const { platform, status, account_id } = req.query;
    const items = (0, db_1.getInboxItems)(req.studioId, { platform, status, accountId: account_id });
    res.json({ items });
});
router.put('/:id', (req, res) => {
    const { status, assigned_to, internal_note } = req.body;
    (0, db_1.updateInboxItem)(req.params.id, { status, assigned_to, internal_note });
    res.json({ ok: true });
});
router.post('/:id/reply', async (req, res) => {
    const { text, account_id } = req.body;
    if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
    }
    if (!account_id) {
        res.status(400).json({ error: 'account_id is required' });
        return;
    }
    const account = (0, db_1.getAccountById)(account_id);
    if (!account || account.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Account not found' });
        return;
    }
    const db = (await Promise.resolve().then(() => __importStar(require('../utils/db')))).getDb();
    const item = db.prepare('SELECT * FROM inbox_items WHERE id=?').get(req.params.id);
    if (!item) {
        res.status(404).json({ error: 'Inbox item not found' });
        return;
    }
    try {
        switch (account.platform) {
            case 'discord': {
                const extra = JSON.parse(account.extra);
                if (extra.channel_id) {
                    await (0, discord_1.replyToDiscordMessage)(account, extra.channel_id, item.platform_item_id, text);
                }
                break;
            }
            case 'slack': {
                await (0, slack_1.replyToSlackMessage)(account, item.platform_item_id, text);
                break;
            }
            case 'bluesky': {
                const { BskyAgent } = await Promise.resolve().then(() => __importStar(require('@atproto/api')));
                const { decryptToken: dec } = await Promise.resolve().then(() => __importStar(require('../utils/crypto')));
                const extra = JSON.parse(account.extra);
                const agent = new BskyAgent({ service: 'https://bsky.social' });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                agent.session = { did: extra.did, handle: account.display_name, email: undefined, accessJwt: dec(account.access_token), refreshJwt: account.refresh_token ? dec(account.refresh_token) : '', active: true };
                await agent.post({ text, reply: { root: { uri: item.platform_item_id, cid: '' }, parent: { uri: item.platform_item_id, cid: '' } }, createdAt: new Date().toISOString() });
                break;
            }
            case 'facebook': {
                const at = (0, crypto_1.decryptToken)(account.access_token);
                await axios_1.default.post(`https://graph.facebook.com/v19.0/${item.platform_item_id}/comments`, { message: text, access_token: at }, { timeout: 15000 });
                break;
            }
            case 'instagram': {
                const at = (0, crypto_1.decryptToken)(account.access_token);
                await axios_1.default.post(`https://graph.facebook.com/v19.0/${item.platform_item_id}/replies`, { message: text, access_token: at }, { timeout: 15000 });
                break;
            }
            case 'linkedin': {
                const at = (0, crypto_1.decryptToken)(account.access_token);
                await axios_1.default.post('https://api.linkedin.com/v2/socialActions/comments', { actor: `urn:li:person:${account.platform_id}`, message: { text }, object: item.platform_item_id }, { headers: { Authorization: `Bearer ${at}` }, timeout: 15000 });
                break;
            }
        }
        (0, db_1.updateInboxItem)(req.params.id, { status: 'resolved' });
        res.json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Reply failed';
        res.status(500).json({ error: msg });
    }
});
router.post('/:id/note', (req, res) => {
    const { note } = req.body;
    if (!note) {
        res.status(400).json({ error: 'note is required' });
        return;
    }
    (0, db_1.updateInboxItem)(req.params.id, { internal_note: note });
    res.json({ ok: true });
});
exports.default = router;
//# sourceMappingURL=inbox.js.map