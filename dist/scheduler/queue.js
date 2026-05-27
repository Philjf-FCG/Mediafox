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
exports.processDueItems = exports.schedulePostNow = exports.schedulePost = void 0;
const uuid_1 = require("uuid");
const db_1 = require("../utils/db");
const bluesky_1 = require("../adapters/bluesky");
const discord_1 = require("../adapters/discord");
const slack_1 = require("../adapters/slack");
const facebook_1 = require("../adapters/facebook");
const instagram_1 = require("../adapters/instagram");
const linkedin_1 = require("../adapters/linkedin");
const MEDIA_PATH = process.env.MEDIA_STORAGE_PATH ?? '/opt/data/media';
const BACKOFF_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];
const schedulePost = (postId, variantId, fireAt) => {
    (0, db_1.enqueueVariant)((0, uuid_1.v4)(), variantId, fireAt.toISOString());
};
exports.schedulePost = schedulePost;
const schedulePostNow = (postId, variantId) => {
    (0, exports.schedulePost)(postId, variantId, new Date());
};
exports.schedulePostNow = schedulePostNow;
const dispatchVariant = async (variant) => {
    const account = (0, db_1.getAccountById)(variant.account_id);
    if (!account)
        throw new Error(`Account ${variant.account_id} not found`);
    if (account.status === 'expired')
        throw new Error(`Account ${account.display_name} token expired`);
    const mediaIds = JSON.parse(variant.media_ids ?? '[]');
    switch (account.platform) {
        case 'bluesky':
            return (0, bluesky_1.publishToBluesky)(account, variant.body, mediaIds, MEDIA_PATH);
        case 'discord':
            return (0, discord_1.publishToDiscordWebhook)(account, variant.body);
        case 'slack':
            return (0, slack_1.publishToSlack)(account, variant.body);
        case 'facebook':
            return (0, facebook_1.publishToFacebook)(account, variant.body);
        case 'instagram': {
            if (mediaIds.length === 0)
                throw new Error('Instagram requires at least one image');
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            const path = await Promise.resolve().then(() => __importStar(require('path')));
            const imgPath = path.join(MEDIA_PATH, mediaIds[0]);
            const buf = await fs.readFile(imgPath).catch(() => null);
            if (!buf)
                throw new Error(`Media file not found: ${mediaIds[0]}`);
            const tmpUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
            return (0, instagram_1.publishImageToInstagram)(account, tmpUrl, variant.body);
        }
        case 'linkedin':
            return (0, linkedin_1.publishToLinkedIn)(account, variant.body);
        default:
            throw new Error(`Unknown platform: ${account.platform}`);
    }
};
const processDueItems = async () => {
    const items = (0, db_1.getDueQueueItems)();
    for (const item of items) {
        const locked = (0, db_1.lockQueueItem)(item.id);
        if (!locked)
            continue;
        const variant = (await Promise.resolve().then(() => __importStar(require('../utils/db')))).getDb()
            .prepare('SELECT * FROM post_variants WHERE id=?').get(item.post_variant_id);
        if (!variant) {
            (0, db_1.resolveQueueItem)(item.id, false);
            continue;
        }
        try {
            const result = await dispatchVariant(variant);
            (0, db_1.updateVariant)(variant.id, {
                status: 'published',
                platform_post_id: result.platformPostId,
                published_at: new Date().toISOString(),
            });
            (0, db_1.resolveQueueItem)(item.id, true);
            (0, db_1.createNotification)((0, uuid_1.v4)(), variant.account_id, '', 'post_published', 'Post published', undefined, `/posts/${variant.post_id}`);
            maybeMarkPostPublished(variant.post_id);
            void notifyAuthorByEmail(variant.post_id, 'published');
        }
        catch (err) {
            const attempts = item.attempts;
            const nextDelay = BACKOFF_DELAYS_MS[attempts - 1];
            if (nextDelay !== undefined) {
                const nextFireAt = new Date(Date.now() + nextDelay).toISOString();
                (0, db_1.updateVariant)(variant.id, { retry_count: attempts, error_message: String(err) });
                (0, db_1.resolveQueueItem)(item.id, false, nextFireAt);
            }
            else {
                (0, db_1.updateVariant)(variant.id, { status: 'failed', error_message: String(err) });
                (0, db_1.resolveQueueItem)(item.id, false);
                (0, db_1.createNotification)((0, uuid_1.v4)(), variant.account_id, '', 'post_failed', 'Post failed to publish', `After 3 attempts: ${String(err)}`, `/posts/${variant.post_id}`);
                maybeMarkPostFailed(variant.post_id);
                void notifyAuthorByEmail(variant.post_id, 'failed', String(err));
            }
        }
    }
};
exports.processDueItems = processDueItems;
const notifyAuthorByEmail = async (postId, outcome, error) => {
    try {
        const db = (await Promise.resolve().then(() => __importStar(require('../utils/db')))).getDb();
        const row = db.prepare(`
      SELECT p.title, p.author_user_id, sm.email,
             GROUP_CONCAT(a.platform) AS platforms
      FROM posts p
      JOIN studio_members sm ON sm.studio_id=p.studio_id AND sm.user_id=p.author_user_id
      JOIN post_variants pv ON pv.post_id=p.id AND pv.status=?
      JOIN accounts a ON a.id=pv.account_id
      WHERE p.id=?
      GROUP BY p.id
    `).get(outcome === 'published' ? 'published' : 'failed', postId);
        if (!row)
            return;
        const { notifyPostPublished, notifyPostFailed } = await Promise.resolve().then(() => __importStar(require('../utils/email')));
        const platforms = (row.platforms ?? '').split(',').filter(Boolean);
        if (outcome === 'published')
            await notifyPostPublished(row.email, row.title ?? '', platforms);
        else
            await notifyPostFailed(row.email, row.title ?? '', error ?? 'Unknown error');
    }
    catch { /* email failure is non-fatal */ }
};
const maybeMarkPostPublished = (postId) => {
    const variants = (0, db_1.getVariantsByPost)(postId);
    const allDone = variants.every(v => v.status === 'published' || v.status === 'failed');
    const anyPublished = variants.some(v => v.status === 'published');
    if (allDone && anyPublished)
        (0, db_1.updatePost)(postId, { status: 'published', published_at: new Date().toISOString() });
};
const maybeMarkPostFailed = (postId) => {
    const variants = (0, db_1.getVariantsByPost)(postId);
    const allFailed = variants.every(v => v.status === 'failed');
    if (allFailed)
        (0, db_1.updatePost)(postId, { status: 'failed' });
};
//# sourceMappingURL=queue.js.map