import { getPool } from './db';

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

export const checkRateLimit = async (accountId: string, platform: Platform): Promise<RateLimitStatus> => {
  const cfg = LIMITS[platform];
  const now = Date.now();
  const windowStartMs = now - cfg.windowMs;

  const { rows } = await getPool().query(`
    SELECT used, window_start FROM api_rate_limits
    WHERE account_id = $1 AND platform = $2
  `, [accountId, platform]);
  const row = rows[0] as { used: number; window_start: string } | undefined;

  if (!row || new Date(row.window_start).getTime() < windowStartMs) {
    await getPool().query(`
      INSERT INTO api_rate_limits (account_id, platform, used, window_start)
      VALUES ($1, $2, 0, $3)
      ON CONFLICT(account_id, platform) DO UPDATE SET used=0, window_start=EXCLUDED.window_start
    `, [accountId, platform, new Date(now).toISOString()]);
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
};

export const consumeRateLimit = async (accountId: string, platform: Platform, count = 1): Promise<void> => {
  const now = Date.now();
  const cfg = LIMITS[platform];
  const windowStartIso = new Date(now).toISOString();
  const windowMs = cfg.windowMs;

  await getPool().query(`
    INSERT INTO api_rate_limits (account_id, platform, used, window_start)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(account_id, platform) DO UPDATE SET
      used = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - api_rate_limits.window_start)) * 1000 > $5
        THEN $3
        ELSE api_rate_limits.used + $3
      END,
      window_start = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - api_rate_limits.window_start)) * 1000 > $5
        THEN $4
        ELSE api_rate_limits.window_start
      END
  `, [accountId, platform, count, windowStartIso, windowMs]);
};
