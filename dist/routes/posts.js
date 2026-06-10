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
const express_1 = require("express");
const uuid_1 = require("uuid");
const db_1 = require("../utils/db");
const queue_1 = require("../scheduler/queue");
const planGating_1 = require("../utils/planGating");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
const requireRole = async (req, res, ...roles) => {
    const member = await (0, db_1.getMember)(req.studioId, req.mediafoxUser.userId);
    if (!member || !roles.includes(member.role)) {
        res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
        return false;
    }
    return true;
};
const postWithVariants = async (postId) => {
    const post = await (0, db_1.getPostById)(postId);
    if (!post)
        return null;
    return { ...post, variants: await (0, db_1.getVariantsByPost)(postId) };
};
// ─── List ─────────────────────────────────────────────────────────────────────
router.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { status, include_archived } = req.query;
    const includeArchived = include_archived === '1' || include_archived === 'true';
    const postList = await (0, db_1.getPostsByStudio)(req.studioId, status, includeArchived);
    const posts = await Promise.all(postList.map(async (p) => ({
        ...p, variants: await (0, db_1.getVariantsByPost)(p.id),
    })));
    res.json({ posts });
}));
// ─── Calendar range ───────────────────────────────────────────────────────────
router.get('/calendar', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { from, to, include_archived } = req.query;
    if (!from || !to) {
        res.status(400).json({ error: 'from and to are required' });
        return;
    }
    const includeArchived = include_archived === '1' || include_archived === 'true';
    const postList = await (0, db_1.getPostsInRange)(req.studioId, from, to, includeArchived);
    const posts = await Promise.all(postList.map(async (p) => ({ ...p, variants: await (0, db_1.getVariantsByPost)(p.id) })));
    res.json({ posts });
}));
// ─── Create draft ─────────────────────────────────────────────────────────────
router.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { title, variants } = req.body;
    const post = await (0, db_1.createPost)({ id: (0, uuid_1.v4)(), studio_id: req.studioId, author_user_id: req.mediafoxUser.userId, title: title ?? null });
    const created = await Promise.all((variants ?? []).map(v => (0, db_1.createPostVariant)({ id: (0, uuid_1.v4)(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) })));
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'create', 'post', post.id);
    res.status(201).json({ post: { ...post, variants: created } });
}));
// ─── Get one ──────────────────────────────────────────────────────────────────
router.get('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';
    const post = await postWithVariants(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at && !includeArchived) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json({ post });
}));
// ─── Update ───────────────────────────────────────────────────────────────────
router.put('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot edit an archived post' });
        return;
    }
    if (!['draft', 'failed'].includes(post.status)) {
        res.status(409).json({ error: 'Can only edit drafts or failed posts' });
        return;
    }
    const { title, scheduled_at, variants } = req.body;
    if (title !== undefined || scheduled_at !== undefined)
        await (0, db_1.updatePost)(post.id, { title, scheduled_at });
    if (variants) {
        for (const v of variants) {
            if (v.id) {
                const { updateVariant } = await Promise.resolve().then(() => __importStar(require('../utils/db')));
                await updateVariant(v.id, { body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
            }
            else {
                await (0, db_1.createPostVariant)({ id: (0, uuid_1.v4)(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
            }
        }
    }
    res.json({ post: await postWithVariants(post.id) });
}));
// ─── Publish immediately ──────────────────────────────────────────────────────
router.post('/:id/publish', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot publish an archived post' });
        return;
    }
    if (!['draft', 'failed'].includes(post.status)) {
        res.status(409).json({ error: 'Post is not in a publishable state' });
        return;
    }
    await (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
    const variants = await (0, db_1.getVariantsByPost)(post.id);
    for (const v of variants)
        await (0, queue_1.schedulePostNow)(post.id, v.id);
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'publish', 'post', post.id);
    res.json({ post: await postWithVariants(post.id) });
}));
// ─── Schedule ─────────────────────────────────────────────────────────────────
router.post('/:id/schedule', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot schedule an archived post' });
        return;
    }
    if (!['draft', 'failed'].includes(post.status)) {
        res.status(409).json({ error: 'Post is not in a schedulable state' });
        return;
    }
    const quota = await (0, planGating_1.checkPostQuota)(req.studioId);
    if (!quota.allowed) {
        res.status(402).json({ error: `Monthly post quota reached (${quota.current}/${quota.max}) on your ${quota.plan} plan. Upgrade to schedule more posts.` });
        return;
    }
    const { scheduled_at } = req.body;
    if (!scheduled_at) {
        res.status(400).json({ error: 'scheduled_at is required' });
        return;
    }
    const fireAt = new Date(scheduled_at);
    if (isNaN(fireAt.getTime())) {
        res.status(400).json({ error: 'Invalid scheduled_at date' });
        return;
    }
    if (fireAt <= new Date()) {
        res.status(400).json({ error: 'scheduled_at must be in the future' });
        return;
    }
    await (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at });
    const variants = await (0, db_1.getVariantsByPost)(post.id);
    for (const v of variants)
        await (0, queue_1.schedulePost)(post.id, v.id, fireAt);
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'schedule', 'post', post.id, { scheduled_at });
    res.json({ post: await postWithVariants(post.id) });
}));
// ─── Submit for approval ──────────────────────────────────────────────────────
router.post('/:id/submit', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot submit an archived post' });
        return;
    }
    if (post.status !== 'draft') {
        res.status(409).json({ error: 'Only drafts can be submitted' });
        return;
    }
    if (await (0, db_1.getPendingApproval)(post.id)) {
        res.status(409).json({ error: 'Already pending approval' });
        return;
    }
    await (0, db_1.updatePost)(post.id, { status: 'pending_approval' });
    const approvalId = (0, uuid_1.v4)();
    await (0, db_1.createApprovalRequest)(approvalId, post.id, req.mediafoxUser.userId);
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'submit_approval', 'post', post.id);
    res.json({ post: await postWithVariants(post.id), approval_id: approvalId });
}));
// ─── Approve ──────────────────────────────────────────────────────────────────
router.post('/:id/approve', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot approve an archived post' });
        return;
    }
    const approval = await (0, db_1.getPendingApproval)(post.id);
    if (!approval) {
        res.status(404).json({ error: 'No pending approval for this post' });
        return;
    }
    const { note, scheduled_at } = req.body;
    await (0, db_1.resolveApproval)(approval.id, 'approved', req.mediafoxUser.userId, note);
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'approve', 'post', post.id);
    if (scheduled_at) {
        const fireAt = new Date(scheduled_at);
        await (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at });
        const variants = await (0, db_1.getVariantsByPost)(post.id);
        for (const v of variants)
            await (0, queue_1.schedulePost)(post.id, v.id, fireAt);
    }
    else {
        await (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
        const variants = await (0, db_1.getVariantsByPost)(post.id);
        for (const v of variants)
            await (0, queue_1.schedulePostNow)(post.id, v.id);
    }
    res.json({ post: await postWithVariants(post.id) });
}));
// ─── Reject ───────────────────────────────────────────────────────────────────
router.post('/:id/reject', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot reject an archived post' });
        return;
    }
    const approval = await (0, db_1.getPendingApproval)(post.id);
    if (!approval) {
        res.status(404).json({ error: 'No pending approval' });
        return;
    }
    const { note } = req.body;
    if (!note) {
        res.status(400).json({ error: 'note is required when rejecting' });
        return;
    }
    await (0, db_1.resolveApproval)(approval.id, 'rejected', req.mediafoxUser.userId, note);
    await (0, db_1.updatePost)(post.id, { status: 'draft' });
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'reject', 'post', post.id, { note });
    res.json({ post: await postWithVariants(post.id) });
}));
// ─── Duplicate ────────────────────────────────────────────────────────────────
router.post('/:id/duplicate', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot duplicate an archived post' });
        return;
    }
    const newPost = await (0, db_1.createPost)({
        id: (0, uuid_1.v4)(),
        studio_id: req.studioId,
        author_user_id: req.mediafoxUser.userId,
        title: post.title ? `Copy of ${post.title}` : null,
    });
    const variants = await (0, db_1.getVariantsByPost)(post.id);
    for (const v of variants) {
        await (0, db_1.createPostVariant)({ id: (0, uuid_1.v4)(), post_id: newPost.id, account_id: v.account_id, body: v.body, media_ids: v.media_ids });
    }
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'duplicate', 'post', newPost.id, { source_id: post.id });
    res.status(201).json({ post: await postWithVariants(newPost.id) });
}));
// ─── Cancel ───────────────────────────────────────────────────────────────────
router.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Post is already archived' });
        return;
    }
    if (post.status !== 'published')
        await (0, db_1.updatePost)(post.id, { status: 'cancelled' });
    await (0, db_1.archivePost)(post.id, req.mediafoxUser.userId);
    await (0, db_1.getPool)().query("UPDATE post_queue SET status='dead' WHERE post_variant_id IN (SELECT id FROM post_variants WHERE post_id=$1) AND status='pending'", [post.id]);
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'archive', 'post', post.id);
    res.json({ ok: true, archived: true });
}));
router.post('/:id/restore', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId || !post.archived_at) {
        res.status(404).json({ error: 'Archived post not found' });
        return;
    }
    await (0, db_1.restorePost)(post.id);
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'restore', 'post', post.id);
    res.json({ post: await postWithVariants(post.id) });
}));
// ─── Reddit assisted publish workflow ───────────────────────────────────────
router.get('/:id/reddit-assists', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json({ assists: await (0, db_1.getRedditAssistsByPost)(req.studioId, post.id) });
}));
router.post('/:id/reddit-assists', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot hand off an archived post' });
        return;
    }
    const { subreddit, title, body, handoff_note } = req.body;
    if (!subreddit || !title) {
        res.status(400).json({ error: 'subreddit and title are required' });
        return;
    }
    const normalizedSubreddit = subreddit.replace(/^r\//i, '').trim();
    if (!normalizedSubreddit) {
        res.status(400).json({ error: 'subreddit is invalid' });
        return;
    }
    const assist = await (0, db_1.createRedditAssist)({
        id: (0, uuid_1.v4)(),
        post_id: post.id,
        studio_id: req.studioId,
        requested_by: req.mediafoxUser.userId,
        subreddit: normalizedSubreddit,
        title: title.trim(),
        body: body?.trim() || null,
        handoff_note: handoff_note?.trim() || null,
    });
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'reddit_handoff', 'post', post.id, { assist_id: assist.id, subreddit: normalizedSubreddit });
    res.status(201).json({ assist });
}));
router.post('/:id/reddit-assists/:assistId/complete', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const assists = await (0, db_1.getRedditAssistsByPost)(req.studioId, post.id);
    const assist = assists.find(a => a.id === req.params.assistId);
    if (!assist) {
        res.status(404).json({ error: 'Assist not found' });
        return;
    }
    const { publish_url } = req.body;
    if (!publish_url || !/^https?:\/\//i.test(publish_url)) {
        res.status(400).json({ error: 'publish_url must be a valid http(s) URL' });
        return;
    }
    await (0, db_1.markRedditAssistPublished)(assist.id, publish_url.trim());
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'reddit_publish_complete', 'post', post.id, { assist_id: assist.id, publish_url });
    res.json({ ok: true });
}));
// ─── TikTok assisted publish workflow ───────────────────────────────────────
router.get('/:id/tiktok-assists', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json({ assists: await (0, db_1.getTikTokAssistsByPost)(req.studioId, post.id) });
}));
router.post('/:id/tiktok-assists', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.archived_at) {
        res.status(409).json({ error: 'Cannot hand off an archived post' });
        return;
    }
    const { caption, media_asset_id, handoff_note } = req.body;
    if (!caption || !caption.trim()) {
        res.status(400).json({ error: 'caption is required' });
        return;
    }
    if (caption.trim().length > 2200) {
        res.status(400).json({ error: 'caption exceeds TikTok limits' });
        return;
    }
    const assist = await (0, db_1.createTikTokAssist)({
        id: (0, uuid_1.v4)(),
        post_id: post.id,
        studio_id: req.studioId,
        requested_by: req.mediafoxUser.userId,
        caption: caption.trim(),
        media_asset_id: media_asset_id?.trim() || null,
        handoff_note: handoff_note?.trim() || null,
    });
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'tiktok_handoff', 'post', post.id, { assist_id: assist.id });
    res.status(201).json({ assist });
}));
router.post('/:id/tiktok-assists/:assistId/complete', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!await requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = await (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const assists = await (0, db_1.getTikTokAssistsByPost)(req.studioId, post.id);
    const assist = assists.find(a => a.id === req.params.assistId);
    if (!assist) {
        res.status(404).json({ error: 'Assist not found' });
        return;
    }
    const { publish_url } = req.body;
    if (!publish_url || !/^https?:\/\//i.test(publish_url)) {
        res.status(400).json({ error: 'publish_url must be a valid http(s) URL' });
        return;
    }
    await (0, db_1.markTikTokAssistPublished)(assist.id, publish_url.trim());
    await (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'tiktok_publish_complete', 'post', post.id, { assist_id: assist.id, publish_url });
    res.json({ ok: true });
}));
exports.default = router;
//# sourceMappingURL=posts.js.map