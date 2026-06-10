import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createPost, getPostById, getPostsByStudio, getPostsInRange, updatePost,
  createPostVariant, getVariantsByPost, getMember,
  createApprovalRequest, resolveApproval, getPendingApproval,
  audit, archivePost, restorePost,
  createRedditAssist, getRedditAssistsByPost, markRedditAssistPublished,
  createTikTokAssist, getTikTokAssistsByPost, markTikTokAssistPublished,
  getPool,
} from '../utils/db';
import { schedulePost, schedulePostNow } from '../scheduler/queue';
import { checkPostQuota } from '../utils/planGating';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const requireRole = async (req: Request, res: Response, ...roles: string[]): Promise<boolean> => {
  const member = await getMember(req.studioId!, req.mediafoxUser!.userId);
  if (!member || !roles.includes(member.role)) {
    res.status(403).json({ error: `Requires one of: ${roles.join(', ')}` });
    return false;
  }
  return true;
};

const postWithVariants = async (postId: string) => {
  const post = await getPostById(postId);
  if (!post) return null;
  return { ...post, variants: await getVariantsByPost(postId) };
};

// ─── List ─────────────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { status, include_archived } = req.query as { status?: string; include_archived?: string };
  const includeArchived = include_archived === '1' || include_archived === 'true';
  const postList = await getPostsByStudio(req.studioId!, status, includeArchived);
  const posts = await Promise.all(postList.map(async p => ({
    ...p, variants: await getVariantsByPost(p.id),
  })));
  res.json({ posts });
}));

// ─── Calendar range ───────────────────────────────────────────────────────────

router.get('/calendar', asyncHandler(async (req: Request, res: Response) => {
  const { from, to, include_archived } = req.query as { from?: string; to?: string; include_archived?: string };
  if (!from || !to) { res.status(400).json({ error: 'from and to are required' }); return; }
  const includeArchived = include_archived === '1' || include_archived === 'true';
  const postList = await getPostsInRange(req.studioId!, from, to, includeArchived);
  const posts = await Promise.all(postList.map(async p => ({ ...p, variants: await getVariantsByPost(p.id) })));
  res.json({ posts });
}));

// ─── Create draft ─────────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { title, variants } = req.body as {
    title?: string;
    variants?: { account_id: string; body: string; media_ids?: string[] }[];
  };

  const post = await createPost({ id: uuidv4(), studio_id: req.studioId!, author_user_id: req.mediafoxUser!.userId, title: title ?? null });

  const created = await Promise.all((variants ?? []).map(v =>
    createPostVariant({ id: uuidv4(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) }),
  ));

  await audit(req.studioId!, req.mediafoxUser!.userId, 'create', 'post', post.id);
  res.status(201).json({ post: { ...post, variants: created } });
}));

// ─── Get one ──────────────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';
  const post = await postWithVariants(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at && !includeArchived) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ post });
}));

// ─── Update ───────────────────────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot edit an archived post' }); return; }
  if (!['draft', 'failed'].includes(post.status)) { res.status(409).json({ error: 'Can only edit drafts or failed posts' }); return; }

  const { title, scheduled_at, variants } = req.body as {
    title?: string; scheduled_at?: string;
    variants?: { id?: string; account_id: string; body: string; media_ids?: string[] }[];
  };

  if (title !== undefined || scheduled_at !== undefined) await updatePost(post.id, { title, scheduled_at });

  if (variants) {
    for (const v of variants) {
      if (v.id) {
        const { updateVariant } = await import('../utils/db');
        await updateVariant(v.id!, { body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
      } else {
        await createPostVariant({ id: uuidv4(), post_id: post.id, account_id: v.account_id, body: v.body, media_ids: JSON.stringify(v.media_ids ?? []) });
      }
    }
  }

  res.json({ post: await postWithVariants(post.id) });
}));

// ─── Publish immediately ──────────────────────────────────────────────────────

router.post('/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot publish an archived post' }); return; }
  if (!['draft', 'failed'].includes(post.status)) { res.status(409).json({ error: 'Post is not in a publishable state' }); return; }

  await updatePost(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
  const variants = await getVariantsByPost(post.id);
  for (const v of variants) await schedulePostNow(post.id, v.id);

  await audit(req.studioId!, req.mediafoxUser!.userId, 'publish', 'post', post.id);
  res.json({ post: await postWithVariants(post.id) });
}));

// ─── Schedule ─────────────────────────────────────────────────────────────────

router.post('/:id/schedule', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = await getPostById(req.params.id);
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

  await updatePost(post.id, { status: 'scheduled', scheduled_at });
  const variants = await getVariantsByPost(post.id);
  for (const v of variants) await schedulePost(post.id, v.id, fireAt);

  await audit(req.studioId!, req.mediafoxUser!.userId, 'schedule', 'post', post.id, { scheduled_at });
  res.json({ post: await postWithVariants(post.id) });
}));

// ─── Submit for approval ──────────────────────────────────────────────────────

router.post('/:id/submit', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot submit an archived post' }); return; }
  if (post.status !== 'draft') { res.status(409).json({ error: 'Only drafts can be submitted' }); return; }
  if (await getPendingApproval(post.id)) { res.status(409).json({ error: 'Already pending approval' }); return; }

  await updatePost(post.id, { status: 'pending_approval' });
  const approvalId = uuidv4();
  await createApprovalRequest(approvalId, post.id, req.mediafoxUser!.userId);
  await audit(req.studioId!, req.mediafoxUser!.userId, 'submit_approval', 'post', post.id);
  res.json({ post: await postWithVariants(post.id), approval_id: approvalId });
}));

// ─── Approve ──────────────────────────────────────────────────────────────────

router.post('/:id/approve', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot approve an archived post' }); return; }
  const approval = await getPendingApproval(post.id);
  if (!approval) { res.status(404).json({ error: 'No pending approval for this post' }); return; }

  const { note, scheduled_at } = req.body as { note?: string; scheduled_at?: string };
  await resolveApproval(approval.id, 'approved', req.mediafoxUser!.userId, note);
  await audit(req.studioId!, req.mediafoxUser!.userId, 'approve', 'post', post.id);

  if (scheduled_at) {
    const fireAt = new Date(scheduled_at);
    await updatePost(post.id, { status: 'scheduled', scheduled_at });
    const variants = await getVariantsByPost(post.id);
    for (const v of variants) await schedulePost(post.id, v.id, fireAt);
  } else {
    await updatePost(post.id, { status: 'scheduled', scheduled_at: new Date().toISOString() });
    const variants = await getVariantsByPost(post.id);
    for (const v of variants) await schedulePostNow(post.id, v.id);
  }

  res.json({ post: await postWithVariants(post.id) });
}));

// ─── Reject ───────────────────────────────────────────────────────────────────

router.post('/:id/reject', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot reject an archived post' }); return; }
  const approval = await getPendingApproval(post.id);
  if (!approval) { res.status(404).json({ error: 'No pending approval' }); return; }

  const { note } = req.body as { note?: string };
  if (!note) { res.status(400).json({ error: 'note is required when rejecting' }); return; }

  await resolveApproval(approval.id, 'rejected', req.mediafoxUser!.userId, note);
  await updatePost(post.id, { status: 'draft' });
  await audit(req.studioId!, req.mediafoxUser!.userId, 'reject', 'post', post.id, { note });
  res.json({ post: await postWithVariants(post.id) });
}));

// ─── Duplicate ────────────────────────────────────────────────────────────────

router.post('/:id/duplicate', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot duplicate an archived post' }); return; }

  const newPost = await createPost({
    id: uuidv4(),
    studio_id: req.studioId!,
    author_user_id: req.mediafoxUser!.userId,
    title: post.title ? `Copy of ${post.title}` : null,
  });

  const variants = await getVariantsByPost(post.id);
  for (const v of variants) {
    await createPostVariant({ id: uuidv4(), post_id: newPost.id, account_id: v.account_id, body: v.body, media_ids: v.media_ids });
  }

  await audit(req.studioId!, req.mediafoxUser!.userId, 'duplicate', 'post', newPost.id, { source_id: post.id });
  res.status(201).json({ post: await postWithVariants(newPost.id) });
}));

// ─── Cancel ───────────────────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Post is already archived' }); return; }

  if (post.status !== 'published') await updatePost(post.id, { status: 'cancelled' });
  await archivePost(post.id, req.mediafoxUser!.userId);
  await getPool().query(
    "UPDATE post_queue SET status='dead' WHERE post_variant_id IN (SELECT id FROM post_variants WHERE post_id=$1) AND status='pending'",
    [post.id],
  );
  await audit(req.studioId!, req.mediafoxUser!.userId, 'archive', 'post', post.id);
  res.json({ ok: true, archived: true });
}));

router.post('/:id/restore', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId || !post.archived_at) { res.status(404).json({ error: 'Archived post not found' }); return; }
  await restorePost(post.id);
  await audit(req.studioId!, req.mediafoxUser!.userId, 'restore', 'post', post.id);
  res.json({ post: await postWithVariants(post.id) });
}));

// ─── Reddit assisted publish workflow ───────────────────────────────────────

router.get('/:id/reddit-assists', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ assists: await getRedditAssistsByPost(req.studioId!, post.id) });
}));

router.post('/:id/reddit-assists', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot hand off an archived post' }); return; }

  const { subreddit, title, body, handoff_note } = req.body as {
    subreddit?: string;
    title?: string;
    body?: string;
    handoff_note?: string;
  };
  if (!subreddit || !title) {
    res.status(400).json({ error: 'subreddit and title are required' });
    return;
  }

  const normalizedSubreddit = subreddit.replace(/^r\//i, '').trim();
  if (!normalizedSubreddit) { res.status(400).json({ error: 'subreddit is invalid' }); return; }

  const assist = await createRedditAssist({
    id: uuidv4(),
    post_id: post.id,
    studio_id: req.studioId!,
    requested_by: req.mediafoxUser!.userId,
    subreddit: normalizedSubreddit,
    title: title.trim(),
    body: body?.trim() || null,
    handoff_note: handoff_note?.trim() || null,
  });

  await audit(req.studioId!, req.mediafoxUser!.userId, 'reddit_handoff', 'post', post.id, { assist_id: assist.id, subreddit: normalizedSubreddit });
  res.status(201).json({ assist });
}));

router.post('/:id/reddit-assists/:assistId/complete', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }

  const assists = await getRedditAssistsByPost(req.studioId!, post.id);
  const assist = assists.find(a => a.id === req.params.assistId);
  if (!assist) { res.status(404).json({ error: 'Assist not found' }); return; }

  const { publish_url } = req.body as { publish_url?: string };
  if (!publish_url || !/^https?:\/\//i.test(publish_url)) {
    res.status(400).json({ error: 'publish_url must be a valid http(s) URL' });
    return;
  }

  await markRedditAssistPublished(assist.id, publish_url.trim());
  await audit(req.studioId!, req.mediafoxUser!.userId, 'reddit_publish_complete', 'post', post.id, { assist_id: assist.id, publish_url });
  res.json({ ok: true });
}));

// ─── TikTok assisted publish workflow ───────────────────────────────────────

router.get('/:id/tiktok-assists', asyncHandler(async (req: Request, res: Response) => {
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ assists: await getTikTokAssistsByPost(req.studioId!, post.id) });
}));

router.post('/:id/tiktok-assists', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  if (post.archived_at) { res.status(409).json({ error: 'Cannot hand off an archived post' }); return; }

  const { caption, media_asset_id, handoff_note } = req.body as {
    caption?: string;
    media_asset_id?: string;
    handoff_note?: string;
  };
  if (!caption || !caption.trim()) {
    res.status(400).json({ error: 'caption is required' });
    return;
  }

  if (caption.trim().length > 2200) {
    res.status(400).json({ error: 'caption exceeds TikTok limits' });
    return;
  }

  const assist = await createTikTokAssist({
    id: uuidv4(),
    post_id: post.id,
    studio_id: req.studioId!,
    requested_by: req.mediafoxUser!.userId,
    caption: caption.trim(),
    media_asset_id: media_asset_id?.trim() || null,
    handoff_note: handoff_note?.trim() || null,
  });

  await audit(req.studioId!, req.mediafoxUser!.userId, 'tiktok_handoff', 'post', post.id, { assist_id: assist.id });
  res.status(201).json({ assist });
}));

router.post('/:id/tiktok-assists/:assistId/complete', asyncHandler(async (req: Request, res: Response) => {
  if (!await requireRole(req, res, 'owner', 'manager', 'editor')) return;
  const post = await getPostById(req.params.id);
  if (!post || post.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }

  const assists = await getTikTokAssistsByPost(req.studioId!, post.id);
  const assist = assists.find(a => a.id === req.params.assistId);
  if (!assist) { res.status(404).json({ error: 'Assist not found' }); return; }

  const { publish_url } = req.body as { publish_url?: string };
  if (!publish_url || !/^https?:\/\//i.test(publish_url)) {
    res.status(400).json({ error: 'publish_url must be a valid http(s) URL' });
    return;
  }

  await markTikTokAssistPublished(assist.id, publish_url.trim());
  await audit(req.studioId!, req.mediafoxUser!.userId, 'tiktok_publish_complete', 'post', post.id, { assist_id: assist.id, publish_url });
  res.json({ ok: true });
}));

export default router;
