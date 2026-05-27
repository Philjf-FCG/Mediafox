import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: Database.Database | null = null;

export const getLocalDbPath = (): string => {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  return path.join(process.cwd(), 'mediafox.db');
};

export const getDb = (): Database.Database => {
  if (_db) return _db;
  const dbPath = getLocalDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
};

const hasColumn = (db: Database.Database, table: string, column: string): boolean => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some(c => c.name === column);
};

const ensureColumn = (db: Database.Database, table: string, column: string, sqlType: string): void => {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
  }
};

const migrate = (db: Database.Database): void => {
  db.exec(`
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
      token_expires_at TEXT,
      scope            TEXT,
      extra            TEXT DEFAULT '{}',
      connected_at     TEXT NOT NULL DEFAULT (datetime('now')),
      last_synced_at   TEXT,
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
      scheduled_at     TEXT,
      published_at     TEXT,
      archived_at      TEXT,
      archived_by      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
      published_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS post_queue (
      id               TEXT PRIMARY KEY,
      post_variant_id  TEXT NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
      fire_at          TEXT NOT NULL,
      attempts         INTEGER NOT NULL DEFAULT 0,
      last_attempt_at  TEXT,
      status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','processing','done','dead')),
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
      archived_at      TEXT,
      archived_by      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
      archived_at          TEXT,
      archived_by          TEXT,
      received_at          TEXT NOT NULL,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
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
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at      TEXT
    );

    CREATE TABLE IF NOT EXISTS studio_members (
      studio_id        TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      email            TEXT NOT NULL,
      name             TEXT NOT NULL,
      role             TEXT NOT NULL CHECK(role IN ('owner','manager','editor','viewer')),
      joined_at        TEXT NOT NULL DEFAULT (datetime('now')),
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
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id               TEXT PRIMARY KEY,
      studio_id        TEXT NOT NULL,
      actor_id         TEXT NOT NULL,
      action           TEXT NOT NULL,
      entity_type      TEXT NOT NULL,
      entity_id        TEXT NOT NULL,
      detail           TEXT DEFAULT '{}',
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_rate_limits (
      account_id       TEXT NOT NULL,
      platform         TEXT NOT NULL,
      used             INTEGER NOT NULL DEFAULT 0,
      window_start     TEXT NOT NULL,
      PRIMARY KEY (account_id, platform)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_studio    ON posts(studio_id, status);
    CREATE INDEX IF NOT EXISTS idx_posts_archived  ON posts(studio_id, archived_at);
    CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at) WHERE status='scheduled';
    CREATE INDEX IF NOT EXISTS idx_variants_post   ON post_variants(post_id);
    CREATE INDEX IF NOT EXISTS idx_queue_fire      ON post_queue(fire_at) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS post_analytics (
      id               TEXT PRIMARY KEY,
      post_variant_id  TEXT NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
      platform         TEXT NOT NULL,
      synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
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
      recorded_at      TEXT NOT NULL,
      followers        INTEGER DEFAULT 0,
      following        INTEGER DEFAULT 0,
      posts_count      INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_inbox_studio    ON inbox_items(studio_id, status);
    CREATE INDEX IF NOT EXISTS idx_inbox_archived  ON inbox_items(studio_id, archived_at);
    CREATE INDEX IF NOT EXISTS idx_accounts_studio ON accounts(studio_id);
    CREATE INDEX IF NOT EXISTS idx_media_archived  ON media_assets(studio_id, archived_at);
    CREATE INDEX IF NOT EXISTS idx_media_source    ON media_assets(studio_id, source_provider, source_id);
    CREATE INDEX IF NOT EXISTS idx_media_hash      ON media_assets(studio_id, source_hash);
    CREATE TABLE IF NOT EXISTS studio_plans (
      studio_id     TEXT PRIMARY KEY,
      plan          TEXT NOT NULL DEFAULT 'pro',
      set_by        TEXT,
      set_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      google_sub    TEXT,
      role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
      last_login_at TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notifications   ON notifications(recipient_id, read);
    CREATE INDEX IF NOT EXISTS idx_audit           ON audit_events(studio_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_post_analytics  ON post_analytics(post_variant_id);
    CREATE INDEX IF NOT EXISTS idx_acct_analytics  ON account_analytics(account_id, recorded_at);
  `);

  // Backward-compatible migration for existing databases created before archive columns existed.
  ensureColumn(db, 'posts', 'archived_at', 'TEXT');
  ensureColumn(db, 'posts', 'archived_by', 'TEXT');
  ensureColumn(db, 'media_assets', 'archived_at', 'TEXT');
  ensureColumn(db, 'media_assets', 'archived_by', 'TEXT');
  ensureColumn(db, 'media_assets', 'source_provider', 'TEXT');
  ensureColumn(db, 'media_assets', 'source_id', 'TEXT');
  ensureColumn(db, 'media_assets', 'source_hash', 'TEXT');
  ensureColumn(db, 'inbox_items', 'archived_at', 'TEXT');
  ensureColumn(db, 'inbox_items', 'archived_by', 'TEXT');
};

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

export const getAccountsByStudio = (studioId: string): AccountRecord[] =>
  getDb().prepare('SELECT * FROM accounts WHERE studio_id = ? ORDER BY platform, display_name').all(studioId) as AccountRecord[];

export const getAccountById = (id: string): AccountRecord | null =>
  (getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRecord | undefined) ?? null;

export const upsertAccount = (a: Omit<AccountRecord, 'connected_at' | 'last_synced_at' | 'status'> & Partial<Pick<AccountRecord, 'status'>>): AccountRecord => {
  getDb().prepare(`
    INSERT INTO accounts (id, studio_id, owner_user_id, type, platform, platform_id, display_name,
      avatar_url, access_token, refresh_token, token_expires_at, scope, extra, status)
    VALUES (@id, @studio_id, @owner_user_id, @type, @platform, @platform_id, @display_name,
      @avatar_url, @access_token, @refresh_token, @token_expires_at, @scope, @extra, @status)
    ON CONFLICT(studio_id, platform, platform_id) DO UPDATE SET
      display_name=excluded.display_name, avatar_url=excluded.avatar_url,
      access_token=excluded.access_token, refresh_token=excluded.refresh_token,
      token_expires_at=excluded.token_expires_at, scope=excluded.scope,
      extra=excluded.extra, status='active'
  `).run({ ...a, status: a.status ?? 'active' });
  return getAccountById(a.id)!;
};

export const updateAccountStatus = (id: string, status: 'active' | 'expired' | 'error'): void => {
  getDb().prepare('UPDATE accounts SET status=? WHERE id=?').run(status, id);
};

export const updateAccountTokens = (id: string, accessToken: string, refreshToken: string | null, expiresAt: string | null): void => {
  getDb().prepare('UPDATE accounts SET access_token=?, refresh_token=?, token_expires_at=?, status=\'active\' WHERE id=?')
    .run(accessToken, refreshToken, expiresAt, id);
};

export const deleteAccount = (id: string): void => {
  getDb().prepare('DELETE FROM accounts WHERE id=?').run(id);
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

export const createPost = (p: Pick<PostRecord, 'id' | 'studio_id' | 'author_user_id' | 'title'>): PostRecord => {
  getDb().prepare('INSERT INTO posts (id, studio_id, author_user_id, title) VALUES (@id, @studio_id, @author_user_id, @title)').run(p);
  return getDb().prepare('SELECT * FROM posts WHERE id=?').get(p.id) as PostRecord;
};

export const getPostById = (id: string): PostRecord | null =>
  (getDb().prepare('SELECT * FROM posts WHERE id=?').get(id) as PostRecord | undefined) ?? null;

export const getPostsByStudio = (studioId: string, status?: string, includeArchived = false): PostRecord[] => {
  if (status) {
    if (includeArchived) return getDb().prepare('SELECT * FROM posts WHERE studio_id=? AND status=? ORDER BY created_at DESC').all(studioId, status) as PostRecord[];
    return getDb().prepare('SELECT * FROM posts WHERE studio_id=? AND status=? AND archived_at IS NULL ORDER BY created_at DESC').all(studioId, status) as PostRecord[];
  }
  if (includeArchived) return getDb().prepare('SELECT * FROM posts WHERE studio_id=? ORDER BY created_at DESC').all(studioId) as PostRecord[];
  return getDb().prepare('SELECT * FROM posts WHERE studio_id=? AND archived_at IS NULL ORDER BY created_at DESC').all(studioId) as PostRecord[];
};

export const getPostsInRange = (studioId: string, from: string, to: string, includeArchived = false): PostRecord[] =>
  getDb().prepare(`SELECT * FROM posts WHERE studio_id=? ${includeArchived ? '' : 'AND archived_at IS NULL'} AND (
    (scheduled_at >= ? AND scheduled_at <= ?) OR (published_at >= ? AND published_at <= ?)
  ) ORDER BY COALESCE(scheduled_at, published_at)`).all(studioId, from, to, from, to) as PostRecord[];

export const updatePost = (id: string, fields: Partial<PostRecord>): void => {
  const updates = Object.entries(fields)
    .filter(([k]) => !['id','studio_id','author_user_id','created_at'].includes(k))
    .map(([k]) => `${k}=@${k}`).join(', ');
  if (!updates) return;
  getDb().prepare(`UPDATE posts SET ${updates}, updated_at=datetime('now') WHERE id=@id`).run({ ...fields, id });
};

export const archivePost = (id: string, actorId: string): void => {
  getDb().prepare("UPDATE posts SET archived_at=datetime('now'), archived_by=?, updated_at=datetime('now') WHERE id=?").run(actorId, id);
};

export const restorePost = (id: string): void => {
  getDb().prepare("UPDATE posts SET archived_at=NULL, archived_by=NULL, updated_at=datetime('now') WHERE id=?").run(id);
};

export const createPostVariant = (v: Omit<PostVariantRecord, 'status' | 'error_message' | 'retry_count' | 'published_at' | 'platform_post_id'>): PostVariantRecord => {
  getDb().prepare(`INSERT INTO post_variants (id, post_id, account_id, body, media_ids)
    VALUES (@id, @post_id, @account_id, @body, @media_ids)`).run(v);
  return getDb().prepare('SELECT * FROM post_variants WHERE id=?').get(v.id) as PostVariantRecord;
};

export const getVariantsByPost = (postId: string): PostVariantRecord[] =>
  getDb().prepare('SELECT * FROM post_variants WHERE post_id=?').all(postId) as PostVariantRecord[];

export const updateVariant = (id: string, fields: Partial<PostVariantRecord>): void => {
  const cols = Object.entries(fields).filter(([k]) => k !== 'id').map(([k]) => `${k}=@${k}`).join(', ');
  if (!cols) return;
  getDb().prepare(`UPDATE post_variants SET ${cols} WHERE id=@id`).run({ ...fields, id });
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

export const enqueueVariant = (id: string, variantId: string, fireAt: string): void => {
  getDb().prepare('INSERT OR REPLACE INTO post_queue (id, post_variant_id, fire_at) VALUES (?,?,?)').run(id, variantId, fireAt);
};

export const getDueQueueItems = (): QueueItem[] =>
  getDb().prepare("SELECT * FROM post_queue WHERE status='pending' AND fire_at <= datetime('now') ORDER BY fire_at LIMIT 50").all() as QueueItem[];

export const lockQueueItem = (id: string): boolean => {
  const r = getDb().prepare("UPDATE post_queue SET status='processing', last_attempt_at=datetime('now'), attempts=attempts+1 WHERE id=? AND status='pending'").run(id);
  return r.changes > 0;
};

export const resolveQueueItem = (id: string, success: boolean, nextFireAt?: string): void => {
  if (success) {
    getDb().prepare("UPDATE post_queue SET status='done' WHERE id=?").run(id);
  } else if (nextFireAt) {
    getDb().prepare("UPDATE post_queue SET status='pending', fire_at=? WHERE id=?").run(nextFireAt, id);
  } else {
    getDb().prepare("UPDATE post_queue SET status='dead' WHERE id=?").run(id);
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

export const upsertInboxItem = (item: Omit<InboxItem, 'status' | 'assigned_to' | 'internal_note' | 'created_at'>): void => {
  getDb().prepare(`
    INSERT INTO inbox_items (id, studio_id, account_id, platform, platform_item_id, type,
      author_name, author_platform_id, body, parent_post_id, received_at)
    VALUES (@id, @studio_id, @account_id, @platform, @platform_item_id, @type,
      @author_name, @author_platform_id, @body, @parent_post_id, @received_at)
    ON CONFLICT(account_id, platform_item_id) DO NOTHING
  `).run(item);
};

export const getInboxItems = (studioId: string, filters: { platform?: string; status?: string; accountId?: string; includeArchived?: boolean } = {}): InboxItem[] => {
  let q = 'SELECT * FROM inbox_items WHERE studio_id=?';
  const params: unknown[] = [studioId];
  if (!filters.includeArchived) q += ' AND archived_at IS NULL';
  if (filters.platform) { q += ' AND platform=?'; params.push(filters.platform); }
  if (filters.status) { q += ' AND status=?'; params.push(filters.status); }
  if (filters.accountId) { q += ' AND account_id=?'; params.push(filters.accountId); }
  q += ' ORDER BY received_at DESC LIMIT 200';
  return getDb().prepare(q).all(...params) as InboxItem[];
};

export const updateInboxItem = (id: string, fields: { status?: string; assigned_to?: string; internal_note?: string }): void => {
  const cols = Object.entries(fields).filter(([,v]) => v !== undefined).map(([k]) => `${k}=@${k}`).join(', ');
  if (!cols) return;
  getDb().prepare(`UPDATE inbox_items SET ${cols} WHERE id=@id`).run({ ...fields, id });
};

export const archiveInboxItem = (id: string, actorId: string): void => {
  getDb().prepare("UPDATE inbox_items SET archived_at=datetime('now'), archived_by=? WHERE id=?").run(actorId, id);
};

export const restoreInboxItem = (id: string): void => {
  getDb().prepare("UPDATE inbox_items SET archived_at=NULL, archived_by=NULL WHERE id=?").run(id);
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

export const createMediaAsset = (a: Pick<MediaAsset, 'id' | 'studio_id' | 'uploaded_by' | 'filename' | 'mime_type' | 'file_size' | 'storage_path' | 'width' | 'height' | 'duration_s' | 'tags'> & Partial<Pick<MediaAsset, 'source_provider' | 'source_id' | 'source_hash'>>): MediaAsset => {
  getDb().prepare(`INSERT INTO media_assets (id,studio_id,uploaded_by,filename,mime_type,file_size,storage_path,width,height,duration_s,tags,source_provider,source_id,source_hash)
    VALUES (@id,@studio_id,@uploaded_by,@filename,@mime_type,@file_size,@storage_path,@width,@height,@duration_s,@tags,@source_provider,@source_id,@source_hash)`).run({
    ...a,
    source_provider: a.source_provider ?? null,
    source_id: a.source_id ?? null,
    source_hash: a.source_hash ?? null,
  });
  return getDb().prepare('SELECT * FROM media_assets WHERE id=?').get(a.id) as MediaAsset;
};

export const getMediaAssets = (studioId: string, q?: string, includeArchived = false): MediaAsset[] => {
  if (q) {
    if (includeArchived) return getDb().prepare("SELECT * FROM media_assets WHERE studio_id=? AND (filename LIKE ? OR tags LIKE ?) ORDER BY created_at DESC").all(studioId, `%${q}%`, `%${q}%`) as MediaAsset[];
    return getDb().prepare("SELECT * FROM media_assets WHERE studio_id=? AND archived_at IS NULL AND (filename LIKE ? OR tags LIKE ?) ORDER BY created_at DESC").all(studioId, `%${q}%`, `%${q}%`) as MediaAsset[];
  }
  if (includeArchived) return getDb().prepare('SELECT * FROM media_assets WHERE studio_id=? ORDER BY created_at DESC').all(studioId) as MediaAsset[];
  return getDb().prepare('SELECT * FROM media_assets WHERE studio_id=? AND archived_at IS NULL ORDER BY created_at DESC').all(studioId) as MediaAsset[];
};

export const deleteMediaAsset = (id: string): void => {
  getDb().prepare('DELETE FROM media_assets WHERE id=?').run(id);
};

export const archiveMediaAsset = (id: string, actorId: string): void => {
  getDb().prepare("UPDATE media_assets SET archived_at=datetime('now'), archived_by=? WHERE id=?").run(actorId, id);
};

export const restoreMediaAsset = (id: string): void => {
  getDb().prepare("UPDATE media_assets SET archived_at=NULL, archived_by=NULL WHERE id=?").run(id);
};

export const getMediaAssetBySource = (studioId: string, provider: string, sourceId: string): MediaAsset | null =>
  (getDb().prepare('SELECT * FROM media_assets WHERE studio_id=? AND source_provider=? AND source_id=? LIMIT 1').get(studioId, provider, sourceId) as MediaAsset | undefined) ?? null;

export const getMediaAssetByHash = (studioId: string, sourceHash: string): MediaAsset | null =>
  (getDb().prepare('SELECT * FROM media_assets WHERE studio_id=? AND source_hash=? LIMIT 1').get(studioId, sourceHash) as MediaAsset | undefined) ?? null;

export interface ArchivePurgeResult {
  postsDeleted: number;
  inboxDeleted: number;
  mediaDeleted: number;
  mediaStoragePaths: string[];
}

export const purgeArchivedContentOlderThan = (cutoffIso: string): ArchivePurgeResult => {
  const db = getDb();

  const mediaRows = db.prepare(
    "SELECT id, storage_path FROM media_assets WHERE archived_at IS NOT NULL AND archived_at <= datetime(?)",
  ).all(cutoffIso) as Array<{ id: string; storage_path: string }>;

  let mediaDeleted = 0;
  if (mediaRows.length > 0) {
    const placeholders = mediaRows.map(() => '?').join(',');
    const ids = mediaRows.map(r => r.id);
    const mediaDelete = db.prepare(`DELETE FROM media_assets WHERE id IN (${placeholders})`).run(...ids);
    mediaDeleted = mediaDelete.changes;
  }

  const postDelete = db.prepare(
    "DELETE FROM posts WHERE archived_at IS NOT NULL AND archived_at <= datetime(?)",
  ).run(cutoffIso);

  const inboxDelete = db.prepare(
    "DELETE FROM inbox_items WHERE archived_at IS NOT NULL AND archived_at <= datetime(?)",
  ).run(cutoffIso);

  return {
    postsDeleted: postDelete.changes,
    inboxDeleted: inboxDelete.changes,
    mediaDeleted,
    mediaStoragePaths: mediaRows.map(r => r.storage_path),
  };
};

// ─── Team ────────────────────────────────────────────────────────────────────

export interface StudioMember {
  studio_id: string; user_id: string; email: string; name: string;
  role: 'owner' | 'manager' | 'editor' | 'viewer'; joined_at: string;
}

export const getMember = (studioId: string, userId: string): StudioMember | null =>
  (getDb().prepare('SELECT * FROM studio_members WHERE studio_id=? AND user_id=?').get(studioId, userId) as StudioMember | undefined) ?? null;

export const getMembersByStudio = (studioId: string): StudioMember[] =>
  getDb().prepare('SELECT * FROM studio_members WHERE studio_id=? ORDER BY role, name').all(studioId) as StudioMember[];

export const upsertMember = (m: StudioMember): void => {
  getDb().prepare(`INSERT INTO studio_members (studio_id,user_id,email,name,role)
    VALUES (@studio_id,@user_id,@email,@name,@role)
    ON CONFLICT(studio_id,user_id) DO UPDATE SET email=excluded.email, name=excluded.name, role=excluded.role`).run(m);
};

export const removeMember = (studioId: string, userId: string): void => {
  getDb().prepare('DELETE FROM studio_members WHERE studio_id=? AND user_id=?').run(studioId, userId);
};

export const ensureOwner = (studioId: string, userId: string, email: string, name: string): void => {
  if (!getMember(studioId, userId)) {
    upsertMember({ studio_id: studioId, user_id: userId, email, name, role: 'owner', joined_at: new Date().toISOString() });
  }
};

// ─── Approvals ───────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string; post_id: string; requested_by: string; reviewer_id: string | null;
  status: string; reviewer_note: string | null; created_at: string; resolved_at: string | null;
}

export const createApprovalRequest = (id: string, postId: string, requestedBy: string): ApprovalRequest => {
  getDb().prepare('INSERT INTO approval_requests (id,post_id,requested_by) VALUES (?,?,?)').run(id, postId, requestedBy);
  return getDb().prepare('SELECT * FROM approval_requests WHERE id=?').get(id) as ApprovalRequest;
};

export const resolveApproval = (id: string, status: 'approved' | 'rejected' | 'withdrawn', reviewerId?: string, note?: string): void => {
  getDb().prepare("UPDATE approval_requests SET status=?,reviewer_id=?,reviewer_note=?,resolved_at=datetime('now') WHERE id=?").run(status, reviewerId ?? null, note ?? null, id);
};

export const getPendingApproval = (postId: string): ApprovalRequest | null =>
  (getDb().prepare("SELECT * FROM approval_requests WHERE post_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(postId) as ApprovalRequest | undefined) ?? null;

// ─── Notifications ───────────────────────────────────────────────────────────

export const createNotification = (id: string, recipientId: string, studioId: string, type: string, title: string, body?: string, link?: string): void => {
  getDb().prepare('INSERT INTO notifications (id,recipient_id,studio_id,type,title,body,link) VALUES (?,?,?,?,?,?,?)').run(id, recipientId, studioId, type, title, body ?? null, link ?? null);
};

export const getNotifications = (recipientId: string, unreadOnly = false): unknown[] => {
  if (unreadOnly) return getDb().prepare("SELECT * FROM notifications WHERE recipient_id=? AND read=0 ORDER BY created_at DESC LIMIT 50").all(recipientId);
  return getDb().prepare("SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 50").all(recipientId);
};

export const markNotificationsRead = (recipientId: string): void => {
  getDb().prepare("UPDATE notifications SET read=1 WHERE recipient_id=?").run(recipientId);
};

// ─── Studio plans ────────────────────────────────────────────────────────────

export const getLocalStudioPlan = (studioId: string): string | null =>
  ((getDb().prepare('SELECT plan FROM studio_plans WHERE studio_id=?').get(studioId) as { plan: string } | undefined)?.plan) ?? null;

export const setLocalStudioPlan = (studioId: string, plan: string, setBy?: string): void => {
  getDb().prepare(`INSERT INTO studio_plans (studio_id, plan, set_by, set_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(studio_id) DO UPDATE SET plan=excluded.plan, set_by=excluded.set_by, set_at=excluded.set_at`)
    .run(studioId, plan, setBy ?? null);
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

export const getUserByEmail = (email: string): UserRecord | null =>
  (getDb().prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase()) as UserRecord | undefined) ?? null;

export const getUserById = (id: string): UserRecord | null =>
  (getDb().prepare('SELECT * FROM users WHERE id=?').get(id) as UserRecord | undefined) ?? null;

export const createUser = (u: Pick<UserRecord, 'email' | 'name' | 'role' | 'status'> & Partial<Pick<UserRecord, 'google_sub'>>): UserRecord => {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  getDb().prepare(`INSERT INTO users (id, email, name, google_sub, role, status)
    VALUES (@id, @email, @name, @google_sub, @role, @status)`)
    .run({ id, email: u.email.toLowerCase(), name: u.name, google_sub: u.google_sub ?? null, role: u.role, status: u.status });
  return getUserById(id)!;
};

export const updateUser = (id: string, fields: Partial<Pick<UserRecord, 'name' | 'google_sub' | 'role' | 'status' | 'last_login_at'>>): void => {
  const cols = Object.entries(fields).filter(([,v]) => v !== undefined).map(([k]) => `${k}=@${k}`).join(', ');
  if (!cols) return;
  getDb().prepare(`UPDATE users SET ${cols} WHERE id=@id`).run({ ...fields, id });
};

// ─── Audit ───────────────────────────────────────────────────────────────────

export const audit = (studioId: string, actorId: string, action: string, entityType: string, entityId: string, detail?: unknown): void => {
  const { v4: uuidv4 } = require('uuid');
  getDb().prepare('INSERT INTO audit_events (id,studio_id,actor_id,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?,?)')
    .run(uuidv4(), studioId, actorId, action, entityType, entityId, JSON.stringify(detail ?? {}));
};
