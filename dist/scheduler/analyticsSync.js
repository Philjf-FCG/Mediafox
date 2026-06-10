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
exports.syncAnalytics = void 0;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const upsertPostAnalytics = async (variantId, platform, metrics) => {
    const m = { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, clicks: 0, ...metrics };
    await (0, db_1.getPool)().query(`
    INSERT INTO post_analytics (id, post_variant_id, platform, likes, comments, shares, reach, impressions, clicks)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT(post_variant_id) DO UPDATE SET
      likes=$4, comments=$5, shares=$6,
      reach=$7, impressions=$8, clicks=$9,
      synced_at=NOW()
  `, [(0, uuid_1.v4)(), variantId, platform, m.likes, m.comments, m.shares, m.reach, m.impressions, m.clicks]);
};
const insertAccountAnalytics = async (accountId, metrics) => {
    const m = { followers: 0, following: 0, posts_count: 0, ...metrics };
    await (0, db_1.getPool)().query(`
    INSERT INTO account_analytics (id, account_id, recorded_at, followers, following, posts_count)
    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `, [(0, uuid_1.v4)(), accountId, m.followers, m.following, m.posts_count]);
};
// ─── Facebook & Instagram Insights ───────────────────────────────────────────
const syncFacebook = async (account) => {
    const token = (0, crypto_1.decryptToken)(account.access_token);
    const { rows: variants } = await (0, db_1.getPool)().query(`SELECT pv.* FROM post_variants pv JOIN posts p ON p.id=pv.post_id WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`, [account.id]);
    for (const variant of variants.slice(0, 20)) {
        try {
            const res = await axios_1.default.get(`https://graph.facebook.com/v19.0/${variant.platform_post_id}/insights`, { params: { metric: 'post_impressions,post_impressions_unique,post_engaged_users,post_clicks', access_token: token }, timeout: 10000 });
            const metrics = {};
            for (const m of res.data.data ?? []) {
                metrics[m.name] = m.values[0]?.value ?? 0;
            }
            await upsertPostAnalytics(variant.id, 'facebook', {
                impressions: metrics.post_impressions,
                reach: metrics.post_impressions_unique,
                clicks: metrics.post_clicks,
                comments: metrics.post_engaged_users,
            });
        }
        catch {
            // Skip individual post failures
        }
    }
    // Account follower count
    try {
        const pageRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${account.platform_id}`, { params: { fields: 'fan_count,followers_count', access_token: token }, timeout: 10000 });
        await insertAccountAnalytics(account.id, { followers: pageRes.data.fan_count ?? pageRes.data.followers_count ?? 0 });
    }
    catch { /* skip */ }
};
const syncInstagram = async (account) => {
    const token = (0, crypto_1.decryptToken)(account.access_token);
    const { rows: variants } = await (0, db_1.getPool)().query(`SELECT pv.* FROM post_variants pv WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`, [account.id]);
    for (const variant of variants.slice(0, 20)) {
        try {
            const res = await axios_1.default.get(`https://graph.facebook.com/v19.0/${variant.platform_post_id}`, { params: { fields: 'like_count,comments_count,impressions,reach', access_token: token }, timeout: 10000 });
            await upsertPostAnalytics(variant.id, 'instagram', {
                likes: res.data.like_count,
                comments: res.data.comments_count,
                impressions: res.data.impressions,
                reach: res.data.reach,
            });
        }
        catch { /* skip */ }
    }
    // Account follower count
    try {
        const igRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${account.platform_id}`, { params: { fields: 'followers_count,media_count', access_token: token }, timeout: 10000 });
        await insertAccountAnalytics(account.id, { followers: igRes.data.followers_count ?? 0, posts_count: igRes.data.media_count ?? 0 });
    }
    catch { /* skip */ }
};
// ─── LinkedIn ─────────────────────────────────────────────────────────────────
const syncLinkedIn = async (account) => {
    const token = (0, crypto_1.decryptToken)(account.access_token);
    const { rows: variants } = await (0, db_1.getPool)().query(`SELECT pv.* FROM post_variants pv WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`, [account.id]);
    for (const variant of variants.slice(0, 20)) {
        try {
            const res = await axios_1.default.get(`https://api.linkedin.com/v2/organizationalEntityShareStatistics`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { q: 'organizationalEntity', shares: `List(${variant.platform_post_id})` },
                timeout: 10000,
            }).catch(() => ({ data: { elements: [] } }));
            const stats = res.data.elements?.[0]?.totalShareStatistics;
            if (stats) {
                await upsertPostAnalytics(variant.id, 'linkedin', {
                    likes: stats.likeCount,
                    comments: stats.commentCount,
                    shares: stats.shareCount,
                    impressions: stats.impressionCount,
                    clicks: stats.clickCount,
                });
            }
        }
        catch { /* skip */ }
    }
    // Account follower count
    try {
        const followerRes = await axios_1.default.get(`https://api.linkedin.com/v2/networkSizes/urn:li:person:${account.platform_id}`, { headers: { Authorization: `Bearer ${token}` }, params: { edgeType: 'CompanyFollowedByMember' }, timeout: 10000 }).catch(() => ({ data: { firstDegreeSize: 0 } }));
        await insertAccountAnalytics(account.id, { followers: followerRes.data.firstDegreeSize ?? 0 });
    }
    catch { /* skip */ }
};
// ─── Bluesky ──────────────────────────────────────────────────────────────────
const syncBluesky = async (account) => {
    const { BskyAgent } = await Promise.resolve().then(() => __importStar(require('@atproto/api')));
    const extra = JSON.parse(account.extra);
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent.session = {
        did: extra.did, handle: account.id, email: undefined,
        accessJwt: (0, crypto_1.decryptToken)(account.access_token),
        refreshJwt: '',
        active: true,
    };
    // Get profile for follower count
    try {
        const profile = await agent.getProfile({ actor: extra.did });
        await insertAccountAnalytics(account.id, {
            followers: profile.data.followersCount ?? 0,
            following: profile.data.followsCount ?? 0,
            posts_count: profile.data.postsCount ?? 0,
        });
    }
    catch { /* skip */ }
    // Post engagement
    const { rows: variants } = await (0, db_1.getPool)().query(`SELECT pv.* FROM post_variants pv WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`, [account.id]);
    for (const variant of variants.slice(0, 10)) {
        try {
            const thread = await agent.getPostThread({ uri: variant.platform_post_id });
            const post = thread.data.thread.post;
            if (post) {
                await upsertPostAnalytics(variant.id, 'bluesky', {
                    likes: post.likeCount,
                    comments: post.replyCount,
                    shares: post.repostCount,
                });
            }
        }
        catch { /* skip */ }
    }
};
// ─── Main sync ────────────────────────────────────────────────────────────────
const syncAnalytics = async () => {
    const { rows: accounts } = await (0, db_1.getPool)().query(`SELECT * FROM accounts WHERE status='active' AND platform IN ('facebook','instagram','linkedin','bluesky')`);
    for (const account of accounts) {
        try {
            switch (account.platform) {
                case 'facebook':
                    await syncFacebook(account);
                    break;
                case 'instagram':
                    await syncInstagram(account);
                    break;
                case 'linkedin':
                    await syncLinkedIn(account);
                    break;
                case 'bluesky':
                    await syncBluesky(account);
                    break;
            }
        }
        catch (err) {
            console.error(`[analytics] sync failed for ${account.platform} account ${account.id}:`, err);
        }
    }
};
exports.syncAnalytics = syncAnalytics;
//# sourceMappingURL=analyticsSync.js.map