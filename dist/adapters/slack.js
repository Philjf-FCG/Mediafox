"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSlackChannels = exports.replyToSlackMessage = exports.publishToSlack = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const getToken = (account) => (0, crypto_1.decryptToken)(account.access_token);
const getChannelId = (account) => {
    const extra = JSON.parse(account.extra);
    if (!extra.channel_id)
        throw new Error('Slack account has no channel_id configured');
    return extra.channel_id;
};
const publishToSlack = async (account, text, blocks, scheduledAt) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'slack');
    if (!rl.allowed)
        throw new Error(`Slack rate limit reached. Resets at ${rl.resetsAt}`);
    const token = getToken(account);
    const channel = getChannelId(account);
    const endpoint = scheduledAt ? 'chat.scheduleMessage' : 'chat.postMessage';
    const body = { channel, text };
    if (blocks?.length)
        body.blocks = blocks;
    if (scheduledAt)
        body.post_at = Math.floor(scheduledAt.getTime() / 1000);
    const res = await axios_1.default.post(`https://slack.com/api/${endpoint}`, body, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    if (!res.data.ok)
        throw new Error(`Slack API error: ${res.data.error}`);
    (0, rateLimit_1.consumeRateLimit)(account.id, 'slack');
    return { platformPostId: res.data.ts ?? res.data.scheduled_message_id ?? 'unknown' };
};
exports.publishToSlack = publishToSlack;
const replyToSlackMessage = async (account, threadTs, text) => {
    const token = getToken(account);
    const channel = getChannelId(account);
    const res = await axios_1.default.post('https://slack.com/api/chat.postMessage', { channel, text, thread_ts: threadTs }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    if (!res.data.ok)
        throw new Error(`Slack reply error: ${res.data.error}`);
    (0, rateLimit_1.consumeRateLimit)(account.id, 'slack');
};
exports.replyToSlackMessage = replyToSlackMessage;
const fetchSlackChannels = async (botToken) => {
    const res = await axios_1.default.get('https://slack.com/api/conversations.list', { headers: { Authorization: `Bearer ${botToken}` }, params: { limit: 200 }, timeout: 15000 });
    if (!res.data.ok)
        throw new Error(`Slack channels error: ${res.data.error}`);
    return res.data.channels;
};
exports.fetchSlackChannels = fetchSlackChannels;
//# sourceMappingURL=slack.js.map