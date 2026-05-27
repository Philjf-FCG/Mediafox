"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstagramAccounts = exports.publishCarouselToInstagram = exports.publishImageToInstagram = void 0;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const BASE = 'https://graph.facebook.com/v19.0';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;
const token = (account) => (0, crypto_1.decryptToken)(account.access_token);
const igId = (account) => account.platform_id;
const handleMeta = (err, accountId) => {
    const e = err;
    if (e.response?.data?.error?.code === 190)
        (0, db_1.updateAccountStatus)(accountId, 'expired');
    throw err;
};
const pollUntilReady = async (igUserId, containerId, accessToken) => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        const res = await axios_1.default.get(`${BASE}/${containerId}`, {
            params: { fields: 'status_code', access_token: accessToken },
            timeout: 10000,
        });
        if (res.data.status_code === 'FINISHED')
            return;
        if (res.data.status_code === 'ERROR')
            throw new Error('Instagram media container processing failed');
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error('Instagram media container polling timed out');
    void igUserId;
};
const publishImageToInstagram = async (account, imageUrl, caption) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'instagram');
    if (!rl.allowed)
        throw new Error(`Instagram rate limit reached. Resets at ${rl.resetsAt}`);
    const at = token(account);
    const id = igId(account);
    try {
        const container = await axios_1.default.post(`${BASE}/${id}/media`, {
            image_url: imageUrl,
            caption,
            access_token: at,
        }, { timeout: 30000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'instagram');
        await pollUntilReady(id, container.data.id, at);
        const publish = await axios_1.default.post(`${BASE}/${id}/media_publish`, {
            creation_id: container.data.id,
            access_token: at,
        }, { timeout: 15000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'instagram');
        (0, db_1.updateAccountStatus)(account.id, 'active');
        return { platformPostId: publish.data.id };
    }
    catch (err) {
        return handleMeta(err, account.id);
    }
};
exports.publishImageToInstagram = publishImageToInstagram;
const publishCarouselToInstagram = async (account, imageUrls, caption) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'instagram');
    if (!rl.allowed)
        throw new Error('Instagram rate limit reached');
    const at = token(account);
    const id = igId(account);
    try {
        const childIds = [];
        for (const url of imageUrls.slice(0, 10)) {
            const c = await axios_1.default.post(`${BASE}/${id}/media`, {
                image_url: url,
                is_carousel_item: true,
                access_token: at,
            }, { timeout: 30000 });
            (0, rateLimit_1.consumeRateLimit)(account.id, 'instagram');
            childIds.push(c.data.id);
        }
        const carousel = await axios_1.default.post(`${BASE}/${id}/media`, {
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            caption,
            access_token: at,
        }, { timeout: 30000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'instagram');
        await pollUntilReady(id, carousel.data.id, at);
        const publish = await axios_1.default.post(`${BASE}/${id}/media_publish`, {
            creation_id: carousel.data.id,
            access_token: at,
        }, { timeout: 15000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'instagram');
        return { platformPostId: publish.data.id };
    }
    catch (err) {
        return handleMeta(err, account.id);
    }
};
exports.publishCarouselToInstagram = publishCarouselToInstagram;
const getInstagramAccounts = async (pageAccessToken, pageId) => {
    const res = await axios_1.default.get(`${BASE}/${pageId}`, { params: { fields: 'instagram_business_account', access_token: pageAccessToken }, timeout: 15000 });
    const igAcct = res.data.instagram_business_account;
    if (!igAcct)
        return [];
    const detail = await axios_1.default.get(`${BASE}/${igAcct.id}`, { params: { fields: 'id,username', access_token: pageAccessToken }, timeout: 15000 });
    return [detail.data];
};
exports.getInstagramAccounts = getInstagramAccounts;
//# sourceMappingURL=instagram.js.map