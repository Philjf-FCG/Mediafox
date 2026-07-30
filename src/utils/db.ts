import pg from 'pg';
import { Pool } from 'pg';
import { decryptToken, encryptToken } from './crypto';

// ─── Type parsers ─────────────────────────────────────────────────────────────
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v: string) => v ? new Date(v + 'Z').toISOString() : null);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v: string) => v ? new Date(v).toISOString() : null);

// ─── SQL identifier guard ─────────────────────────────────────────────────────
// Dynamic UPDATE helpers interpolate column names from object keys. Values are
// parameterised but names are not, so validate every interpolated name is a
// plain SQL identifier — defence against SQL injection if a caller ever forwards
// attacker-controlled keys.
const SAFE_COLUMN = /^[a-z_][a-z0-9_]*$/;
function col(name: string): string {
  if (!SAFE_COLUMN.test(name)) {
    throw new Error(`Unsafe column name in dynamic UPDATE: ${JSON.stringify(name)}`);
  }
  return name;
}

// ─── Pool ─────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://localhost/mediafox' });
  }
  return _pool;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

export async function initSchema(): Promise<void> {
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

// ─── Accounts ────────────────────────────────────────────────────────────────

export interface AccountRecord {
  id: string;
  studio_id: string;
  owner_user_id: string | null;
  type: 'company' | 'personal';
  platform: string;
  platform_id: string;
  display_name: string;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  extra: string;
  connected_at: string;
  last_synced_at: string | null;
  status: 'active' | 'expired' | 'error';
}

export const getAccountsByStudio = async (studioId: string): Promise<AccountRecord[]> =>
  (await getPool().query('SELECT * FROM accounts WHERE studio_id = $1 ORDER BY platform, display_name', [studioId])).rows as AccountRecord[];

export const getAccountById = async (id: string): Promise<AccountRecord | null> =>
  (await getPool().query('SELECT * FROM accounts WHERE id = $1', [id])).rows[0] ?? null;

export const upsertAccount = async (a: Omit<AccountRecord, 'connected_at' | 'last_synced_at' | 'status'> & Partial<Pick<AccountRecord, 'status'>>): Promise<AccountRecord> => {
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
  return (await getAccountById(a.id))!;
};

export const updateAccountStatus = async (id: string, status: 'active' | 'expired' | 'error'): Promise<void> => {
  await getPool().query('UPDATE accounts SET status=$1 WHERE id=$2', [status, id]);
};

export const updateAccountTokens = async (id: string, accessToken: string, refreshToken: string | null, expiresAt: string | null): Promise<void> => {
  await getPool().query("UPDATE accounts SET access_token=$1, refresh_token=$2, token_expires_at=$3, status='active' WHERE id=$4",
    [accessToken, refreshToken, expiresAt, id]);
};

export const deleteAccount = async (id: string): Promise<void> => {
  await getPool().query('DELETE FROM accounts WHERE id=$1', [id]);
};

// ─── Posts ───────────────────────────────────────────────────────────────────

export interface PostRecord {
  id: string;
  studio_id: string;
  author_user_id: string;
  title: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostVariantRecord {
  id: string;
  post_id: string;
  account_id: string;
  body: string;
  media_ids: string;
  platform_post_id: string | null;
  status: string;
  error_message: string | null;
  retry_count: number;
  published_at: string | null;
}

export const createPost = async (p: Pick<PostRecord, 'id' | 'studio_id' | 'author_user_id' | 'title'>): Promise<PostRecord> => {
  await getPool().query('INSERT INTO posts (id, studio_id, author_user_id, title) VALUES ($1, $2, $3, $4)',
    [p.id, p.studio_id, p.author_user_id, p.title]);
  return (await getPool().query('SELECT * FROM posts WHERE id=$1', [p.id])).rows[0] as PostRecord;
};

export const getPostById = async (id: string): Promise<PostRecord | null> =>
  (await getPool().query('SELECT * FROM posts WHERE id=$1', [id])).rows[0] ?? null;

export const getPostsByStudio = async (studioId: string, status?: string, includeArchived = false): Promise<PostRecord[]> => {
  if (status) {
    if (includeArchived)
      return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 AND status=$2 ORDER BY created_at DESC', [studioId, status])).rows as PostRecord[];
    return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 AND status=$2 AND archived_at IS NULL ORDER BY created_at DESC', [studioId, status])).rows as PostRecord[];
  }
  if (includeArchived)
    return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 ORDER BY created_at DESC', [studioId])).rows as PostRecord[];
  return (await getPool().query('SELECT * FROM posts WHERE studio_id=$1 AND archived_at IS NULL ORDER BY created_at DESC', [studioId])).rows as PostRecord[];
};

export const getPostsInRange = async (studioId: string, from: string, to: string, includeArchived = false): Promise<PostRecord[]> => {
  const archivedClause = includeArchived ? '' : 'AND archived_at IS NULL';
  return (await getPool().query(
    `SELECT * FROM posts WHERE studio_id=$1 ${archivedClause} AND (
      (scheduled_at >= $2 AND scheduled_at <= $3) OR (published_at >= $2 AND published_at <= $3)
    ) ORDER BY COALESCE(scheduled_at, published_at)`,
    [studioId, from, to],
  )).rows as PostRecord[];
};

export const updatePost = async (id: string, fields: Partial<PostRecord>): Promise<void> => {
  const entries = Object.entries(fields).filter(([k]) => !['id', 'studio_id', 'author_user_id', 'created_at'].includes(k));
  if (!entries.length) return;
  const setClauses = entries.map(([k], i) => `${col(k)}=$${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  await getPool().query(`UPDATE posts SET ${setClauses}, updated_at=NOW() WHERE id=$${values.length + 1}`, [...values, id]);
};

export const archivePost = async (id: string, actorId: string): Promise<void> => {
  await getPool().query('UPDATE posts SET archived_at=NOW(), archived_by=$1, updated_at=NOW() WHERE id=$2', [actorId, id]);
};

export const restorePost = async (id: string): Promise<void> => {
  await getPool().query('UPDATE posts SET archived_at=NULL, archived_by=NULL, updated_at=NOW() WHERE id=$1', [id]);
};

export const createPostVariant = async (v: Omit<PostVariantRecord, 'status' | 'error_message' | 'retry_count' | 'published_at' | 'platform_post_id'>): Promise<PostVariantRecord> => {
  await getPool().query('INSERT INTO post_variants (id, post_id, account_id, body, media_ids) VALUES ($1, $2, $3, $4, $5)',
    [v.id, v.post_id, v.account_id, v.body, v.media_ids]);
  return (await getPool().query('SELECT * FROM post_variants WHERE id=$1', [v.id])).rows[0] as PostVariantRecord;
};

export const getVariantsByPost = async (postId: string): Promise<PostVariantRecord[]> =>
  (await getPool().query('SELECT * FROM post_variants WHERE post_id=$1', [postId])).rows as PostVariantRecord[];

export const updateVariant = async (id: string, fields: Partial<PostVariantRecord>): Promise<void> => {
  const entries = Object.entries(fields).filter(([k]) => k !== 'id');
  if (!entries.length) return;
  const setClauses = entries.map(([k], i) => `${col(k)}=$${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  await getPool().query(`UPDATE post_variants SET ${setClauses} WHERE id=$${values.length + 1}`, [...values, id]);
};

// ─── Queue ───────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  post_variant_id: string;
  fire_at: string;
  attempts: number;
  last_attempt_at: string | null;
  status: string;
  created_at: string;
}

export const enqueueVariant = async (id: string, variantId: string, fireAt: string): Promise<void> => {
  await getPool().query(
    'INSERT INTO post_queue (id, post_variant_id, fire_at) VALUES ($1, $2, $3) ON CONFLICT(id) DO UPDATE SET fire_at=EXCLUDED.fire_at',
    [id, variantId, fireAt],
  );
};

export const getDueQueueItems = async (): Promise<QueueItem[]> =>
  (await getPool().query("SELECT * FROM post_queue WHERE status='pending' AND fire_at <= NOW() ORDER BY fire_at LIMIT 50")).rows as QueueItem[];

export const lockQueueItem = async (id: string): Promise<boolean> => {
  const r = await getPool().query(
    "UPDATE post_queue SET status='processing', last_attempt_at=NOW(), attempts=attempts+1 WHERE id=$1 AND status='pending'",
    [id],
  );
  return (r.rowCount ?? 0) > 0;
};

export const resolveQueueItem = async (id: string, success: boolean, nextFireAt?: string): Promise<void> => {
  if (success) {
    await getPool().query("UPDATE post_queue SET status='done' WHERE id=$1", [id]);
  } else if (nextFireAt) {
    await getPool().query("UPDATE post_queue SET status='pending', fire_at=$1 WHERE id=$2", [nextFireAt, id]);
  } else {
    await getPool().query("UPDATE post_queue SET status='dead' WHERE id=$1", [id]);
  }
};

// ─── Inbox ───────────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string; studio_id: string; account_id: string; platform: string;
  platform_item_id: string; type: string; author_name: string | null;
  author_platform_id: string | null; body: string | null; parent_post_id: string | null;
  status: string; assigned_to: string | null; internal_note: string | null;
  archived_at: string | null; archived_by: string | null;
  received_at: string; created_at: string;
}

export const upsertInboxItem = async (item: Omit<InboxItem, 'status' | 'assigned_to' | 'internal_note' | 'created_at'>): Promise<void> => {
  await getPool().query(`
    INSERT INTO inbox_items (id, studio_id, account_id, platform, platform_item_id, type,
      author_name, author_platform_id, body, parent_post_id, received_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(account_id, platform_item_id) DO NOTHING
  `, [item.id, item.studio_id, item.account_id, item.platform, item.platform_item_id, item.type,
      item.author_name, item.author_platform_id, item.body, item.parent_post_id, item.received_at]);
};

export const getInboxItems = async (studioId: string, filters: { platform?: string; status?: string; accountId?: string; includeArchived?: boolean } = {}): Promise<InboxItem[]> => {
  const params: unknown[] = [studioId];
  let q = 'SELECT * FROM inbox_items WHERE studio_id=$1';
  if (!filters.includeArchived) q += ' AND archived_at IS NULL';
  if (filters.platform) { params.push(filters.platform); q += ` AND platform=$${params.length}`; }
  if (filters.status) { params.push(filters.status); q += ` AND status=$${params.length}`; }
  if (filters.accountId) { params.push(filters.accountId); q += ` AND account_id=$${params.length}`; }
  q += ' ORDER BY received_at DESC LIMIT 200';
  return (await getPool().query(q, params)).rows as InboxItem[];
};

export const updateInboxItem = async (id: string, fields: { status?: string; assigned_to?: string; internal_note?: string }): Promise<void> => {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const setClauses = entries.map(([k], i) => `${col(k)}=$${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  await getPool().query(`UPDATE inbox_items SET ${setClauses} WHERE id=$${values.length + 1}`, [...values, id]);
};

export const archiveInboxItem = async (id: string, actorId: string): Promise<void> => {
  await getPool().query('UPDATE inbox_items SET archived_at=NOW(), archived_by=$1 WHERE id=$2', [actorId, id]);
};

export const restoreInboxItem = async (id: string): Promise<void> => {
  await getPool().query('UPDATE inbox_items SET archived_at=NULL, archived_by=NULL WHERE id=$1', [id]);
};

// ─── Media ───────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string; studio_id: string; uploaded_by: string; filename: string;
  mime_type: string; file_size: number; storage_path: string;
  width: number | null; height: number | null; duration_s: number | null;
  tags: string;
  source_provider: string | null;
  source_id: string | null;
  source_hash: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
}

export const createMediaAsset = async (a: Pick<MediaAsset, 'id' | 'studio_id' | 'uploaded_by' | 'filename' | 'mime_type' | 'file_size' | 'storage_path' | 'width' | 'height' | 'duration_s' | 'tags'> & Partial<Pick<MediaAsset, 'source_provider' | 'source_id' | 'source_hash'>>): Promise<MediaAsset> => {
  await getPool().query(
    `INSERT INTO media_assets (id,studio_id,uploaded_by,filename,mime_type,file_size,storage_path,width,height,duration_s,tags,source_provider,source_id,source_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [a.id, a.studio_id, a.uploaded_by, a.filename, a.mime_type, a.file_size, a.storage_path,
     a.width, a.height, a.duration_s, a.tags,
     a.source_provider ?? null, a.source_id ?? null, a.source_hash ?? null],
  );
  return (await getPool().query('SELECT * FROM media_assets WHERE id=$1', [a.id])).rows[0] as MediaAsset;
};

export const getMediaAssets = async (studioId: string, q?: string, includeArchived = false): Promise<MediaAsset[]> => {
  if (q) {
    const like = `%${q}%`;
    if (includeArchived)
      return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND (filename LIKE $2 OR tags LIKE $2) ORDER BY created_at DESC', [studioId, like])).rows as MediaAsset[];
    return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND archived_at IS NULL AND (filename LIKE $2 OR tags LIKE $2) ORDER BY created_at DESC', [studioId, like])).rows as MediaAsset[];
  }
  if (includeArchived)
    return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 ORDER BY created_at DESC', [studioId])).rows as MediaAsset[];
  return (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND archived_at IS NULL ORDER BY created_at DESC', [studioId])).rows as MediaAsset[];
};

export const deleteMediaAsset = async (id: string): Promise<void> => {
  await getPool().query('DELETE FROM media_assets WHERE id=$1', [id]);
};

export const archiveMediaAsset = async (id: string, actorId: string): Promise<void> => {
  await getPool().query('UPDATE media_assets SET archived_at=NOW(), archived_by=$1 WHERE id=$2', [actorId, id]);
};

export const restoreMediaAsset = async (id: string): Promise<void> => {
  await getPool().query('UPDATE media_assets SET archived_at=NULL, archived_by=NULL WHERE id=$1', [id]);
};

export const getMediaAssetBySource = async (studioId: string, provider: string, sourceId: string): Promise<MediaAsset | null> =>
  (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND source_provider=$2 AND source_id=$3 LIMIT 1', [studioId, provider, sourceId])).rows[0] ?? null;

export const getMediaAssetByHash = async (studioId: string, sourceHash: string): Promise<MediaAsset | null> =>
  (await getPool().query('SELECT * FROM media_assets WHERE studio_id=$1 AND source_hash=$2 LIMIT 1', [studioId, sourceHash])).rows[0] ?? null;

export interface ArchivePurgeResult {
  postsDeleted: number;
  inboxDeleted: number;
  mediaDeleted: number;
  mediaStoragePaths: string[];
}

export const purgeArchivedContentOlderThan = async (cutoffIso: string): Promise<ArchivePurgeResult> => {
  const pool = getPool();

  const mediaRows = (await pool.query(
    'SELECT id, storage_path FROM media_assets WHERE archived_at IS NOT NULL AND archived_at <= $1',
    [cutoffIso],
  )).rows as Array<{ id: string; storage_path: string }>;

  let mediaDeleted = 0;
  if (mediaRows.length > 0) {
    const ids = mediaRows.map(r => r.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const mediaDelete = await pool.query(`DELETE FROM media_assets WHERE id IN (${placeholders})`, ids);
    mediaDeleted = mediaDelete.rowCount ?? 0;
  }

  const postDelete = await pool.query(
    'DELETE FROM posts WHERE archived_at IS NOT NULL AND archived_at <= $1',
    [cutoffIso],
  );

  const inboxDelete = await pool.query(
    'DELETE FROM inbox_items WHERE archived_at IS NOT NULL AND archived_at <= $1',
    [cutoffIso],
  );

  return {
    postsDeleted: postDelete.rowCount ?? 0,
    inboxDeleted: inboxDelete.rowCount ?? 0,
    mediaDeleted,
    mediaStoragePaths: mediaRows.map(r => r.storage_path),
  };
};

// ─── Team ────────────────────────────────────────────────────────────────────

export interface StudioMember {
  studio_id: string; user_id: string; email: string; name: string;
  role: 'owner' | 'manager' | 'editor' | 'viewer'; joined_at: string;
}

export const getMember = async (studioId: string, userId: string): Promise<StudioMember | null> =>
  (await getPool().query('SELECT * FROM studio_members WHERE studio_id=$1 AND user_id=$2', [studioId, userId])).rows[0] ?? null;

export const getMembersByStudio = async (studioId: string): Promise<StudioMember[]> =>
  (await getPool().query('SELECT * FROM studio_members WHERE studio_id=$1 ORDER BY role, name', [studioId])).rows as StudioMember[];

export const upsertMember = async (m: StudioMember): Promise<void> => {
  await getPool().query(`INSERT INTO studio_members (studio_id,user_id,email,name,role)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT(studio_id,user_id) DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, role=EXCLUDED.role`,
    [m.studio_id, m.user_id, m.email, m.name, m.role]);
};

export const removeMember = async (studioId: string, userId: string): Promise<void> => {
  await getPool().query('DELETE FROM studio_members WHERE studio_id=$1 AND user_id=$2', [studioId, userId]);
};

export const ensureOwner = async (studioId: string, userId: string, email: string, name: string): Promise<void> => {
  const existing = await getMember(studioId, userId);
  if (!existing) {
    await upsertMember({ studio_id: studioId, user_id: userId, email, name, role: 'owner', joined_at: new Date().toISOString() });
  }
};

// ─── Approvals ───────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string; post_id: string; requested_by: string; reviewer_id: string | null;
  status: string; reviewer_note: string | null; created_at: string; resolved_at: string | null;
}

export const createApprovalRequest = async (id: string, postId: string, requestedBy: string): Promise<ApprovalRequest> => {
  await getPool().query('INSERT INTO approval_requests (id,post_id,requested_by) VALUES ($1,$2,$3)', [id, postId, requestedBy]);
  return (await getPool().query('SELECT * FROM approval_requests WHERE id=$1', [id])).rows[0] as ApprovalRequest;
};

export const resolveApproval = async (id: string, status: 'approved' | 'rejected' | 'withdrawn', reviewerId?: string, note?: string): Promise<void> => {
  await getPool().query('UPDATE approval_requests SET status=$1,reviewer_id=$2,reviewer_note=$3,resolved_at=NOW() WHERE id=$4',
    [status, reviewerId ?? null, note ?? null, id]);
};

export const getPendingApproval = async (postId: string): Promise<ApprovalRequest | null> =>
  (await getPool().query("SELECT * FROM approval_requests WHERE post_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [postId])).rows[0] ?? null;

// ─── Notifications ───────────────────────────────────────────────────────────

export const createNotification = async (id: string, recipientId: string, studioId: string, type: string, title: string, body?: string, link?: string): Promise<void> => {
  await getPool().query('INSERT INTO notifications (id,recipient_id,studio_id,type,title,body,link) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, recipientId, studioId, type, title, body ?? null, link ?? null]);
};

export const getNotifications = async (recipientId: string, unreadOnly = false): Promise<unknown[]> => {
  if (unreadOnly)
    return (await getPool().query("SELECT * FROM notifications WHERE recipient_id=$1 AND read=0 ORDER BY created_at DESC LIMIT 50", [recipientId])).rows;
  return (await getPool().query('SELECT * FROM notifications WHERE recipient_id=$1 ORDER BY created_at DESC LIMIT 50', [recipientId])).rows;
};

export const markNotificationsRead = async (recipientId: string): Promise<void> => {
  await getPool().query('UPDATE notifications SET read=1 WHERE recipient_id=$1', [recipientId]);
};

// ─── Reddit Assisted Publish ────────────────────────────────────────────────

export interface RedditAssistRecord {
  id: string;
  post_id: string;
  studio_id: string;
  requested_by: string;
  subreddit: string;
  title: string;
  body: string | null;
  status: 'draft' | 'handed_off' | 'published' | 'cancelled';
  handoff_note: string | null;
  publish_url: string | null;
  created_at: string;
  updated_at: string;
}

export const createRedditAssist = async (r: Pick<RedditAssistRecord, 'id' | 'post_id' | 'studio_id' | 'requested_by' | 'subreddit' | 'title' | 'body' | 'handoff_note'>): Promise<RedditAssistRecord> => {
  await getPool().query(`
    INSERT INTO reddit_assists (id, post_id, studio_id, requested_by, subreddit, title, body, status, handoff_note)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'handed_off', $8)
  `, [r.id, r.post_id, r.studio_id, r.requested_by, r.subreddit, r.title, r.body, r.handoff_note]);
  return (await getPool().query('SELECT * FROM reddit_assists WHERE id=$1', [r.id])).rows[0] as RedditAssistRecord;
};

export const getRedditAssistsByPost = async (studioId: string, postId: string): Promise<RedditAssistRecord[]> =>
  (await getPool().query('SELECT * FROM reddit_assists WHERE studio_id=$1 AND post_id=$2 ORDER BY created_at DESC', [studioId, postId])).rows as RedditAssistRecord[];

export const markRedditAssistPublished = async (id: string, publishUrl: string): Promise<void> => {
  await getPool().query("UPDATE reddit_assists SET status='published', publish_url=$1, updated_at=NOW() WHERE id=$2", [publishUrl, id]);
};

export interface TikTokAssistRecord {
  id: string;
  post_id: string;
  studio_id: string;
  requested_by: string;
  caption: string;
  media_asset_id: string | null;
  status: 'draft' | 'handed_off' | 'published' | 'cancelled';
  handoff_note: string | null;
  publish_url: string | null;
  created_at: string;
  updated_at: string;
}

export const createTikTokAssist = async (r: Pick<TikTokAssistRecord, 'id' | 'post_id' | 'studio_id' | 'requested_by' | 'caption' | 'media_asset_id' | 'handoff_note'>): Promise<TikTokAssistRecord> => {
  await getPool().query(`
    INSERT INTO tiktok_assists (id, post_id, studio_id, requested_by, caption, media_asset_id, status, handoff_note)
    VALUES ($1, $2, $3, $4, $5, $6, 'handed_off', $7)
  `, [r.id, r.post_id, r.studio_id, r.requested_by, r.caption, r.media_asset_id, r.handoff_note]);
  return (await getPool().query('SELECT * FROM tiktok_assists WHERE id=$1', [r.id])).rows[0] as TikTokAssistRecord;
};

export const getTikTokAssistsByPost = async (studioId: string, postId: string): Promise<TikTokAssistRecord[]> =>
  (await getPool().query('SELECT * FROM tiktok_assists WHERE studio_id=$1 AND post_id=$2 ORDER BY created_at DESC', [studioId, postId])).rows as TikTokAssistRecord[];

export const markTikTokAssistPublished = async (id: string, publishUrl: string): Promise<void> => {
  await getPool().query("UPDATE tiktok_assists SET status='published', publish_url=$1, updated_at=NOW() WHERE id=$2", [publishUrl, id]);
};

// ─── Studio plans ────────────────────────────────────────────────────────────

export const getLocalStudioPlan = async (studioId: string): Promise<string | null> =>
  ((await getPool().query('SELECT plan FROM studio_plans WHERE studio_id=$1', [studioId])).rows[0]?.plan) ?? null;

export const setLocalStudioPlan = async (studioId: string, plan: string, setBy?: string): Promise<void> => {
  await getPool().query(`INSERT INTO studio_plans (studio_id, plan, set_by, set_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT(studio_id) DO UPDATE SET plan=EXCLUDED.plan, set_by=EXCLUDED.set_by, set_at=EXCLUDED.set_at`,
    [studioId, plan, setBy ?? null]);
};

export interface StudioIntegrationSettings {
  studio_id: string;
  linkedin_client_id: string | null;
  linkedin_client_secret: string | null;
  linkedin_redirect_uri: string | null;
  linkedin_scopes: string | null;
  meta_app_id: string | null;
  meta_app_secret: string | null;
  meta_redirect_uri: string | null;
  meta_scopes: string | null;
  updated_by: string | null;
  updated_at: string;
}

interface StudioIntegrationSettingsRow {
  studio_id: string;
  linkedin_client_id: string | null;
  linkedin_client_secret_enc: string | null;
  linkedin_redirect_uri: string | null;
  linkedin_scopes: string | null;
  meta_app_id: string | null;
  meta_app_secret_enc: string | null;
  meta_redirect_uri: string | null;
  meta_scopes: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface StudioIntegrationSettingsInput {
  linkedin_client_id?: string;
  linkedin_client_secret?: string;
  linkedin_redirect_uri?: string;
  linkedin_scopes?: string;
  meta_app_id?: string;
  meta_app_secret?: string;
  meta_redirect_uri?: string;
  meta_scopes?: string;
}

const normalizeOptional = (v: string | undefined): string | null | undefined => {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t ? t : null;
};

export const getStudioIntegrationSettings = async (studioId: string): Promise<StudioIntegrationSettings | null> => {
  const row = (await getPool().query('SELECT * FROM studio_integration_settings WHERE studio_id=$1', [studioId])).rows[0] as StudioIntegrationSettingsRow | undefined;
  if (!row) return null;

  const decryptSafe = (value: string | null): string | null => {
    if (!value) return null;
    try { return decryptToken(value); } catch { return null; }
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

export const getStudioIntegrationSettingsSummary = async (studioId: string): Promise<Omit<StudioIntegrationSettings, 'linkedin_client_secret' | 'meta_app_secret'> & { has_linkedin_client_secret: boolean; has_meta_app_secret: boolean }> => {
  const row = (await getPool().query('SELECT * FROM studio_integration_settings WHERE studio_id=$1', [studioId])).rows[0] as StudioIntegrationSettingsRow | undefined;
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

export const upsertStudioIntegrationSettings = async (studioId: string, updatedBy: string, input: StudioIntegrationSettingsInput): Promise<void> => {
  const existing = (await getPool().query('SELECT * FROM studio_integration_settings WHERE studio_id=$1', [studioId])).rows[0] as StudioIntegrationSettingsRow | undefined;

  const nextLinkedInSecretEnc = input.linkedin_client_secret === undefined
    ? (existing?.linkedin_client_secret_enc ?? null)
    : (normalizeOptional(input.linkedin_client_secret) ? encryptToken(normalizeOptional(input.linkedin_client_secret)!) : null);

  const nextMetaSecretEnc = input.meta_app_secret === undefined
    ? (existing?.meta_app_secret_enc ?? null)
    : (normalizeOptional(input.meta_app_secret) ? encryptToken(normalizeOptional(input.meta_app_secret)!) : null);

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

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  google_sub: string | null;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'denied';
  last_login_at: string | null;
  created_at: string;
}

export const getUserByEmail = async (email: string): Promise<UserRecord | null> =>
  (await getPool().query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0] ?? null;

export const getUserById = async (id: string): Promise<UserRecord | null> =>
  (await getPool().query('SELECT * FROM users WHERE id=$1', [id])).rows[0] ?? null;

export const createUser = async (u: Pick<UserRecord, 'email' | 'name' | 'role' | 'status'> & Partial<Pick<UserRecord, 'google_sub'>>): Promise<UserRecord> => {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  await getPool().query('INSERT INTO users (id, email, name, google_sub, role, status) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, u.email.toLowerCase(), u.name, u.google_sub ?? null, u.role, u.status]);
  return (await getUserById(id))!;
};

export const updateUser = async (id: string, fields: Partial<Pick<UserRecord, 'name' | 'google_sub' | 'role' | 'status' | 'last_login_at'>>): Promise<void> => {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const setClauses = entries.map(([k], i) => `${col(k)}=$${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  await getPool().query(`UPDATE users SET ${setClauses} WHERE id=$${values.length + 1}`, [...values, id]);
};

// ─── Audit ───────────────────────────────────────────────────────────────────

export const audit = async (studioId: string, actorId: string, action: string, entityType: string, entityId: string, detail?: unknown): Promise<void> => {
  const { v4: uuidv4 } = require('uuid');
  await getPool().query('INSERT INTO audit_events (id,studio_id,actor_id,action,entity_type,entity_id,detail) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [uuidv4(), studioId, actorId, action, entityType, entityId, JSON.stringify(detail ?? {})]);
};
