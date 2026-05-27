import { getDb } from './db';

export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'bluesky' | 'discord' | 'slack';

interface WindowConfig {
  windowMs: number;
  maxCalls: number;
}

const LIMITS: Record<Platform, WindowConfig> = {
  facebook:  { windowMs: 60 * 60 * 1000, maxCalls: 200 },
  instagram: { windowMs: 60 * 60 * 1000, maxCalls: 200 },
  linkedin:  { windowMs: 24 * 60 * 60 * 1000, maxCalls: 100 },
  bluesky:   { windowMs: 60 * 60 * 1000, maxCalls: 1000 },
  discord:   { windowMs: 1000, maxCalls: 50 },
  slack:     { windowMs: 60 * 1000, maxCalls: 50 },
};

export interface RateLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

export const checkRateLimit = (accountId: string, platform: Platform): RateLimitStatus => {
  const db = getDb();
  const cfg = LIMITS[platform];
  const now = Date.now();
  const windowStart = new Date(now - cfg.windowMs).toISOString();

  const row = db.prepare(`
    SELECT used, window_start FROM api_rate_limits
    WHERE account_id = ? AND platform = ?
  `).get(accountId, platform) as { used: number; window_start: string } | undefined;

  if (!row || new Date(row.window_start).getTime() < now - cfg.windowMs) {
    db.prepare(`
      INSERT INTO api_rate_limits (account_id, platform, used, window_start)
      VALUES (?, ?, 0, ?)
      ON CONFLICT(account_id, platform) DO UPDATE SET used=0, window_start=excluded.window_start
    `).run(accountId, platform, new Date(now).toISOString());
    return { allowed: true, used: 0, limit: cfg.maxCalls, remaining: cfg.maxCalls, resetsAt: new Date(now + cfg.windowMs).toISOString() };
  }

  const resetsAt = new Date(new Date(row.window_start).getTime() + cfg.windowMs).toISOString();
  return {
    allowed: row.used < cfg.maxCalls,
    used: row.used,
    limit: cfg.maxCalls,
    remaining: Math.max(0, cfg.maxCalls - row.used),
    resetsAt,
  };

  void windowStart;
};

export const consumeRateLimit = (accountId: string, platform: Platform, count = 1): void => {
  const db = getDb();
  const now = Date.now();
  const cfg = LIMITS[platform];

  db.prepare(`
    INSERT INTO api_rate_limits (account_id, platform, used, window_start)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id, platform) DO UPDATE SET
      used = CASE
        WHEN (unixepoch('now') * 1000 - unixepoch(window_start) * 1000) > ?
        THEN ?
        ELSE used + ?
      END,
      window_start = CASE
        WHEN (unixepoch('now') * 1000 - unixepoch(window_start) * 1000) > ?
        THEN ?
        ELSE window_start
      END
  `).run(
    accountId, platform, count, new Date(now).toISOString(),
    cfg.windowMs, count, count,
    cfg.windowMs, new Date(now).toISOString()
  );
};
