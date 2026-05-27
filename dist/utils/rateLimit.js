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
const checkRateLimit = (accountId, platform) => {
    const db = (0, db_1.getDb)();
    const cfg = LIMITS[platform];
    const now = Date.now();
    const windowStart = new Date(now - cfg.windowMs).toISOString();
    const row = db.prepare(`
    SELECT used, window_start FROM api_rate_limits
    WHERE account_id = ? AND platform = ?
  `).get(accountId, platform);
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
exports.checkRateLimit = checkRateLimit;
const consumeRateLimit = (accountId, platform, count = 1) => {
    const db = (0, db_1.getDb)();
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
  `).run(accountId, platform, count, new Date(now).toISOString(), cfg.windowMs, count, count, cfg.windowMs, new Date(now).toISOString());
};
exports.consumeRateLimit = consumeRateLimit;
//# sourceMappingURL=rateLimit.js.map