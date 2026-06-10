"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
router.get('/campaigns', async (req, res) => {
    const { from, to } = req.query;
    const params = [req.studioId];
    let sql = `
    SELECT
      CASE
        WHEN p.title IS NULL OR trim(p.title) = '' THEN 'untitled'
        WHEN position(':' IN p.title) > 0 THEN lower(trim(substr(p.title, 1, position(':' IN p.title) - 1)))
        ELSE lower(trim(p.title))
      END AS campaign_key,
      a.platform AS platform,
      COUNT(pv.id) AS published_variants,
      SUM(COALESCE(pa.likes, 0)) AS likes,
      SUM(COALESCE(pa.comments, 0)) AS comments,
      SUM(COALESCE(pa.shares, 0)) AS shares,
      SUM(COALESCE(pa.impressions, 0)) AS impressions,
      SUM(COALESCE(pa.reach, 0)) AS reach,
      SUM(COALESCE(pa.clicks, 0)) AS clicks
    FROM posts p
    JOIN post_variants pv ON pv.post_id = p.id
    JOIN accounts a ON a.id = pv.account_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE p.studio_id = $1
      AND pv.status = 'published'
  `;
    if (from) {
        params.push(from);
        sql += ` AND p.published_at >= $${params.length}`;
    }
    if (to) {
        params.push(to);
        sql += ` AND p.published_at <= $${params.length}`;
    }
    sql += ' GROUP BY campaign_key, a.platform';
    const { rows } = await (0, db_1.getPool)().query(sql, params);
    const typedRows = rows;
    const campaigns = {};
    for (const row of typedRows) {
        const key = row.campaign_key || 'untitled';
        if (!campaigns[key]) {
            campaigns[key] = {
                campaign: key,
                published_variants: 0,
                engagement: { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0, clicks: 0 },
                by_platform: {},
            };
        }
        campaigns[key].published_variants += Number(row.published_variants) ?? 0;
        campaigns[key].engagement.likes += Number(row.likes) ?? 0;
        campaigns[key].engagement.comments += Number(row.comments) ?? 0;
        campaigns[key].engagement.shares += Number(row.shares) ?? 0;
        campaigns[key].engagement.impressions += Number(row.impressions) ?? 0;
        campaigns[key].engagement.reach += Number(row.reach) ?? 0;
        campaigns[key].engagement.clicks += Number(row.clicks) ?? 0;
        campaigns[key].by_platform[row.platform] = (campaigns[key].by_platform[row.platform] ?? 0) + (Number(row.published_variants) ?? 0);
    }
    const items = Object.values(campaigns)
        .sort((a, b) => b.engagement.impressions - a.engagement.impressions)
        .slice(0, 50);
    res.json({ campaigns: items, count: items.length });
});
router.get('/overview', async (req, res) => {
    const { from, to } = req.query;
    const postParams = [req.studioId];
    let postSql = `
    SELECT p.id, p.published_at,
           string_agg(DISTINCT a.platform, ',') AS platforms,
           COUNT(pv.id) AS variant_count,
           SUM(CASE WHEN pv.status='published' THEN 1 ELSE 0 END) AS published_count
    FROM posts p
    LEFT JOIN post_variants pv ON pv.post_id = p.id
    LEFT JOIN accounts a ON a.id = pv.account_id
    WHERE p.studio_id = $1
      AND p.status IN ('published','scheduled','failed')
  `;
    if (from) {
        postParams.push(from);
        postParams.push(from);
        postSql += ` AND (p.published_at >= $${postParams.length - 1} OR p.scheduled_at >= $${postParams.length})`;
    }
    if (to) {
        postParams.push(to);
        postParams.push(to);
        postSql += ` AND (p.published_at <= $${postParams.length - 1} OR p.scheduled_at <= $${postParams.length})`;
    }
    postSql += ' GROUP BY p.id ORDER BY p.published_at DESC LIMIT 200';
    const postsResult = await (0, db_1.getPool)().query(postSql, postParams);
    const posts = postsResult.rows;
    const byPlatform = {};
    for (const row of posts) {
        const plats = (row.platforms ?? '').split(',').filter(Boolean);
        for (const p of plats)
            byPlatform[p] = (byPlatform[p] ?? 0) + (Number(row.published_count) ?? 0);
    }
    // Aggregate engagement from synced analytics
    const engParams = [req.studioId];
    let engSql = `
    SELECT SUM(pa.likes) AS total_likes, SUM(pa.comments) AS total_comments,
           SUM(pa.shares) AS total_shares, SUM(pa.impressions) AS total_impressions,
           SUM(pa.reach) AS total_reach
    FROM post_analytics pa
    JOIN post_variants pv ON pv.id = pa.post_variant_id
    JOIN posts p ON p.id = pv.post_id
    WHERE p.studio_id = $1
  `;
    if (from) {
        engParams.push(from);
        engSql += ` AND p.published_at >= $${engParams.length}`;
    }
    if (to) {
        engParams.push(to);
        engSql += ` AND p.published_at <= $${engParams.length}`;
    }
    const engResult = await (0, db_1.getPool)().query(engSql, engParams);
    const engagement = engResult.rows[0];
    res.json({
        total_published: posts.reduce((s, r) => s + (Number(r.published_count) ?? 0), 0),
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
router.get('/posts/:id', async (req, res) => {
    const { rows: variants } = await (0, db_1.getPool)().query(`
    SELECT pv.*, a.platform, a.display_name,
           pa.likes, pa.comments, pa.shares, pa.impressions, pa.reach, pa.clicks, pa.synced_at
    FROM post_variants pv
    JOIN accounts a ON a.id = pv.account_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE pv.post_id = $1
  `, [req.params.id]);
    res.json({ variants });
});
router.get('/accounts/:id', async (req, res) => {
    const { from, to } = req.query;
    const varParams = [req.params.id];
    let varSql = `
    SELECT pv.*, p.published_at, pa.likes, pa.comments, pa.shares, pa.impressions, pa.reach
    FROM post_variants pv
    JOIN posts p ON p.id = pv.post_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE pv.account_id = $1
      AND pv.status = 'published'
  `;
    if (from) {
        varParams.push(from);
        varSql += ` AND p.published_at >= $${varParams.length}`;
    }
    if (to) {
        varParams.push(to);
        varSql += ` AND p.published_at <= $${varParams.length}`;
    }
    varSql += ' ORDER BY p.published_at DESC';
    const { rows: variants } = await (0, db_1.getPool)().query(varSql, varParams);
    // Latest follower snapshot
    const { rows: followerHistory } = await (0, db_1.getPool)().query(`
    SELECT recorded_at, followers, following, posts_count
    FROM account_analytics
    WHERE account_id = $1
    ORDER BY recorded_at DESC
    LIMIT 30
  `, [req.params.id]);
    res.json({ account_id: req.params.id, variants, count: variants.length, follower_history: followerHistory });
});
router.get('/best-times/:accountId', async (req, res) => {
    const { rows: variants } = await (0, db_1.getPool)().query(`
    SELECT to_char(p.published_at AT TIME ZONE 'UTC', 'HH24') AS hour,
           extract(dow FROM p.published_at AT TIME ZONE 'UTC')::text AS dow,
           COUNT(*) AS post_count,
           AVG(COALESCE(pa.impressions, 0) + COALESCE(pa.likes, 0) * 3 + COALESCE(pa.comments, 0) * 5) AS avg_engagement
    FROM post_variants pv
    JOIN posts p ON p.id = pv.post_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE pv.account_id = $1 AND pv.status = 'published' AND p.published_at IS NOT NULL
    GROUP BY hour, dow
    ORDER BY avg_engagement DESC
    LIMIT 20
  `, [req.params.accountId]);
    if (variants.length < 5) {
        res.json({ available: false, reason: 'Not enough data (need at least 5 published posts)' });
        return;
    }
    const suggestions = variants.slice(0, 3).map(v => ({
        hour: parseInt(v.hour),
        day_of_week: parseInt(v.dow),
        post_count: Number(v.post_count),
        avg_engagement: Math.round(Number(v.avg_engagement) ?? 0),
    }));
    res.json({ available: true, suggestions });
});
// ─── CSV export ───────────────────────────────────────────────────────────────
router.get('/export/csv', async (req, res) => {
    const { from, to } = req.query;
    const params = [req.studioId];
    let sql = `
    SELECT p.title, p.published_at, a.platform, a.display_name,
           pv.body, pv.status, pv.platform_post_id,
           COALESCE(pa.likes,0) AS likes, COALESCE(pa.comments,0) AS comments,
           COALESCE(pa.shares,0) AS shares, COALESCE(pa.impressions,0) AS impressions,
           COALESCE(pa.reach,0) AS reach
    FROM post_variants pv
    JOIN posts p ON p.id = pv.post_id
    JOIN accounts a ON a.id = pv.account_id
    LEFT JOIN post_analytics pa ON pa.post_variant_id = pv.id
    WHERE p.studio_id = $1
  `;
    if (from) {
        params.push(from);
        sql += ` AND p.published_at >= $${params.length}`;
    }
    if (to) {
        params.push(to);
        sql += ` AND p.published_at <= $${params.length}`;
    }
    sql += ' ORDER BY p.published_at DESC';
    const { rows } = await (0, db_1.getPool)().query(sql, params);
    const typedRows = rows;
    const headers = ['Title', 'Published At', 'Platform', 'Account', 'Status', 'Platform Post ID', 'Likes', 'Comments', 'Shares', 'Impressions', 'Reach'];
    const cols = ['title', 'published_at', 'platform', 'display_name', 'status', 'platform_post_id', 'likes', 'comments', 'shares', 'impressions', 'reach'];
    const escape = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...typedRows.map(r => cols.map(k => escape(r[k])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="mediafox-analytics-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
});
exports.default = router;
//# sourceMappingURL=analytics.js.map