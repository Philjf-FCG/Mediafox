"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markTikTokAssistPublished = exports.getTikTokAssistsByPost = exports.createTikTokAssist = exports.markRedditAssistPublished = exports.getRedditAssistsByPost = exports.createRedditAssist = exports.markNotificationsRead = exports.getNotifications = exports.createNotification = exports.getPendingApproval = exports.resolveApproval = exports.createApprovalRequest = exports.ensureOwner = exports.removeMember = exports.upsertMember = exports.getMembersByStudio = exports.getMember = exports.purgeArchivedContentOlderThan = exports.getMediaAssetByHash = exports.getMediaAssetBySource = exports.restoreMediaAsset = exports.archiveMediaAsset = exports.deleteMediaAsset = exports.getMediaAssets = exports.createMediaAsset = exports.restoreInboxItem = exports.archiveInboxItem = exports.updateInboxItem = exports.getInboxItems = exports.upsertInboxItem = exports.resolveQueueItem = exports.lockQueueItem = exports.getDueQueueItems = exports.enqueueVariant = exports.updateVariant = exports.getVariantsByPost = exports.createPostVariant = exports.restorePost = exports.archivePost = exports.updatePost = exports.getPostsInRange = exports.getPostsByStudio = exports.getPostById = exports.createPost = exports.deleteAccount = exports.updateAccountTokens = exports.updateAccountStatus = exports.upsertAccount = exports.getAccountById = exports.getAccountsByStudio = void 0;
exports.audit = exports.updateUser = exports.createUser = exports.getUserById = exports.getUserByEmail = exports.upsertStudioIntegrationSettings = exports.getStudioIntegrationSettingsSummary = exports.getStudioIntegrationSettings = exports.setLocalStudioPlan = exports.getLocalStudioPlan = void 0;
exports.getPool = getPool;
exports.initSchema = initSchema;
const pg_1 = __importDefault(require("pg"));
const pg_2 = require("pg");
const crypto_1 = require("./crypto");
// ─── Type parsers ─────────────────────────────────────────────────────────────
pg_1.default.types.setTypeParser(pg_1.default.types.builtins.TIMESTAMP, (v) => v ? new Date(v + 'Z').toISOString() : null);
pg_1.default.types.setTypeParser(pg_1.default.types.builtins.TIMESTAMPTZ, (v) => v ? new Date(v).toISOString() : null);
// ─── Pool ─────────────────────────────────────────────────────────────────────
let _pool = null;
function getPool() {
    if (!_pool) {
        _pool = new pg_2.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://localhost/mediafox' });
    }
    return _pool;
}
// ─── Schema ───────────────────────────────────────────────────────────────────
async function initSchema() {
    const pool = getPool();
    await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id               TEXT PRIMARY KEY,
      studio_id        TEXT NOT NULL,
      owner_user_id    TEXT,
      type             TEXT NOT NULL CHECK(type IN ('company','personal')),
      platform         TEXT NOT NULL CHECK(platform IN ('facebook','instagram','linkedin','bluesky','discord','slack')),
      platform_id      TEXT NOT NULL,
      display_name     TEXT NOT NULL,
      avatar_url       TEXT,
      access_token     TEXT NOT NULL,
      refresh_token    TEXT,
      token_expires_at TIMESTAMPTZ,
      scope            TEXT,
      extra            TEXT DEFAULT '{}',
      connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_synced_at   TIMESTAMPTZ,
      status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','error')),
      UNIQUE(studio_id, platform, platform_id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id               TEXT PRIMARY KEY,
      studio_id        TEXT NOT NULL,
      author_user_id   TEXT NOT NULL,
      title            TEXT,
      status           TEXT NOT NULL DEFAULT 'draft'
                         CHECK(status IN ('draft','pending_approval','scheduled','publishing','published','failed','cancelled')),
      scheduled_at     TIMESTAMPTZ,
      published_at     TIMESTAMPTZ,
      archived_at      TIMESTAMPTZ,
      archived_by      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS post_variants (
      id               TEXT PRIMARY KEY,
      post_id          TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      body             TEXT NOT NULL DEFAULT '',
      media_ids        TEXT NOT NULL DEFAULT '[]',
      platform_post_id TEXT,
      status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','published','failed')),
      error_message    TEXT,
      retry_count      INTEGER NOT NULL DEFAULT 0,
      published_at     TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS post_queue (
      id               TEXT PRIMARY KEY,
      post_variant_id  TEXT NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
      fire_at          TIMESTAMPTZ NOT NULL,
      attempts         INTEGER NOT NULL DEFAULT 0,
      last_attempt_at  TIMESTAMPTZ,
      status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','processing','done','dead')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id               TEXT PRIMARY KEY,
      studio_id        TEXT NOT NULL,
      uploaded_by      TEXT NOT NULL,
      filename         TEXT NOT NULL,
      mime_type        TEXT NOT NULL,
      file_size        INTEGER NOT NULL,
      storage_path     TEXT NOT NULL,
      width            INTEGER,
      height           INTEGER,
      duration_s       REAL,
      tags             TEXT NOT NULL DEFAULT '[]',
      source_provider  TEXT,
      source_id        TEXT,
      source_hash      TEXT,
      archived_at      TIMESTAMPTZ,
      archived_by      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inbox_items (
      id                   TEXT PRIMARY KEY,
      studio_id            TEXT NOT NULL,
      account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      platform             TEXT NOT NULL,
      platform_item_id     TEXT NOT NULL,
      type                 TEXT NOT NULL CHECK(type IN ('comment','mention','reply','dm','reaction','message')),
      author_name          TEXT,
      author_platform_id   TEXT,
      body                 TEXT,
      parent_post_id       TEXT REFERENCES posts(id),
      status               TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','resolved')),
      assigned_to          TEXT,
      internal_note        TEXT,
      archived_at          TIMESTAMPTZ,
      archived_by          TEXT,
      received_at          TIMESTAMPTZ NOT NULL,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, platform_item_id)
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id               TEXT PRIMARY KEY,
      post_id          TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      requested_by     TEXT NOT NULL,
      reviewer_id      TEXT,
      status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','approved','rejected','withdrawn')),
      reviewer_note    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at      TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS studio_members (
      studio_id        TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      email            TEXT NOT NULL,
      name             TEXT NOT NULL,
      role             TEXT NOT NULL CHECK(role IN ('owner','manager','editor','viewer')),
      joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (studio_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id               TEXT PRIMARY KEY,
      recipient_id     TEXT NOT NULL,
      studio_id        TEXT NOT NULL,
      type             TEXT NOT NULL,
      title            TEXT NOT NULL,
      body             TEXT,
      link             TEXT,
      read             INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reddit_assists (
      id               TEXT PRIMARY KEY,
      post_id          TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      studio_id        TEXT NOT NULL,
      requested_by     TEXT NOT NULL,
      subreddit        TEXT NOT NULL,
      title            TEXT NOT NULL,
      body             TEXT,
      status           TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','handed_off','published','cancelled')),
      handoff_note     TEXT,
      publish_url      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tiktok_assists (
      id               TEXT PRIMARY KEY,
      post_id          TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      studio_id        TEXT NOT NULL,
      requested_by     TEXT NOT NULL,
      caption          TEXT NOT NULL,
      media_asset_id   TEXT,
      status           TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','handed_off','published','cancelled')),
      handoff_note     TEXT,
      publish_url      TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id               TEXT PRIMARY KEY,
      studio_id        TEXT NOT NULL,
      actor_id         TEXT NOT NULL,
      action           TEXT NOT NULL,
      entity_type      TEXT NOT NULL,
      entity_id        TEXT NOT NULL,
      detail           TEXT DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS api_rate_limits (
      account_id       TEXT NOT NULL,
      platform         TEXT NOT NULL,
      used             INTEGER NOT NULL DEFAULT 0,
      window_start     TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (account_id, platform)
    );

    CREATE TABLE IF NOT EXISTS post_analytics (
      id               TEXT PRIMARY KEY,
      post_variant_id  TEXT NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
      platform         TEXT NOT NULL,
      synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      likes            INTEGER DEFAULT 0,
      comments         INTEGER DEFAULT 0,
      shares           INTEGER DEFAULT 0,
      reach            INTEGER DEFAULT 0,
      impressions      INTEGER DEFAULT 0,
      clicks           INTEGER DEFAULT 0,
      UNIQUE(post_variant_id)
    );

    CREATE TABLE IF NOT EXISTS account_analytics (
      id               TEXT PRIMARY KEY,
      account_id       TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      recorded_at      TIMESTAMPTZ NOT NULL,
      followers        INTEGER DEFAULT 0,
      following        INTEGER DEFAULT 0,
      posts_count      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS studio_plans (
      studio_id     TEXT PRIMARY KEY,
      plan          TEXT NOT NULL DEFAULT 'pro',
      set_by        TEXT,
      set_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS studio_integration_settings (
      studio_id                  TEXT PRIMARY KEY,
      linkedin_client_id         TEXT,
      linkedin_client_secret_enc TEXT,
      linkedin_redirect_uri      TEXT,
      linkedin_scopes            TEXT,
      meta_app_id                TEXT,
      meta_app_secret_enc        TEXT,
      meta_redirect_uri          TEXT,
      meta_scopes                TEXT,
      updated_by                 TEXT,
      updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      google_sub    TEXT,
      role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_posts_studio    ON posts(studio_id, status);
    CREATE INDEX IF NOT EXISTS idx_posts_archived  ON posts(studio_id, archived_at);
    CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at) WHERE status='scheduled';
    CREATE INDEX IF NOT EXISTS idx_variants_post   ON post_variants(post_id);
    CREATE INDEX IF NOT EXISTS idx_queue_fire      ON post_queue(fire_at) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS idx_inbox_studio    ON inbox_items(studio_id, status);
    CREATE INDEX IF NOT EXISTS idx_inbox_archived  ON inbox_items(studio_id, archived_at);
    CREATE INDEX IF NOT EXISTS idx_accounts_studio ON accounts(studio_id);
    CREATE INDEX IF NOT EXISTS idx_media_archived  ON media_assets(studio_id, archived_at);
    CREATE INDEX IF NOT EXISTS idx_media_source    ON media_assets(studio_id, source_provider, source_id);
    CREATE INDEX IF NOT EXISTS idx_media_hash      ON media_assets(studio_id, source_hash);
    CREATE INDEX IF NOT EXISTS idx_notifications   ON notifications(recipient_id, read);
    CREATE INDEX IF NOT EXISTS idx_audit           ON audit_events(studio_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_post_analytics  ON post_analytics(post_variant_id);
    CREATE INDEX IF NOT EXISTS idx_acct_analytics  ON account_analytics(account_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_reddit_assists  ON reddit_assists(studio_id, post_id, status);
    CREATE INDEX IF NOT EXISTS idx_tiktok_assists  ON tiktok_assists(studio_id, post_id, status);
  `);
    // Backward-compatible migration for existing databases created before archive columns existed.
    await pool.query(`DO $$ BEGIN ALTER TABLE posts ADD COLUMN archived_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE posts ADD COLUMN archived_by TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE media_assets ADD COLUMN archived_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE media_assets ADD COLUMN archived_by TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE media_assets ADD COLUMN source_provider TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE media_assets ADD COLUMN source_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE media_assets ADD COLUMN source_hash TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE inbox_items ADD COLUMN archived_at TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
    await pool.query(`DO $$ BEGIN ALTER TABLE inbox_items ADD COLUMN archived_by TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`);
}
const getAccountsByStudio = async (studioId) => (await getPool().query('SELECT * FROM accounts WHERE studio_id = $1 ORDER BY platform, display_name', [studioId])).rows;
exports.getAccountsByStudio = getAccountsByStudio;
const getAccountById = async (id) => (await getPool().query('SELECT * FROM accounts WHERE id = $1', [id])).rows[0] ?? null;
exports.getAccountById = getAccountById;
const upsertAccount = async (a) => {
    const status = a.status ?? 'active';
    await getPool().query(`
    INSERT INTO accounts (id, studio_id, owner_user_id, type, platform, platform_id, display_name,
      avatar_url, access_token, refresh_token, token_expires_at, scope, extra, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT(studio_id, platform, platform_id) DO UPDATE SET
      display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url,
      access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
      token_expires_at=EXCLUDED.token_expires_at, scope=EXCLUDED.scope,
      extra=EXCLUDED.extra, status='active'
  `, [a.id, a.studio_id, a.owner_user_id, a.type, a.platform, a.platform_id, a.display_name,
        a.avatar_url, a.access_token, a.refresh_token, a.token_expires_at, a.scope, a.extra, status]);
    return (await (0, exports.getAccountById)(a.id));
};
exports.upsertAccount = upsertAccount;
const updateAccountStatus = async (id, status) => {
    await getPool().query('UPDATE accounts SET status=$1 WHERE id=$2', [status, id]);
};
exports.updateAccountStatus = updateAccountStatus;
const updateAccountTokens = async (id, accessToken, refreshToken, expiresAt) => {
    await getPool().query("UPDATE accounts SET access_token=$1, refresh_token=$2, token_expires_at=$3, status='active' WHERE id=$4", [accessToken, refreshToken, expiresAt, id]);
};
exports.updateAccountTokens = updateAccountTokens;
const deleteAccount = async (id) => {
    await getPool().query('DELETE FROM accounts WHERE id=$1', [id]);
};
exports.deleteAccount = deleteAccount;
const createPost = async (p) => {
    await getPool().query('INSERT INTO posts (id, studio_id, author_user_id, title) VALUES ($1, $2, $3, $4)', [p.id, p.studio_id, p.author_user_id, p.title]);
    return (await getPool().query('SELECT * FROM posts WHERE id=$1', [p.id])).rows[0];
};
exports.createPost = createPost;
const getPostById = async (id) => (await getPool().query('SELECT * FROM posts WHERE id=$1', [id])).rows[0] ?? null;
exports.getPostById = getPostById;
const getPostsByStudio = async (studioId, status, includeArchived = false) => {
    if (status) {
        if (includeArchived)
            return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 AND status=$2 ORDER BY created_at DESC', [studioId, status])).rows;
        return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 AND status=$2 AND archived_at IS NULL ORDER BY created_at DESC', [studioId, status])).rows;
    }
    if (includeArchived)
        return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 ORDER BY created_at DESC', [studioId])).rows;
    return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 AND archived_at IS NULL ORDER BY created_at DESC', [studioId])).rows;
};
exports.getPostsByStudio = getPostsByStudio;
const getPostsInRange = async (studioId, from, to, includeArchived = false) => {
    const archivedClause = includeArchived ? '' : 'AND archived_at IS NULL';
    return (await getPool().query(`SELECT * FROM posts WHERE studio_id=$1 ${archivedClause} AND (
      (scheduled_at >= $2 AND scheduled_at <= $3) OR (published_at >= $2 AND published_at <= $3)
    ) ORDER BY COALESCE(scheduled_at, published_at)`, [studioId, from, to])).rows;
};
exports.getPostsInRange = getPostsInRange;
const updatePost = async (id, fields) => {
    const entries = Object.entries(fields).filter(([k]) => !['id', 'studio_id', 'author_user_id', 'created_at'].includes(k));
    if (!entries.length)
        return;
    const setClauses = entries.map(([k], i) => `${k}=$${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    await getPool().query(`UPDATE posts SET ${setClauses}, updated_at=NOW() WHERE id=$${values.length + 1}`, [...values, id]);
};
exports.updatePost = updatePost;
const archivePost = async (id, actorId) => {
    await getPool().query('UPDATE posts SET archived_at=NOW(), archived_by=$1, updated_at=NOW() WHERE id=$2', [actorId, id]);
};
exports.archivePost = archivePost;
const restorePost = async (id) => {
    await getPool().query('UPDATE posts SET archived_at=NULL, archived_by=NULL, updated_at=NOW() WHERE id=$1', [id]);
};
exports.restorePost = restorePost;
const createPostVariant = async (v) => {
    await getPool().query('INSERT INTO post_variants (id, post_id, account_id, body, media_ids) VALUES ($1, $2, $3, $4, $5)', [v.id, v.post_id, v.account_id, v.body, v.media_ids]);
    return (await getPool().query('SELECT * FROM post_variants WHERE id=$1', [v.id])).rows[0];
};
exports.createPostVariant = createPostVariant;
const getVariantsByPost = async (postId) => (await getPool().query('SELECT * FROM post_variants WHERE post_id=$1', [postId])).rows;
exports.getVariantsByPost = getVariantsByPost;
const updateVariant = async (id, fields) => {
    const entries = Object.entries(fields).filter(([k]) => k !== 'id');
    if (!entries.length)
        return;
    const setClauses = entries.map(([k], i) => `${k}=$${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    await getPool().query(`UPDATE post_variants SET ${setClauses} WHERE id=$${values.length + 1}`, [...values, id]);
};
exports.updateVariant = updateVariant;
const enqueueVariant = async (id, variantId, fireAt) => {
    await getPool().query('INSERT INTO post_queue (id, post_variant_id, fire_at) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET fire_at=EXCLUDED.fire_at', [id, variantId, fireAt]);
};
exports.enqueueVariant = enqueueVariant;
const getDueQueueItems = async () => (await getPool().query("SELECT * FROM post_queue WHERE status='pending' AND fire_at <= NOW() ORDER BY fire_at LIMIT 50")).rows;
exports.getDueQueueItems = getDueQueueItems;
const lockQueueItem = async (id) => {
    const r = await getPool().query("UPDATE post_queue SET status='processing', last_attempt_at=NOW(), attempts=attempts+1 WHERE id=$1 AND status='pending'", [id]);
    return (r.rowCount ?? 0) > 0;
};
exports.lockQueueItem = lockQueueItem;
const resolveQueueItem = async (id, success, nextFireAt) => {
    if (success) {
        await getPool().query("UPDATE post_queue SET status='done' WHERE id=$1", [id]);
    }
    else if (nextFireAt) {
        await getPool().query("UPDATE post_queue SET status='pending', fire_at=$1 WHERE id=$2", [nextFireAt, id]);
    }
    else {
        await getPool().query("UPDATE post_queue SET status='dead' WHERE id=$1", [id]);
    }
};
exports.resolveQueueItem = resolveQueueItem;
const upsertInboxItem = async (item) => {
    await getPool().query(`
    INSERT INTO inbox_items (id, studio_id, account_id, platform, platform_item_id, type,
      author_name, author_platform_id, body, parent_post_id, received_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(account_id, platform_item_id) DO NOTHING
  `, [item.id, item.studio_id, item.account_id, item.platform, item.platform_item_id, item.type,
        item.author_name, item.author_platform_id, item.body, item.parent_post_id, item.received_at]);
};
exports.upsertInboxItem = upsertInboxItem;
const getInboxItems = async (studioId, filters = {}) => {
    const params = [studioId];
    let q = 'SELECT * FROM inbox_items WHERE studio_id=$1';
    if (!filters.includeArchived)
        q += ' AND archived_at IS NULL';
    if (filters.platform) {
        params.push(filters.platform);
        q += ` AND platform=$${params.length}`;
    }
    if (filters.status) {
        params.push(filters.status);
        q += ` AND status=$${params.length}`;
    }
    if (filters.accountId) {
        params.push(filters.accountId);
        q += ` AND account_id=$${params.length}`;
    }
    q += ' ORDER BY received_at DESC LIMIT 200';
    return (await getPool().query(q, params)).rows;
};
exports.getInboxItems = getInboxItems;
const updateInboxItem = async (id, fields) => {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (!entries.length)
        return;
    const setClauses = entries.map(([k], i) => `${k}=$${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    await getPool().query(`UPDATE inbox_items SET ${setClauses} WHERE id=$${values.length + 1}`, [...values, id]);
};
exports.updateInboxItem = updateInboxItem;
const archiveInboxItem = async (id, actorId) => {
    await getPool().query('UPDATE inbox_items SET archived_at=NOW(), archived_by=$1 WHERE id=$2', [actorId, id]);
};
exports.archiveInboxItem = archiveInboxItem;
const restoreInboxItem = async (id) => {
    await getPool().query('UPDATE inbox_items SET archived_at=NULL, archived_by=NULL WHERE id=$1', [id]);
};
exports.restoreInboxItem = restoreInboxItem;
const createMediaAsset = async (a) => {
    await getPool().query(`INSERT INTO media_assets (id,studio_id,uploaded_by,filename,mime_type,file_size,storage_path,width,height,duration_s,tags,source_provider,source_id,source_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [a.id, a.studio_id, a.uploaded_by, a.filename, a.mime_type, a.file_size, a.storage_path,
        a.width, a.height, a.duration_s, a.tags,
        a.source_provider ?? null, a.source_id ?? null, a.source_hash ?? null]);
    return (await getPool().query('SELECT * FROM media_assets WHERE id=$1', [a.id])).rows[0];
};
exports.createMediaAsset = createMediaAsset;
const getMediaAssets = async (studioId, q, includeArchived = false) => {
    if (q) {
        const like = `%${q}%`;
        if (includeArchived)
            return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND (filename LIKE $2 OR tags LIKE $2) ORDER BY created_at DESC', [studioId, like])).rows;
        return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND archived_at IS NULL AND (filename LIKE $2 OR tags LIKE $2) ORDER BY created_at DESC', [studioId, like])).rows;
    }
    if (includeArchived)
        return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 ORDER BY created_at DESC', [studioId])).rows;
    return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND archived_at IS NULL ORDER BY created_at DESC', [studioId])).rows;
};
exports.getMediaAssets = getMediaAssets;
const deleteMediaAsset = async (id) => {
    await getPool().query('DELETE FROM media_assets WHERE id=$1', [id]);
};
exports.deleteMediaAsset = deleteMediaAsset;
const archiveMediaAsset = async (id, actorId) => {
    await getPool().query('UPDATE media_assets SET archived_at=NOW(), archived_by=$1 WHERE id=$2', [actorId, id]);
};
exports.archiveMediaAsset = archiveMediaAsset;
const restoreMediaAsset = async (id) => {
    await getPool().query('UPDATE media_assets SET archived_at=NULL, archived_by=NULL WHERE id=$1', [id]);
};
exports.restoreMediaAsset = restoreMediaAsset;
const getMediaAssetBySource = async (studioId, provider, sourceId) => (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND source_provider=$2 AND source_id=$3 LIMIT 1', [studioId, provider, sourceId])).rows[0] ?? null;
exports.getMediaAssetBySource = getMediaAssetBySource;
const getMediaAssetByHash = async (studioId, sourceHash) => (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND source_hash=$2 LIMIT 1', [studioId, sourceHash])).rows[0] ?? null;
exports.getMediaAssetByHash = getMediaAssetByHash;
const purgeArchivedContentOlderThan = async (cutoffIso) => {
    const pool = getPool();
    const mediaRows = (await pool.query('SELECT id, storage_path FROM media_assets WHERE archived_at IS NOT NULL AND archived_at <= $1', [cutoffIso])).rows;
    let mediaDeleted = 0;
    if (mediaRows.length > 0) {
        const ids = mediaRows.map(r => r.id);
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const mediaDelete = await pool.query(`DELETE FROM media_assets WHERE id IN (${placeholders})`, ids);
        mediaDeleted = mediaDelete.rowCount ?? 0;
    }
    const postDelete = await pool.query('DELETE FROM posts WHERE archived_at IS NOT NULL AND archived_at <= $1', [cutoffIso]);
    const inboxDelete = await pool.query('DELETE FROM inbox_items WHERE archived_at IS NOT NULL AND archived_at <= $1', [cutoffIso]);
    return {
        postsDeleted: postDelete.rowCount ?? 0,
        inboxDeleted: inboxDelete.rowCount ?? 0,
        mediaDeleted,
        mediaStoragePaths: mediaRows.map(r => r.storage_path),
    };
};
exports.purgeArchivedContentOlderThan = purgeArchivedContentOlderThan;
const getMember = async (studioId, userId) => (await getPool().query('SELECT * FROM studio_members WHERE studio_id=$1 AND user_id=$2', [studioId, userId])).rows[0] ?? null;
exports.getMember = getMember;
const getMembersByStudio = async (studioId) => (await getPool().query('SELECT * FROM studio_members WHERE studio_id=$1 ORDER BY role, name', [studioId])).rows;
exports.getMembersByStudio = getMembersByStudio;
const upsertMember = async (m) => {
    await getPool().query(`INSERT INTO studio_members (studio_id,user_id,email,name,role)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT(studio_id,user_id) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, role=EXCLUDED.role`, [m.studio_id, m.user_id, m.email, m.name, m.role]);
};
exports.upsertMember = upsertMember;
const removeMember = async (studioId, userId) => {
    await getPool().query('DELETE FROM studio_members WHERE studio_id=$1 AND user_id=$2', [studioId, userId]);
};
exports.removeMember = removeMember;
const ensureOwner = async (studioId, userId, email, name) => {
    const existing = await (0, exports.getMember)(studioId, userId);
    if (!existing) {
        await (0, exports.upsertMember)({ studio_id: studioId, user_id: userId, email, name, role: 'owner', joined_at: new Date().toISOString() });
    }
};
exports.ensureOwner = ensureOwner;
const createApprovalRequest = async (id, postId, requestedBy) => {
    await getPool().query('INSERT INTO approval_requests (id,post_id,requested_by) VALUES ($1,$2,$3)', [id, postId, requestedBy]);
    return (await getPool().query('SELECT * FROM approval_requests WHERE id=$1', [id])).rows[0];
};
exports.createApprovalRequest = createApprovalRequest;
const resolveApproval = async (id, status, reviewerId, note) => {
    await getPool().query('UPDATE approval_requests SET status=$1,reviewer_id=$2,reviewer_note=$3,resolved_at=NOW() WHERE id=$4', [status, reviewerId ?? null, note ?? null, id]);
};
exports.resolveApproval = resolveApproval;
const getPendingApproval = async (postId) => (await getPool().query("SELECT * FROM approval_requests WHERE post_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [postId])).rows[0] ?? null;
exports.getPendingApproval = getPendingApproval;
// ─── Notifications ───────────────────────────────────────────────────────────
const createNotification = async (id, recipientId, studioId, type, title, body, link) => {
    await getPool().query('INSERT INTO notifications (id,recipient_id,studio_id,type,title,body,link) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, recipientId, studioId, type, title, body ?? null, link ?? null]);
};
exports.createNotification = createNotification;
const getNotifications = async (recipientId, unreadOnly = false) => {
    if (unreadOnly)
        return (await getPool().query("SELECT * FROM notifications WHERE recipient_id=$1 AND read=0 ORDER BY created_at DESC LIMIT 50", [recipientId])).rows;
    return (await getPool().query('SELECT * FROM notifications WHERE recipient_id=$1 ORDER BY created_at DESC LIMIT 50', [recipientId])).rows;
};
exports.getNotifications = getNotifications;
const markNotificationsRead = async (recipientId) => {
    await getPool().query('UPDATE notifications SET read=1 WHERE recipient_id=$1', [recipientId]);
};
exports.markNotificationsRead = markNotificationsRead;
const createRedditAssist = async (r) => {
    await getPool().query(`
    INSERT INTO reddit_assists (id, post_id, studio_id, requested_by, subreddit, title, body, status, handoff_note)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'handed_off', $8)
  `, [r.id, r.post_id, r.studio_id, r.requested_by, r.subreddit, r.title, r.body, r.handoff_note]);
    return (await getPool().query('SELECT * FROM reddit_assists WHERE id=$1', [r.id])).rows[0];
};
exports.createRedditAssist = createRedditAssist;
const getRedditAssistsByPost = async (studioId, postId) => (await getPool().query('SELECT * FROM reddit_assists WHERE studio_id=$1 AND post_id=$2 ORDER BY created_at DESC', [studioId, postId])).rows;
exports.getRedditAssistsByPost = getRedditAssistsByPost;
const markRedditAssistPublished = async (id, publishUrl) => {
    await getPool().query("UPDATE reddit_assists SET status='published', publish_url=$1, updated_at=NOW() WHERE id=$2", [publishUrl, id]);
};
exports.markRedditAssistPublished = markRedditAssistPublished;
const createTikTokAssist = async (r) => {
    await getPool().query(`
    INSERT INTO tiktok_assists (id, post_id, studio_id, requested_by, caption, media_asset_id, status, handoff_note)
    VALUES ($1, $2, $3, $4, $5, $6, 'handed_off', $7)
  `, [r.id, r.post_id, r.studio_id, r.requested_by, r.caption, r.media_asset_id, r.handoff_note]);
    return (await getPool().query('SELECT * FROM tiktok_assists WHERE id=$1', [r.id])).rows[0];
};
exports.createTikTokAssist = createTikTokAssist;
const getTikTokAssistsByPost = async (studioId, postId) => (await getPool().query('SELECT * FROM tiktok_assists WHERE studio_id=$1 AND post_id=$2 ORDER BY created_at DESC', [studioId, postId])).rows;
exports.getTikTokAssistsByPost = getTikTokAssistsByPost;
const markTikTokAssistPublished = async (id, publishUrl) => {
    await getPool().query("UPDATE tiktok_assists SET status='published', publish_url=$1, updated_at=NOW() WHERE id=$2", [publishUrl, id]);
};
exports.markTikTokAssistPublished = markTikTokAssistPublished;
// ─── Studio plans ────────────────────────────────────────────────────────────
const getLocalStudioPlan = async (studioId) => ((await getPool().query('SELECT plan FROM studio_plans WHERE studio_id=$1', [studioId])).rows[0]?.plan) ?? null;
exports.getLocalStudioPlan = getLocalStudioPlan;
const setLocalStudioPlan = async (studioId, plan, setBy) => {
    await getPool().query(`INSERT INTO studio_plans (studio_id, plan, set_by, set_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT(studio_id) DO UPDATE SET plan=EXCLUDED.plan, set_by=EXCLUDED.set_by, set_at=EXCLUDED.set_at`, [studioId, plan, setBy ?? null]);
};
exports.setLocalStudioPlan = setLocalStudioPlan;
const normalizeOptional = (v) => {
    if (v === undefined)
        return undefined;
    const t = v.trim();
    return t ? t : null;
};
const getStudioIntegrationSettings = async (studioId) => {
    const row = (await getPool().query('SELECT * FROM studio_integration_settings WHERE studio_id=$1', [studioId])).rows[0];
    if (!row)
        return null;
    const decryptSafe = (value) => {
        if (!value)
            return null;
        try {
            return (0, crypto_1.decryptToken)(value);
        }
        catch {
            return null;
        }
    };
    return {
        studio_id: row.studio_id,
        linkedin_client_id: row.linkedin_client_id,
        linkedin_client_secret: decryptSafe(row.linkedin_client_secret_enc),
        linkedin_redirect_uri: row.linkedin_redirect_uri,
        linkedin_scopes: row.linkedin_scopes,
        meta_app_id: row.meta_app_id,
        meta_app_secret: decryptSafe(row.meta_app_secret_enc),
        meta_redirect_uri: row.meta_redirect_uri,
        meta_scopes: row.meta_scopes,
        updated_by: row.updated_by,
        updated_at: row.updated_at,
    };
};
exports.getStudioIntegrationSettings = getStudioIntegrationSettings;
const getStudioIntegrationSettingsSummary = async (studioId) => {
    const row = (await getPool().query('SELECT * FROM studio_integration_settings WHERE studio_id=$1', [studioId])).rows[0];
    if (!row) {
        return {
            studio_id: studioId,
            linkedin_client_id: null,
            linkedin_redirect_uri: null,
            linkedin_scopes: null,
            meta_app_id: null,
            meta_redirect_uri: null,
            meta_scopes: null,
            updated_by: null,
            updated_at: new Date(0).toISOString(),
            has_linkedin_client_secret: false,
            has_meta_app_secret: false,
        };
    }
    return {
        studio_id: row.studio_id,
        linkedin_client_id: row.linkedin_client_id,
        linkedin_redirect_uri: row.linkedin_redirect_uri,
        linkedin_scopes: row.linkedin_scopes,
        meta_app_id: row.meta_app_id,
        meta_redirect_uri: row.meta_redirect_uri,
        meta_scopes: row.meta_scopes,
        updated_by: row.updated_by,
        updated_at: row.updated_at,
        has_linkedin_client_secret: Boolean(row.linkedin_client_secret_enc),
        has_meta_app_secret: Boolean(row.meta_app_secret_enc),
    };
};
exports.getStudioIntegrationSettingsSummary = getStudioIntegrationSettingsSummary;
const upsertStudioIntegrationSettings = async (studioId, updatedBy, input) => {
    const existing = (await getPool().query('SELECT * FROM studio_integration_settings WHERE studio_id=$1', [studioId])).rows[0];
    const nextLinkedInSecretEnc = input.linkedin_client_secret === undefined
        ? (existing?.linkedin_client_secret_enc ?? null)
        : (normalizeOptional(input.linkedin_client_secret) ? (0, crypto_1.encryptToken)(normalizeOptional(input.linkedin_client_secret)) : null);
    const nextMetaSecretEnc = input.meta_app_secret === undefined
        ? (existing?.meta_app_secret_enc ?? null)
        : (normalizeOptional(input.meta_app_secret) ? (0, crypto_1.encryptToken)(normalizeOptional(input.meta_app_secret)) : null);
    await getPool().query(`
    INSERT INTO studio_integration_settings (
      studio_id, linkedin_client_id, linkedin_client_secret_enc, linkedin_redirect_uri,
      linkedin_scopes, meta_app_id, meta_app_secret_enc, meta_redirect_uri, meta_scopes,
      updated_by, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    ON CONFLICT(studio_id) DO UPDATE SET
      linkedin_client_id=EXCLUDED.linkedin_client_id,
      linkedin_client_secret_enc=EXCLUDED.linkedin_client_secret_enc,
      linkedin_redirect_uri=EXCLUDED.linkedin_redirect_uri,
      linkedin_scopes=EXCLUDED.linkedin_scopes,
      meta_app_id=EXCLUDED.meta_app_id,
      meta_app_secret_enc=EXCLUDED.meta_app_secret_enc,
      meta_redirect_uri=EXCLUDED.meta_redirect_uri,
      meta_scopes=EXCLUDED.meta_scopes,
      updated_by=EXCLUDED.updated_by,
      updated_at=EXCLUDED.updated_at
  `, [
        studioId,
        normalizeOptional(input.linkedin_client_id) ?? existing?.linkedin_client_id ?? null,
        nextLinkedInSecretEnc,
        normalizeOptional(input.linkedin_redirect_uri) ?? existing?.linkedin_redirect_uri ?? null,
        normalizeOptional(input.linkedin_scopes) ?? existing?.linkedin_scopes ?? null,
        normalizeOptional(input.meta_app_id) ?? existing?.meta_app_id ?? null,
        nextMetaSecretEnc,
        normalizeOptional(input.meta_redirect_uri) ?? existing?.meta_redirect_uri ?? null,
        normalizeOptional(input.meta_scopes) ?? existing?.meta_scopes ?? null,
        updatedBy,
    ]);
};
exports.upsertStudioIntegrationSettings = upsertStudioIntegrationSettings;
const getUserByEmail = async (email) => (await getPool().query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0] ?? null;
exports.getUserByEmail = getUserByEmail;
const getUserById = async (id) => (await getPool().query('SELECT * FROM users WHERE id=$1', [id])).rows[0] ?? null;
exports.getUserById = getUserById;
const createUser = async (u) => {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await getPool().query('INSERT INTO users (id, email, name, google_sub, role, status) VALUES ($1, $2, $3, $4, $5, $6)', [id, u.email.toLowerCase(), u.name, u.google_sub ?? null, u.role, u.status]);
    return (await (0, exports.getUserById)(id));
};
exports.createUser = createUser;
const updateUser = async (id, fields) => {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (!entries.length)
        return;
    const setClauses = entries.map(([k], i) => `${k}=$${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    await getPool().query(`UPDATE users SET ${setClauses} WHERE id=$${values.length + 1}`, [...values, id]);
};
exports.updateUser = updateUser;
// ─── Audit ───────────────────────────────────────────────────────────────────
const audit = async (studioId, actorId, action, entityType, entityId, detail) => {
    const { v4: uuidv4 } = require('uuid');
    await getPool().query('INSERT INTO audit_events (id,studio_id,actor_id,action,entity_type,entity_id,detail) VALUES ($1,$2,$3,$4,$5,$6,$7)', [uuidv4(), studioId, actorId, action, entityType, entityId, JSON.stringify(detail ?? {})]);
};
exports.audit = audit;
//# sourceMappingURL=db.js.map