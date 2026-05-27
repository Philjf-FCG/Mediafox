import { v4 as uuidv4 } from 'uuid';
import {
  enqueueVariant,
  getDueQueueItems,
  lockQueueItem,
  resolveQueueItem,
  getAccountById,
  getVariantsByPost,
  updateVariant,
  updatePost,
  createNotification,
  PostVariantRecord,
  QueueItem,
} from '../utils/db';
import { publishToBluesky } from '../adapters/bluesky';
import { publishToDiscordWebhook } from '../adapters/discord';
import { publishToSlack } from '../adapters/slack';
import { publishToFacebook } from '../adapters/facebook';
import { publishImageToInstagram } from '../adapters/instagram';
import { publishToLinkedIn } from '../adapters/linkedin';

const MEDIA_PATH = process.env.MEDIA_STORAGE_PATH ?? '/opt/data/media';

const BACKOFF_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];

export const schedulePost = (postId: string, variantId: string, fireAt: Date): void => {
  enqueueVariant(uuidv4(), variantId, fireAt.toISOString());
};

export const schedulePostNow = (postId: string, variantId: string): void => {
  schedulePost(postId, variantId, new Date());
};

const dispatchVariant = async (variant: PostVariantRecord): Promise<{ platformPostId: string }> => {
  const account = getAccountById(variant.account_id);
  if (!account) throw new Error(`Account ${variant.account_id} not found`);
  if (account.status === 'expired') throw new Error(`Account ${account.display_name} token expired`);

  const mediaIds: string[] = JSON.parse(variant.media_ids ?? '[]') as string[];

  switch (account.platform) {
    case 'bluesky':
      return publishToBluesky(account, variant.body, mediaIds, MEDIA_PATH);

    case 'discord':
      return publishToDiscordWebhook(account, variant.body);

    case 'slack':
      return publishToSlack(account, variant.body);

    case 'facebook':
      return publishToFacebook(account, variant.body);

    case 'instagram': {
      if (mediaIds.length === 0) throw new Error('Instagram requires at least one image');
      const fs = await import('fs/promises');
      const path = await import('path');
      const imgPath = path.join(MEDIA_PATH, mediaIds[0]);
      const buf = await fs.readFile(imgPath).catch(() => null);
      if (!buf) throw new Error(`Media file not found: ${mediaIds[0]}`);
      const tmpUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
      return publishImageToInstagram(account, tmpUrl, variant.body);
    }

    case 'linkedin':
      return publishToLinkedIn(account, variant.body);

    default:
      throw new Error(`Unknown platform: ${account.platform}`);
  }
};

export const processDueItems = async (): Promise<void> => {
  const items = getDueQueueItems();

  for (const item of items) {
    const locked = lockQueueItem(item.id);
    if (!locked) continue;

    const variant = (await import('../utils/db')).getDb()
      .prepare('SELECT * FROM post_variants WHERE id=?').get(item.post_variant_id) as PostVariantRecord | undefined;
    if (!variant) { resolveQueueItem(item.id, false); continue; }

    try {
      const result = await dispatchVariant(variant);
      updateVariant(variant.id, {
        status: 'published',
        platform_post_id: result.platformPostId,
        published_at: new Date().toISOString(),
      });
      resolveQueueItem(item.id, true);

      createNotification(uuidv4(), variant.account_id, '', 'post_published', 'Post published', undefined, `/posts/${variant.post_id}`);
      maybeMarkPostPublished(variant.post_id);
      void notifyAuthorByEmail(variant.post_id, 'published');

    } catch (err: unknown) {
      const attempts = item.attempts;
      const nextDelay = BACKOFF_DELAYS_MS[attempts - 1];

      if (nextDelay !== undefined) {
        const nextFireAt = new Date(Date.now() + nextDelay).toISOString();
        updateVariant(variant.id, { retry_count: attempts, error_message: String(err) });
        resolveQueueItem(item.id, false, nextFireAt);
      } else {
        updateVariant(variant.id, { status: 'failed', error_message: String(err) });
        resolveQueueItem(item.id, false);
        createNotification(
          uuidv4(), variant.account_id, '', 'post_failed',
          'Post failed to publish', `After 3 attempts: ${String(err)}`, `/posts/${variant.post_id}`,
        );
        maybeMarkPostFailed(variant.post_id);
        void notifyAuthorByEmail(variant.post_id, 'failed', String(err));
      }
    }
  }
};

const notifyAuthorByEmail = async (postId: string, outcome: 'published' | 'failed', error?: string): Promise<void> => {
  try {
    const db = (await import('../utils/db')).getDb();
    const row = db.prepare(`
      SELECT p.title, p.author_user_id, sm.email,
             GROUP_CONCAT(a.platform) AS platforms
      FROM posts p
      JOIN studio_members sm ON sm.studio_id=p.studio_id AND sm.user_id=p.author_user_id
      JOIN post_variants pv ON pv.post_id=p.id AND pv.status=?
      JOIN accounts a ON a.id=pv.account_id
      WHERE p.id=?
      GROUP BY p.id
    `).get(outcome === 'published' ? 'published' : 'failed', postId) as { title: string | null; email: string; platforms: string } | undefined;

    if (!row) return;
    const { notifyPostPublished, notifyPostFailed } = await import('../utils/email');
    const platforms = (row.platforms ?? '').split(',').filter(Boolean);
    if (outcome === 'published') await notifyPostPublished(row.email, row.title ?? '', platforms);
    else await notifyPostFailed(row.email, row.title ?? '', error ?? 'Unknown error');
  } catch { /* email failure is non-fatal */ }
};

const maybeMarkPostPublished = (postId: string): void => {
  const variants = getVariantsByPost(postId);
  const allDone = variants.every(v => v.status === 'published' || v.status === 'failed');
  const anyPublished = variants.some(v => v.status === 'published');
  if (allDone && anyPublished) updatePost(postId, { status: 'published', published_at: new Date().toISOString() });
};

const maybeMarkPostFailed = (postId: string): void => {
  const variants = getVariantsByPost(postId);
  const allFailed = variants.every(v => v.status === 'failed');
  if (allFailed) updatePost(postId, { status: 'failed' });
};
