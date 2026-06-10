import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../utils/db';
import { decryptToken } from '../utils/crypto';

interface AccountRow { id: string; studio_id: string; platform: string; platform_id: string; access_token: string; extra: string; }
interface VariantRow { id: string; platform_post_id: string | null; account_id: string; }

const upsertPostAnalytics = async (variantId: string, platform: string, metrics: {
  likes?: number; comments?: number; shares?: number; reach?: number; impressions?: number; clicks?: number;
}): Promise<void> => {
  const m = { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, clicks: 0, ...metrics };
  await getPool().query(`
    INSERT INTO post_analytics (id, post_variant_id, platform, likes, comments, shares, reach, impressions, clicks)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT(post_variant_id) DO UPDATE SET
      likes=$4, comments=$5, shares=$6,
      reach=$7, impressions=$8, clicks=$9,
      synced_at=NOW()
  `, [uuidv4(), variantId, platform, m.likes, m.comments, m.shares, m.reach, m.impressions, m.clicks]);
};

const insertAccountAnalytics = async (accountId: string, metrics: { followers?: number; following?: number; posts_count?: number }): Promise<void> => {
  const m = { followers: 0, following: 0, posts_count: 0, ...metrics };
  await getPool().query(`
    INSERT INTO account_analytics (id, account_id, recorded_at, followers, following, posts_count)
    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `, [uuidv4(), accountId, m.followers, m.following, m.posts_count]);
};

// ─── Facebook & Instagram Insights ───────────────────────────────────────────

const syncFacebook = async (account: AccountRow): Promise<void> => {
  const token = decryptToken(account.access_token);
  const { rows: variants } = await getPool().query(
    `SELECT pv.* FROM post_variants pv JOIN posts p ON p.id=pv.post_id WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`,
    [account.id],
  );

  for (const variant of (variants as VariantRow[]).slice(0, 20)) {
    try {
      const res = await axios.get<{ data?: { name: string; values: { value: number }[] }[] }>(
        `https://graph.facebook.com/v19.0/${variant.platform_post_id}/insights`,
        { params: { metric: 'post_impressions,post_impressions_unique,post_engaged_users,post_clicks', access_token: token }, timeout: 10000 },
      );
      const metrics: Record<string, number> = {};
      for (const m of res.data.data ?? []) {
        metrics[m.name] = m.values[0]?.value ?? 0;
      }
      await upsertPostAnalytics(variant.id, 'facebook', {
        impressions: metrics.post_impressions,
        reach: metrics.post_impressions_unique,
        clicks: metrics.post_clicks,
        comments: metrics.post_engaged_users,
      });
    } catch {
      // Skip individual post failures
    }
  }

  // Account follower count
  try {
    const pageRes = await axios.get<{ fan_count?: number; followers_count?: number }>(
      `https://graph.facebook.com/v19.0/${account.platform_id}`,
      { params: { fields: 'fan_count,followers_count', access_token: token }, timeout: 10000 },
    );
    await insertAccountAnalytics(account.id, { followers: pageRes.data.fan_count ?? pageRes.data.followers_count ?? 0 });
  } catch { /* skip */ }
};

const syncInstagram = async (account: AccountRow): Promise<void> => {
  const token = decryptToken(account.access_token);
  const { rows: variants } = await getPool().query(
    `SELECT pv.* FROM post_variants pv WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`,
    [account.id],
  );

  for (const variant of (variants as VariantRow[]).slice(0, 20)) {
    try {
      const res = await axios.get<{ like_count?: number; comments_count?: number; impressions?: number; reach?: number }>(
        `https://graph.facebook.com/v19.0/${variant.platform_post_id}`,
        { params: { fields: 'like_count,comments_count,impressions,reach', access_token: token }, timeout: 10000 },
      );
      await upsertPostAnalytics(variant.id, 'instagram', {
        likes: res.data.like_count,
        comments: res.data.comments_count,
        impressions: res.data.impressions,
        reach: res.data.reach,
      });
    } catch { /* skip */ }
  }

  // Account follower count
  try {
    const igRes = await axios.get<{ followers_count?: number; media_count?: number }>(
      `https://graph.facebook.com/v19.0/${account.platform_id}`,
      { params: { fields: 'followers_count,media_count', access_token: token }, timeout: 10000 },
    );
    await insertAccountAnalytics(account.id, { followers: igRes.data.followers_count ?? 0, posts_count: igRes.data.media_count ?? 0 });
  } catch { /* skip */ }
};

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

const syncLinkedIn = async (account: AccountRow): Promise<void> => {
  const token = decryptToken(account.access_token);
  const { rows: variants } = await getPool().query(
    `SELECT pv.* FROM post_variants pv WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`,
    [account.id],
  );

  for (const variant of (variants as VariantRow[]).slice(0, 20)) {
    try {
      const res = await axios.get<{ elements?: { totalShareStatistics?: { likeCount?: number; commentCount?: number; shareCount?: number; impressionCount?: number; clickCount?: number } }[] }>(
        `https://api.linkedin.com/v2/organizationalEntityShareStatistics`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { q: 'organizationalEntity', shares: `List(${variant.platform_post_id})` },
          timeout: 10000,
        },
      ).catch(() => ({ data: { elements: [] } }));

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
    } catch { /* skip */ }
  }

  // Account follower count
  try {
    const followerRes = await axios.get<{ firstDegreeSize?: number }>(
      `https://api.linkedin.com/v2/networkSizes/urn:li:person:${account.platform_id}`,
      { headers: { Authorization: `Bearer ${token}` }, params: { edgeType: 'CompanyFollowedByMember' }, timeout: 10000 },
    ).catch(() => ({ data: { firstDegreeSize: 0 } }));
    await insertAccountAnalytics(account.id, { followers: followerRes.data.firstDegreeSize ?? 0 });
  } catch { /* skip */ }
};

// ─── Bluesky ──────────────────────────────────────────────────────────────────

const syncBluesky = async (account: AccountRow): Promise<void> => {
  const { BskyAgent } = await import('@atproto/api');
  const extra = JSON.parse(account.extra) as { did: string };
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (agent as any).session = {
    did: extra.did, handle: account.id, email: undefined,
    accessJwt: decryptToken(account.access_token),
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
  } catch { /* skip */ }

  // Post engagement
  const { rows: variants } = await getPool().query(
    `SELECT pv.* FROM post_variants pv WHERE pv.account_id=$1 AND pv.status='published' AND pv.platform_post_id IS NOT NULL`,
    [account.id],
  );

  for (const variant of (variants as VariantRow[]).slice(0, 10)) {
    try {
      const thread = await agent.getPostThread({ uri: variant.platform_post_id! });
      const post = (thread.data.thread as { post?: { likeCount?: number; replyCount?: number; repostCount?: number } }).post;
      if (post) {
        await upsertPostAnalytics(variant.id, 'bluesky', {
          likes: post.likeCount,
          comments: post.replyCount,
          shares: post.repostCount,
        });
      }
    } catch { /* skip */ }
  }
};

// ─── Main sync ────────────────────────────────────────────────────────────────

export const syncAnalytics = async (): Promise<void> => {
  const { rows: accounts } = await getPool().query(
    `SELECT * FROM accounts WHERE status='active' AND platform IN ('facebook','instagram','linkedin','bluesky')`,
  );

  for (const account of accounts as AccountRow[]) {
    try {
      switch (account.platform) {
        case 'facebook':  await syncFacebook(account);  break;
        case 'instagram': await syncInstagram(account); break;
        case 'linkedin':  await syncLinkedIn(account);  break;
        case 'bluesky':   await syncBluesky(account);   break;
      }
    } catch (err) {
      console.error(`[analytics] sync failed for ${account.platform} account ${account.id}:`, err);
    }
  }
};
