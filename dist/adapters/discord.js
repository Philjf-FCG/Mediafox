"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyToDiscordMessage = exports.publishToDiscordBot = exports.publishToDiscordWebhook = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const getWebhookUrl = (account) => {
    const extra = JSON.parse(account.extra);
    if (extra.webhook_url)
        return (0, crypto_1.decryptToken)(extra.webhook_url);
    throw new Error('Discord account has no webhook URL configured');
};
const publishToDiscordWebhook = async (account, content, embeds) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'discord');
    if (!rl.allowed)
        throw new Error(`Discord rate limit reached. Resets at ${rl.resetsAt}`);
    const webhookUrl = getWebhookUrl(account);
    const body = {};
    if (content)
        body.content = content.substring(0, 2000);
    if (embeds?.length)
        body.embeds = embeds.slice(0, 10);
    const res = await axios_1.default.post(`${webhookUrl}?wait=true`, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
    });
    (0, rateLimit_1.consumeRateLimit)(account.id, 'discord');
    return { platformPostId: res.data.id };
};
exports.publishToDiscordWebhook = publishToDiscordWebhook;
const publishToDiscordBot = async (account, channelId, content, embeds) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'discord');
    if (!rl.allowed)
        throw new Error(`Discord rate limit reached. Resets at ${rl.resetsAt}`);
    const botToken = (0, crypto_1.decryptToken)(account.access_token);
    const body = {};
    if (content)
        body.content = content.substring(0, 2000);
    if (embeds?.length)
        body.embeds = embeds;
    const res = await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, body, { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    (0, rateLimit_1.consumeRateLimit)(account.id, 'discord');
    return { platformPostId: res.data.id };
};
exports.publishToDiscordBot = publishToDiscordBot;
const replyToDiscordMessage = async (account, channelId, messageId, content) => {
    const botToken = (0, crypto_1.decryptToken)(account.access_token);
    await axios_1.default.post(`https://discord.com/api/v10/channels/${channelId}/messages`, { content: content.substring(0, 2000), message_reference: { message_id: messageId } }, { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    (0, rateLimit_1.consumeRateLimit)(account.id, 'discord');
};
exports.replyToDiscordMessage = replyToDiscordMessage;
//# sourceMappingURL=discord.js.map