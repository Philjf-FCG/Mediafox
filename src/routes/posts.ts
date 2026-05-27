import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createPost, getPostById, getPostsByStudio, getPostsInRange, updatePost,
  createPostVariant, getVariantsByPost, getMember,
  createApprovalRequest, resolveApproval, getPendingApproval,
  audit, archivePost, restorePost,
} from '../utils/db';
import { schedulePost, schedulePostNow } from '../scheduler/queue';
import { checkPostQuota } from '../utils/planGating';

const router = Router();

const requireRole = (req: Request, res: Response, ...roles: string[]): boolean => {
  const member = getMember(req.studioId!, req.mediafoxUser!.userId);
  if (!member || !roles.includes(member.role)) {
    res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
    return false;
  }
  return true;
};

const postWithVariants = (postId: string) => {
  const post = getPostById(postId);
  if (!post) return null;
  return { ...post, variants: getVariantsByPost(postId) };
};

// ─── List ─────────────────────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const { status, include_archived } = req.query as { status?: string; include_archived?: string };
  const includeArchived = include_archived === '1' || include_archived === 'true';
  const posts = getPostsByStudio(req.studioId!, status, includeArchived).map(p => ({
    ...p, variants: getVariantsByPost(p.id),
  }));
  res.json({ posts });
});

// ─── Calendar range ───────────────────────────────────────────────────────────

router.get('/calendar', (req: Request, res: Response) => {
  const { from, to, include_archived } = req.query as { from?: string; to?: string; include_archived?: string };
  if (!from || !to) { res.status(400).json({ error: 'from and to are required' }); return; }
  const includeArchived = include_archived === '1' || include_archived === 'true';
  const posts = getPostsInRange(req.studioId!, from, to, includeArchived).map(p => ({ ...p, variants: getVariantsByPost(p.id) }));
  res.json({ posts });
});

// ─── Create draft ─────────────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const { title, variants } = req.body as {
    title?: string;
    variants?: { account_id: string; body: string; media_ids?: string[] }[];
  };

  const post = createPost({ id: uuidv4(), studio_id: req.studioId!, author_user_id: req.mediafoxUser!.userId, title: title ?? null });

  const created = (variants ?? []).map(v =>
    createPostVariant({ id: uuidv4(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) }),
  );

  audit(req.studioId!, req.mediafoxUser!.userId, 'create', 'post', post.id);
  res.status(201).json({ post: { ...post, variants: created } });
});

// ─── Get one ──────────────────────────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response) => {
  const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';
  const post = postWithVariants(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at && !includeArchived) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ post });
});

// ─── Update ───────────────────────────────────────────────────────────────────

router.put('/:id', (req: Request, res: Response) => {
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot edit an archived post' }); return; }
  if (!['draft', 'failed'].includes(post.status)) { res.status(409).json({ error: 'Can only edit drafts or failed posts' }); return; }

  const { title, scheduled_at, variants } = req.body as {
    title?: string; scheduled_at?: string;
    variants?: { id?: string; account_id: string; body: string; media_ids?: string[] }[];
  };

  if (title !== undefined || scheduled_at !== undefined) updatePost(post.id, { title, scheduled_at });

  if (variants) {
    for (const v of variants) {
      if (v.id) {
        (async () => {
          const { updateVariant } = await import('../utils/db');
          updateVariant(v.id!, { body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
        })();
      } else {
        createPostVariant({ id: uuidv4(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
      }
    }
  }

  res.json({ post: postWithVariants(post.id) });
});

// ─── Publish immediately ──────────────────────────────────────────────────────

router.post('/:id/publish', async (req: Request, res: Response) => {
  if (!requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot publish an archived post' }); return; }
  if (!['draft', 'failed'].includes(post.status)) { res.status(409).json({ error: 'Post is not in a publishable state' }); return; }

  updatePost(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
  const variants = getVariantsByPost(post.id);
  for (const v of variants) schedulePostNow(post.id, v.id);

  audit(req.studioId!, req.mediafoxUser!.userId, 'publish', 'post', post.id);
  res.json({ post: postWithVariants(post.id) });
});

// ─── Schedule ─────────────────────────────────────────────────────────────────

router.post('/:id/schedule', async (req: Request, res: Response) => {
  if (!requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot schedule an archived post' }); return; }
  if (!['draft', 'failed'].includes(post.status)) { res.status(409).json({ error: 'Post is not in a schedulable state' }); return; }

  const quota = await checkPostQuota(req.studioId!);
  if (!quota.allowed) {
    res.status(402).json({ error: `Monthly post quota reached (${quota.current}/${quota.max}) on your ${quota.plan} plan. Upgrade to schedule more posts.` });
    return;
  }

  const { scheduled_at } = req.body as { scheduled_at?: string };
  if (!scheduled_at) { res.status(400).json({ error: 'scheduled_at is required' }); return; }
  const fireAt = new Date(scheduled_at);
  if (isNaN(fireAt.getTime())) { res.status(400).json({ error: 'Invalid scheduled_at date' }); return; }
  if (fireAt <= new Date()) { res.status(400).json({ error: 'scheduled_at must be in the future' }); return; }

  updatePost(post.id, { status: 'scheduled', scheduled_at });
  const variants = getVariantsByPost(post.id);
  for (const v of variants) schedulePost(post.id, v.id, fireAt);

  audit(req.studioId!, req.mediafoxUser!.userId, 'schedule', 'post', post.id, { scheduled_at });
  res.json({ post: postWithVariants(post.id) });
});

// ─── Submit for approval ──────────────────────────────────────────────────────

router.post('/:id/submit', (req: Request, res: Response) => {
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot submit an archived post' }); return; }
  if (post.status !== 'draft') { res.status(409).json({ error: 'Only drafts can be submitted' }); return; }
  if (getPendingApproval(post.id)) { res.status(409).json({ error: 'Already pending approval' }); return; }

  updatePost(post.id, { status: 'pending_approval' });
  const approvalId = uuidv4();
  createApprovalRequest(approvalId, post.id, req.mediafoxUser!.userId);
  audit(req.studioId!, req.mediafoxUser!.userId, 'submit_approval', 'post', post.id);
  res.json({ post: postWithVariants(post.id), approval_id: approvalId });
});

// ─── Approve ──────────────────────────────────────────────────────────────────

router.post('/:id/approve', (req: Request, res: Response) => {
  if (!requireRole(req, res, 'owner', 'manager')) return;
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot approve an archived post' }); return; }
  const approval = getPendingApproval(post.id);
  if (!approval) { res.status(404).json({ error: 'No pending approval for this post' }); return; }

  const { note, scheduled_at } = req.body as { note?: string; scheduled_at?: string };
  resolveApproval(approval.id, 'approved', req.mediafoxUser!.userId, note);
  audit(req.studioId!, req.mediafoxUser!.userId, 'approve', 'post', post.id);

  if (scheduled_at) {
    const fireAt = new Date(scheduled_at);
    updatePost(post.id, { status: 'scheduled', scheduled_at });
    getVariantsByPost(post.id).forEach(v => schedulePost(post.id, v.id, fireAt));
  } else {
    updatePost(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
    getVariantsByPost(post.id).forEach(v => schedulePostNow(post.id, v.id));
  }

  res.json({ post: postWithVariants(post.id) });
});

// ─── Reject ───────────────────────────────────────────────────────────────────

router.post('/:id/reject', (req: Request, res: Response) => {
  if (!requireRole(req, res, 'owner', 'manager')) return;
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot reject an archived post' }); return; }
  const approval = getPendingApproval(post.id);
  if (!approval) { res.status(404).json({ error: 'No pending approval' }); return; }

  const { note } = req.body as { note?: string };
  if (!note) { res.status(400).json({ error: 'note is required when rejecting' }); return; }

  resolveApproval(approval.id, 'rejected', req.mediafoxUser!.userId, note);
  updatePost(post.id, { status: 'draft' });
  audit(req.studioId!, req.mediafoxUser!.userId, 'reject', 'post', post.id, { note });
  res.json({ post: postWithVariants(post.id) });
});

// ─── Duplicate ────────────────────────────────────────────────────────────────

router.post('/:id/duplicate', (req: Request, res: Response) => {
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot duplicate an archived post' }); return; }

  const newPost = createPost({
    id: uuidv4(),
    studio_id: req.studioId!,
    author_user_id: req.mediafoxUser!.userId,
    title: post.title ? `Copy of ${post.title}` : null,
  });

  const variants = getVariantsByPost(post.id);
  for (const v of variants) {
    createPostVariant({ id: uuidv4(), post_id: newPost.id, account_id: v.account_id, body: v.body, media_ids: v.media_ids });
  }

  audit(req.studioId!, req.mediafoxUser!.userId, 'duplicate', 'post', newPost.id, { source_id: post.id });
  res.status(201).json({ post: postWithVariants(newPost.id) });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Post is already archived' }); return; }

  if (post.status !== 'published') updatePost(post.id, { status: 'cancelled' });
  archivePost(post.id, req.mediafoxUser!.userId);
  getDb().prepare("UPDATE post_queue SET status='dead' WHERE post_variant_id IN (SELECT id FROM post_variants WHERE post_id=?) AND status='pending'").run(post.id);
  audit(req.studioId!, req.mediafoxUser!.userId, 'archive', 'post', post.id);
  res.json({ ok: true, archived: true });
});

router.post('/:id/restore', (req: Request, res: Response) => {
  const post = getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId || !post.archived_at) { res.status(404).json({ error: 'Archived post not found' }); return; }
  restorePost(post.id);
  audit(req.studioId!, req.mediafoxUser!.userId, 'restore', 'post', post.id);
  res.json({ post: postWithVariants(post.id) });
});

// Inline helper to avoid circular import
const getDb = () => require('../utils/db').getDb();

export default router;
