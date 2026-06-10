"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeRateLimit = exports.checkRateLimit = void 0;
const db_1 = require("./db");
const LIMITS = {
    facebook: { windowMs: 60 * 60 * 1000, maxCalls: 200 },
    instagram: { windowMs: 60 * 60 * 1000, maxCalls: 200 },
    linkedin: { windowMs: 24 * 60 * 60 * 1000, maxCalls: 100 },
    bluesky: { windowMs: 60 * 60 * 1000, maxCalls: 1000 },
    discord: { windowMs: 1000, maxCalls: 50 },
    slack: { windowMs: 60 * 1000, maxCalls: 50 },
};
const checkRateLimit = async (accountId, platform) => {
    const cfg = LIMITS[platform];
    const now = Date.now();
    const windowStartMs = now - cfg.windowMs;
    const { rows } = await (0, db_1.getPool)().query(`
    SELECT used, window_start FROM api_rate_limits
    WHERE account_id = $1 AND platform = $2
  `, [accountId, platform]);
    const row = rows[0];
    if (!row || new Date(row.window_start).getTime() < windowStartMs) {
        await (0, db_1.getPool)().query(`
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
exports.checkRateLimit = checkRateLimit;
const consumeRateLimit = async (accountId, platform, count = 1) => {
    const now = Date.now();
    const cfg = LIMITS[platform];
    const windowStartIso = new Date(now).toISOString();
    const windowMs = cfg.windowMs;
    await (0, db_1.getPool)().query(`
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
exports.consumeRateLimit = consumeRateLimit;
//# sourceMappingURL=rateLimit.js.map