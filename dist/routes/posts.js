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
const router = (0, express_1.Router)();
const requireRole = (req, res, ...roles) => {
    const member = (0, db_1.getMember)(req.studioId, req.mediafoxUser.userId);
    if (!member || !roles.includes(member.role)) {
        res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
        return false;
    }
    return true;
};
const postWithVariants = (postId) => {
    const post = (0, db_1.getPostById)(postId);
    if (!post)
        return null;
    return { ...post, variants: (0, db_1.getVariantsByPost)(postId) };
};
// ─── List ─────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const { status } = req.query;
    const posts = (0, db_1.getPostsByStudio)(req.studioId, status).map(p => ({
        ...p, variants: (0, db_1.getVariantsByPost)(p.id),
    }));
    res.json({ posts });
});
// ─── Calendar range ───────────────────────────────────────────────────────────
router.get('/calendar', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
        res.status(400).json({ error: 'from and to are required' });
        return;
    }
    const posts = (0, db_1.getPostsInRange)(req.studioId, from, to).map(p => ({ ...p, variants: (0, db_1.getVariantsByPost)(p.id) }));
    res.json({ posts });
});
// ─── Create draft ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    const { title, variants } = req.body;
    const post = (0, db_1.createPost)({ id: (0, uuid_1.v4)(), studio_id: req.studioId, author_user_id: req.mediafoxUser.userId, title: title ?? null });
    const created = (variants ?? []).map(v => (0, db_1.createPostVariant)({ id: (0, uuid_1.v4)(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) }));
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'create', 'post', post.id);
    res.status(201).json({ post: { ...post, variants: created } });
});
// ─── Get one ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    const post = postWithVariants(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json({ post });
});
// ─── Update ───────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (!['draft', 'failed'].includes(post.status)) {
        res.status(409).json({ error: 'Can only edit drafts or failed posts' });
        return;
    }
    const { title, scheduled_at, variants } = req.body;
    if (title !== undefined || scheduled_at !== undefined)
        (0, db_1.updatePost)(post.id, { title, scheduled_at });
    if (variants) {
        for (const v of variants) {
            if (v.id) {
                (async () => {
                    const { updateVariant } = await Promise.resolve().then(() => __importStar(require('../utils/db')));
                    updateVariant(v.id, { body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
                })();
            }
            else {
                (0, db_1.createPostVariant)({ id: (0, uuid_1.v4)(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
            }
        }
    }
    res.json({ post: postWithVariants(post.id) });
});
// ─── Publish immediately ──────────────────────────────────────────────────────
router.post('/:id/publish', async (req, res) => {
    if (!requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (!['draft', 'failed'].includes(post.status)) {
        res.status(409).json({ error: 'Post is not in a publishable state' });
        return;
    }
    (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
    const variants = (0, db_1.getVariantsByPost)(post.id);
    for (const v of variants)
        (0, queue_1.schedulePostNow)(post.id, v.id);
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'publish', 'post', post.id);
    res.json({ post: postWithVariants(post.id) });
});
// ─── Schedule ─────────────────────────────────────────────────────────────────
router.post('/:id/schedule', async (req, res) => {
    if (!requireRole(req, res, 'owner', 'manager', 'editor'))
        return;
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
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
    (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at });
    const variants = (0, db_1.getVariantsByPost)(post.id);
    for (const v of variants)
        (0, queue_1.schedulePost)(post.id, v.id, fireAt);
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'schedule', 'post', post.id, { scheduled_at });
    res.json({ post: postWithVariants(post.id) });
});
// ─── Submit for approval ──────────────────────────────────────────────────────
router.post('/:id/submit', (req, res) => {
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.status !== 'draft') {
        res.status(409).json({ error: 'Only drafts can be submitted' });
        return;
    }
    if ((0, db_1.getPendingApproval)(post.id)) {
        res.status(409).json({ error: 'Already pending approval' });
        return;
    }
    (0, db_1.updatePost)(post.id, { status: 'pending_approval' });
    const approvalId = (0, uuid_1.v4)();
    (0, db_1.createApprovalRequest)(approvalId, post.id, req.mediafoxUser.userId);
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'submit_approval', 'post', post.id);
    res.json({ post: postWithVariants(post.id), approval_id: approvalId });
});
// ─── Approve ──────────────────────────────────────────────────────────────────
router.post('/:id/approve', (req, res) => {
    if (!requireRole(req, res, 'owner', 'manager'))
        return;
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const approval = (0, db_1.getPendingApproval)(post.id);
    if (!approval) {
        res.status(404).json({ error: 'No pending approval for this post' });
        return;
    }
    const { note, scheduled_at } = req.body;
    (0, db_1.resolveApproval)(approval.id, 'approved', req.mediafoxUser.userId, note);
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'approve', 'post', post.id);
    if (scheduled_at) {
        const fireAt = new Date(scheduled_at);
        (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at });
        (0, db_1.getVariantsByPost)(post.id).forEach(v => (0, queue_1.schedulePost)(post.id, v.id, fireAt));
    }
    else {
        (0, db_1.updatePost)(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
        (0, db_1.getVariantsByPost)(post.id).forEach(v => (0, queue_1.schedulePostNow)(post.id, v.id));
    }
    res.json({ post: postWithVariants(post.id) });
});
// ─── Reject ───────────────────────────────────────────────────────────────────
router.post('/:id/reject', (req, res) => {
    if (!requireRole(req, res, 'owner', 'manager'))
        return;
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const approval = (0, db_1.getPendingApproval)(post.id);
    if (!approval) {
        res.status(404).json({ error: 'No pending approval' });
        return;
    }
    const { note } = req.body;
    if (!note) {
        res.status(400).json({ error: 'note is required when rejecting' });
        return;
    }
    (0, db_1.resolveApproval)(approval.id, 'rejected', req.mediafoxUser.userId, note);
    (0, db_1.updatePost)(post.id, { status: 'draft' });
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'reject', 'post', post.id, { note });
    res.json({ post: postWithVariants(post.id) });
});
// ─── Duplicate ────────────────────────────────────────────────────────────────
router.post('/:id/duplicate', (req, res) => {
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const newPost = (0, db_1.createPost)({
        id: (0, uuid_1.v4)(),
        studio_id: req.studioId,
        author_user_id: req.mediafoxUser.userId,
        title: post.title ? `Copy of ${post.title}` : null,
    });
    const variants = (0, db_1.getVariantsByPost)(post.id);
    for (const v of variants) {
        (0, db_1.createPostVariant)({ id: (0, uuid_1.v4)(), post_id: newPost.id, account_id: v.account_id, body: v.body, media_ids: v.media_ids });
    }
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'duplicate', 'post', newPost.id, { source_id: post.id });
    res.status(201).json({ post: postWithVariants(newPost.id) });
});
// ─── Cancel ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const post = (0, db_1.getPostById)(req.params.id);
    if (!post || post.studio_id !== req.studioId) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (post.status === 'published') {
        res.status(409).json({ error: 'Cannot delete a published post' });
        return;
    }
    (0, db_1.updatePost)(post.id, { status: 'cancelled' });
    getDb().prepare("UPDATE post_queue SET status='dead' WHERE post_variant_id IN (SELECT id FROM post_variants WHERE post_id=?) AND status='pending'").run(post.id);
    (0, db_1.audit)(req.studioId, req.mediafoxUser.userId, 'cancel', 'post', post.id);
    res.json({ ok: true });
});
// Inline helper to avoid circular import
const getDb = () => require('../utils/db').getDb();
exports.default = router;
//# sourceMappingURL=posts.js.map