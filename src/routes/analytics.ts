import { Router, Request, Response } from 'express';
import { getDb } from '../utils/db';

const router = Router();

router.get('/overview', (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const db = getDb();

  const posts = db.prepare(`
    SELECT p.id, p.published_at,
           GROUP_CONCAT(a.platform) AS platforms,
           COUNT(pv.id) AS variant_count,
           SUM(CASE WHEN pv.status='published' THEN 1 ELSE 0 END) AS published_count
    FROM posts p
    LEFT JOIN post_variants pv ON pv.post_id = p.id
    LEFT JOIN accounts a ON a.id = pv.account_id
    WHERE p.studio_id = ?
      AND p.status IN ('published','scheduled','failed')
      ${from ? "AND (p.published_at >= ? OR p.scheduled_at >= ?)" : ''}
      ${to   ? "AND (p.published_at <= ? OR p.scheduled_at <= ?)" : ''}
    GROUP BY p.id
    ORDER BY p.published_at DESC
    LIMIT 200
  `).all(...([req.studioId, ...(from ? [from, from] : []), ...(to ? [to, to] : [])]));

  const byPlatform: Record<string, number> = {};
  for (const row of posts as { platforms: string | null; published_count: number }[]) {
    const plats = (row.platforms ?? '').split(',').filter(Boolean);
    for (const p of plats) byPlatform[p] = (byPlatform[p] ?? 0) + (row.published_count ?? 0);
  }

  // Aggregate engagement from synced analytics
  const engagement = db.prepare(`
    SELECT SUM(pa.likes) AS total_likes, SUM(pa.comments) AS total_comments,
           SUM(pa.shares) AS total_shares, SUM(pa.impressions) AS total_impressions,
           SUM(pa.reach) AS total_reach
    FROM post_analytics pa
    JOIN post_variants pv ON pv.id = pa.post_variant_id
    JOIN posts p ON p.id = pv.post_id
    WHERE p.studio_id = ?
      ${from ? "AND p.published_at >= ?" : ""}
      ${to   ? "AND p.published_at <= ?" : ""}
  `).get(...([req.studioId, ...(from ? [from] : []), ...(to ? [to] : [])])) as {
    total_likes: number | null; total_comments: number | null;
    total_shares: number | null; total_impressions: number | null; total_reach: number | null;
  };

  res.json({
    total_published: (posts as { published_count: number }[]).reduce((s, r) => s + (r.published_count ?? 0), 0),
    by_platform: byPlatform,
    posts,
    engagement: {
      likes: engagement.total_likes ?? 0,
      comments: engagement.total_comments ?? 0,
      shares: engagement.total_shares ?? 0,
      impressions: engagement.total_impressions ?? 0,
      reach: engagement.total_reach ?? 0,
    },
  });
});

router.get('/posts/:id', (req: Request, res: Response) => {
  const db = getDb();
  const variants = db.prepare(`
    SELECT pv.*, a.platform, a.display_name,
           pa.likes, pa.comments, pa.shares, pa.impressions, pa.reach, pa.clicks, pa.synced_at
    FROM post_variants pv
    JOIN accounts a ON a.id = pv.account_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE pv.post_id = ?
  `).all(req.params.id);
  res.json({ variants });
});

router.get('/accounts/:id', (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const db = getDb();

  const variants = db.prepare(`
    SELECT pv.*, p.published_at, pa.likes, pa.comments, pa.shares, pa.impressions, pa.reach
    FROM post_variants pv
    JOIN posts p ON p.id = pv.post_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE pv.account_id = ?
      AND pv.status = 'published'
      ${from ? "AND p.published_at >= ?" : ""}
      ${to   ? "AND p.published_at <= ?" : ""}
    ORDER BY p.published_at DESC
  `).all(...([req.params.id, ...(from ? [from] : []), ...(to ? [to] : [])]));

  // Latest follower snapshot
  const followerHistory = db.prepare(`
    SELECT recorded_at, followers, following, posts_count
    FROM account_analytics
    WHERE account_id = ?
    ORDER BY recorded_at DESC
    LIMIT 30
  `).all(req.params.id);

  res.json({ account_id: req.params.id, variants, count: variants.length, follower_history: followerHistory });
});

router.get('/best-times/:accountId', (req: Request, res: Response) => {
  const db = getDb();
  const variants = db.prepare(`
    SELECT strftime('%H', p.published_at) AS hour,
           strftime('%w', p.published_at) AS dow,
           COUNT(*) AS post_count,
           AVG(COALESCE(pa.impressions, 0) + COALESCE(pa.likes, 0) * 3 + COALESCE(pa.comments, 0) * 5) AS avg_engagement
    FROM post_variants pv
    JOIN posts p ON p.id = pv.post_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE pv.account_id = ? AND pv.status = 'published' AND p.published_at IS NOT NULL
    GROUP BY hour, dow
    ORDER BY avg_engagement DESC
    LIMIT 20
  `).all(req.params.accountId) as { hour: string; dow: string; post_count: number; avg_engagement: number }[];

  if (variants.length < 5) {
    res.json({ available: false, reason: 'Not enough data (need at least 5 published posts)' });
    return;
  }

  const suggestions = variants.slice(0, 3).map(v => ({
    hour: parseInt(v.hour),
    day_of_week: parseInt(v.dow),
    post_count: v.post_count,
    avg_engagement: Math.round(v.avg_engagement ?? 0),
  }));

  res.json({ available: true, suggestions });
});

// ─── CSV export ───────────────────────────────────────────────────────────────

router.get('/export/csv', (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const db = getDb();

  const rows = db.prepare(`
    SELECT p.title, p.published_at, a.platform, a.display_name,
           pv.body, pv.status, pv.platform_post_id,
           COALESCE(pa.likes,0) AS likes, COALESCE(pa.comments,0) AS comments,
           COALESCE(pa.shares,0) AS shares, COALESCE(pa.impressions,0) AS impressions,
           COALESCE(pa.reach,0) AS reach
    FROM post_variants pv
    JOIN posts p ON p.id = pv.post_id
    JOIN accounts a ON a.id = pv.account_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE p.studio_id = ?
      ${from ? "AND p.published_at >= ?" : ""}
      ${to   ? "AND p.published_at <= ?" : ""}
    ORDER BY p.published_at DESC
  `).all(...([req.studioId, ...(from ? [from] : []), ...(to ? [to] : [])])) as Record<string, unknown>[];

  const headers = ['Title', 'Published At', 'Platform', 'Account', 'Status', 'Platform Post ID', 'Likes', 'Comments', 'Shares', 'Impressions', 'Reach'];
  const cols = ['title', 'published_at', 'platform', 'display_name', 'status', 'platform_post_id', 'likes', 'comments', 'shares', 'impressions', 'reach'] as const;
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => cols.map(k => escape(r[k])).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="mediafox-analytics-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

export default router;
