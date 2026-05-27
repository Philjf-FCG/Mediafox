"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLinkedInProfile = exports.publishImageToLinkedIn = exports.publishToLinkedIn = void 0;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const BASE = 'https://api.linkedin.com/v2';
const token = (account) => (0, crypto_1.decryptToken)(account.access_token);
const authorUrn = (account) => {
    const extra = JSON.parse(account.extra);
    if (extra.org_id)
        return `urn:li:organization:${extra.org_id}`;
    return `urn:li:person:${account.platform_id}`;
};
const headers = (account) => ({
    Authorization: `Bearer ${token(account)}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
});
const handleLinkedIn = (err, accountId) => {
    const e = err;
    if (e.response?.status === 401)
        (0, db_1.updateAccountStatus)(accountId, 'expired');
    throw err;
};
const publishToLinkedIn = async (account, text) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'linkedin');
    if (!rl.allowed)
        throw new Error(`LinkedIn rate limit reached. Resets at ${rl.resetsAt}`);
    const body = {
        author: authorUrn(account),
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text },
                shareMediaCategory: 'NONE',
            },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };
    try {
        const res = await axios_1.default.post(`${BASE}/ugcPosts`, body, {
            headers: headers(account),
            timeout: 20000,
        });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'linkedin');
        (0, db_1.updateAccountStatus)(account.id, 'active');
        const postId = res.headers['x-restli-id'] ?? res.data;
        return { platformPostId: postId };
    }
    catch (err) {
        return handleLinkedIn(err, account.id);
    }
};
exports.publishToLinkedIn = publishToLinkedIn;
const publishImageToLinkedIn = async (account, text, imageBuffer, filename) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'linkedin');
    if (!rl.allowed)
        throw new Error('LinkedIn rate limit reached');
    const at = token(account);
    const author = authorUrn(account);
    const hdrs = headers(account);
    try {
        // Step 1: Register upload
        const reg = await axios_1.default.post(`${BASE}/assets?action=registerUpload`, {
            registerUploadRequest: {
                recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                owner: author,
                serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
            },
        }, { headers: hdrs, timeout: 20000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'linkedin');
        const uploadUrl = reg.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        const asset = reg.data.value.asset;
        // Step 2: Upload binary
        await axios_1.default.put(uploadUrl, imageBuffer, {
            headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'image/jpeg' },
            timeout: 60000,
        });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'linkedin');
        // Step 3: Create post referencing asset
        const res = await axios_1.default.post(`${BASE}/ugcPosts`, {
            author,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text },
                    shareMediaCategory: 'IMAGE',
                    media: [{ status: 'READY', description: { text: filename }, media: asset, title: { text: filename } }],
                },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }, { headers: hdrs, timeout: 20000 });
        (0, rateLimit_1.consumeRateLimit)(account.id, 'linkedin');
        return { platformPostId: res.headers['x-restli-id'] ?? res.data };
    }
    catch (err) {
        return handleLinkedIn(err, account.id);
    }
};
exports.publishImageToLinkedIn = publishImageToLinkedIn;
const getLinkedInProfile = async (accessToken) => {
    const res = await axios_1.default.get(`${BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 });
    return res.data;
};
exports.getLinkedInProfile = getLinkedInProfile;
//# sourceMappingURL=linkedin.js.map