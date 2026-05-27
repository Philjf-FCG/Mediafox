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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlueskyNotifications = exports.publishToBluesky = exports.createBlueskySession = void 0;
const api_1 = require("@atproto/api");
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const rateLimit_1 = require("../utils/rateLimit");
const createBlueskySession = async (handle, appPassword) => {
    const agent = new api_1.BskyAgent({ service: 'https://bsky.social' });
    const res = await agent.login({ identifier: handle, password: appPassword });
    return {
        did: res.data.did,
        accessJwt: res.data.accessJwt,
        refreshJwt: res.data.refreshJwt,
        handle: res.data.handle,
    };
};
exports.createBlueskySession = createBlueskySession;
const getAgent = async (account) => {
    const extra = JSON.parse(account.extra);
    const agent = new api_1.BskyAgent({ service: extra.pds ?? 'https://bsky.social' });
    const accessJwt = (0, crypto_1.decryptToken)(account.access_token);
    const refreshJwt = account.refresh_token ? (0, crypto_1.decryptToken)(account.refresh_token) : undefined;
    // @atproto/api marks session as readonly — bypass to avoid a network roundtrip;
    // refreshIfNeeded validates and refreshes on the next call if the token has expired.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent.session = {
        did: extra.did,
        handle: account.display_name,
        email: undefined,
        accessJwt,
        refreshJwt: refreshJwt ?? '',
        active: true,
    };
    return agent;
};
const refreshIfNeeded = async (agent, account) => {
    try {
        await agent.resumeSession(agent.session);
    }
    catch {
        if (!account.refresh_token)
            throw new Error('Bluesky session expired and no refresh token');
        const refreshJwt = (0, crypto_1.decryptToken)(account.refresh_token);
        const res = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
            method: 'POST',
            headers: { Authorization: `Bearer ${refreshJwt}` },
        });
        if (!res.ok)
            throw new Error('Bluesky token refresh failed');
        const data = await res.json();
        (0, db_1.updateAccountTokens)(account.id, (0, crypto_1.encryptToken)(data.accessJwt), (0, crypto_1.encryptToken)(data.refreshJwt), null);
        agent.session.accessJwt = data.accessJwt;
        agent.session.refreshJwt = data.refreshJwt;
    }
};
const publishToBluesky = async (account, body, mediaIds, mediaStoragePath) => {
    const rl = (0, rateLimit_1.checkRateLimit)(account.id, 'bluesky');
    if (!rl.allowed)
        throw new Error(`Bluesky rate limit reached. Resets at ${rl.resetsAt}`);
    const agent = await getAgent(account);
    await refreshIfNeeded(agent, account);
    const rt = new api_1.RichText({ text: body });
    await rt.detectFacets(agent);
    const images = [];
    if (mediaIds.length > 0) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        for (const mediaId of mediaIds.slice(0, 4)) {
            try {
                const filePath = path.join(mediaStoragePath, mediaId);
                const data = await fs.readFile(filePath);
                const uploadRes = await agent.uploadBlob(new Uint8Array(data), { encoding: 'image/jpeg' });
                (0, rateLimit_1.consumeRateLimit)(account.id, 'bluesky');
                images.push({ image: uploadRes.data.blob, alt: '' });
            }
            catch {
                // skip failed image upload
            }
        }
    }
    const post = { text: rt.text, facets: rt.facets, createdAt: new Date().toISOString() };
    if (images.length === 1) {
        post.embed = { $type: 'app.bsky.embed.images', images };
    }
    else if (images.length > 1) {
        post.embed = { $type: 'app.bsky.embed.images', images };
    }
    const res = await agent.post(post);
    (0, rateLimit_1.consumeRateLimit)(account.id, 'bluesky');
    (0, db_1.updateAccountStatus)(account.id, 'active');
    return { platformPostId: res.uri };
};
exports.publishToBluesky = publishToBluesky;
const getBlueskyNotifications = async (account, cursor) => {
    const agent = await getAgent(account);
    await refreshIfNeeded(agent, account);
    const res = await agent.listNotifications({ limit: 50, cursor });
    (0, rateLimit_1.consumeRateLimit)(account.id, 'bluesky');
    return {
        items: res.data.notifications,
        cursor: res.data.cursor,
    };
};
exports.getBlueskyNotifications = getBlueskyNotifications;
//# sourceMappingURL=bluesky.js.map