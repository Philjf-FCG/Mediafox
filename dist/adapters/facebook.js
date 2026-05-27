"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFacebookPages = exports.getFacebookPageInsights = exports.publishPhotoToFacebook = exports.publishToFacebook = void 0;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const BASE = 'https://graph.facebook.com/v19.0';
const token = (account) => (0, crypto_1.decryptToken)(account.access_token);
const pageId = (account) => {
    const extra = JSON.parse(account.extra);
    return extra.page_id ?? account.platform_id;
};
const handleMeta = (err, accountId) => {
    const e = err;
    if (e.response?.data?.error?.code === 190)
        (0, db_1.updateAccountStatus)(accountId, 'expired');
    throw err;
};
const publishToFacebook = async (account, message, link, scheduledPublishTime) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'facebook');
    if (!rl.allowed)
        throw new Error(`Facebook rate limit reached. Resets at ${rl.resetsAt}`);
    const pid = pageId(account);
    const params = { message, access_token: token(account) };
    if (link)
        params.link = link;
    if (scheduledPublishTime) {
        params.scheduled_publish_time = scheduledPublishTime;
        params.published = false;
    }
    try {
        const res = await axios_1.default.post(`${BASE}/${pid}/feed`, params, { timeout: 20000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'facebook');
        (0, db_1.updateAccountStatus)(account.id, 'active');
        return { platformPostId: res.data.id };
    }
    catch (err) {
        return handleMeta(err, account.id);
    }
};
exports.publishToFacebook = publishToFacebook;
const publishPhotoToFacebook = async (account, message, imageUrl) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'facebook');
    if (!rl.allowed)
        throw new Error(`Facebook rate limit reached`);
    const pid = pageId(account);
    try {
        const res = await axios_1.default.post(`${BASE}/${pid}/photos`, {
            caption: message,
            url: imageUrl,
            access_token: token(account),
        }, { timeout: 30000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'facebook');
        return { platformPostId: res.data.id };
    }
    catch (err) {
        return handleMeta(err, account.id);
    }
};
exports.publishPhotoToFacebook = publishPhotoToFacebook;
const getFacebookPageInsights = async (account, since, until) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'facebook');
    if (!rl.allowed)
        throw new Error('Facebook rate limit reached');
    const pid = pageId(account);
    try {
        const res = await axios_1.default.get(`${BASE}/${pid}/insights`, {
            params: {
                metric: 'page_impressions,page_reach,page_engaged_users,page_fans',
                period: 'day',
                since,
                until,
                access_token: token(account),
            },
            timeout: 20000,
        });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'facebook');
        return res.data;
    }
    catch (err) {
        return handleMeta(err, account.id);
    }
};
exports.getFacebookPageInsights = getFacebookPageInsights;
const getFacebookPages = async (userToken) => {
    const res = await axios_1.default.get(`${BASE}/me/accounts`, { params: { access_token: userToken, fields: 'id,name,access_token' }, timeout: 15000 });
    return res.data.data;
};
exports.getFacebookPages = getFacebookPages;
//# sourceMappingURL=facebook.js.map