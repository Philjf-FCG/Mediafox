"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalStudioPlan = exports.markRedditAssistPublished = exports.getRedditAssistsByPost = exports.createRedditAssist = exports.markNotificationsRead = exports.getNotifications = exports.createNotification = exports.getPendingApproval = exports.resolveApproval = exports.createApprovalRequest = exports.ensureOwner = exports.removeMember = exports.upsertMember = exports.getMembersByStudio = exports.getMember = exports.purgeArchivedContentOlderThan = exports.getMediaAssetByHash = exports.getMediaAssetBySource = exports.restoreMediaAsset = exports.archiveMediaAsset = exports.deleteMediaAsset = exports.getMediaAssets = exports.createMediaAsset = exports.restoreInboxItem = exports.archiveInboxItem = exports.updateInboxItem = exports.getInboxItems = exports.upsertInboxItem = exports.resolveQueueItem = exports.lockQueueItem = exports.getDueQueueItems = exports.enqueueVariant = exports.updateVariant = exports.getVariantsByPost = exports.createPostVariant = exports.restorePost = exports.archivePost = exports.updatePost = exports.getPostsInRange = exports.getPostsByStudio = exports.getPostById = exports.createPost = exports.deleteAccount = exports.updateAccountTokens = exports.updateAccountStatus = exports.upsertAccount = exports.getAccountById = exports.getAccountsByStudio = exports.getDb = exports.getLocalDbPath = void 0;
exports.audit = exports.updateUser = exports.createUser = exports.getUserById = exports.getUserByEmail = exports.setLocalStudioPlan = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let _db = null;
const getLocalDbPath = () => {
    if (process.env.DATABASE_PATH)
        return process.env.DATABASE_PATH;
    return path_1.default.join(process.cwd(), 'mediafox.db');
};
exports.getLocalDbPath = getLocalDbPath;
const getDb = () => {
    if (_db)
        return _db;
    const dbPath = (0, exports.getLocalDbPath)();
    const dir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    _db = new better_sqlite3_1.default(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
    return _db;
};
exports.getDb = getDb;
const hasColumn = (db, table, column) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
};
const ensureColumn = (db, table, column, sqlType) => {
    if (!hasColumn(db, table, column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
    }
};
const migrate = (db) => {
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
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE INDEX IF NOT EXISTS idx_reddit_assists  ON reddit_assists(studio_id, post_id, status);
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
const getAccountsByStudio = (studioId) => (0, exports.getDb)().prepare('SELECT * FROM accounts WHERE studio_id = ? ORDER BY platform, display_name').all(studioId);
exports.getAccountsByStudio = getAccountsByStudio;
const getAccountById = (id) => (0, exports.getDb)().prepare('SELECT * FROM accounts WHERE id = ?').get(id) ?? null;
exports.getAccountById = getAccountById;
const upsertAccount = (a) => {
    (0, exports.getDb)().prepare(`
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
    return (0, exports.getAccountById)(a.id);
};
exports.upsertAccount = upsertAccount;
const updateAccountStatus = (id, status) => {
    (0, exports.getDb)().prepare('UPDATE accounts SET status=? WHERE id=?').run(status, id);
};
exports.updateAccountStatus = updateAccountStatus;
const updateAccountTokens = (id, accessToken, refreshToken, expiresAt) => {
    (0, exports.getDb)().prepare('UPDATE accounts SET access_token=?, refresh_token=?, token_expires_at=?, status=\'active\' WHERE id=?')
        .run(accessToken, refreshToken, expiresAt, id);
};
exports.updateAccountTokens = updateAccountTokens;
const deleteAccount = (id) => {
    (0, exports.getDb)().prepare('DELETE FROM accounts WHERE id=?').run(id);
};
exports.deleteAccount = deleteAccount;
const createPost = (p) => {
    (0, exports.getDb)().prepare('INSERT INTO posts (id, studio_id, author_user_id, title) VALUES (@id, @studio_id, @author_user_id, @title)').run(p);
    return (0, exports.getDb)().prepare('SELECT * FROM posts WHERE id=?').get(p.id);
};
exports.createPost = createPost;
const getPostById = (id) => (0, exports.getDb)().prepare('SELECT * FROM posts WHERE id=?').get(id) ?? null;
exports.getPostById = getPostById;
const getPostsByStudio = (studioId, status, includeArchived = false) => {
    if (status) {
        if (includeArchived)
            return (0, exports.getDb)().prepare('SELECT * FROM posts WHERE studio_id=? AND status=? ORDER BY created_at DESC').all(studioId, status);
        return (0, exports.getDb)().prepare('SELECT * FROM posts WHERE studio_id=? AND status=? AND archived_at IS NULL ORDER BY created_at DESC').all(studioId, status);
    }
    if (includeArchived)
        return (0, exports.getDb)().prepare('SELECT * FROM posts WHERE studio_id=? ORDER BY created_at DESC').all(studioId);
    return (0, exports.getDb)().prepare('SELECT * FROM posts WHERE studio_id=? AND archived_at IS NULL ORDER BY created_at DESC').all(studioId);
};
exports.getPostsByStudio = getPostsByStudio;
const getPostsInRange = (studioId, from, to, includeArchived = false) => (0, exports.getDb)().prepare(`SELECT * FROM posts WHERE studio_id=? ${includeArchived ? '' : 'AND archived_at IS NULL'} AND (
    (scheduled_at >= ? AND scheduled_at <= ?) OR (published_at >= ? AND published_at <= ?)
  ) ORDER BY COALESCE(scheduled_at, published_at)`).all(studioId, from, to, from, to);
exports.getPostsInRange = getPostsInRange;
const updatePost = (id, fields) => {
    const updates = Object.entries(fields)
        .filter(([k]) => !['id', 'studio_id', 'author_user_id', 'created_at'].includes(k))
        .map(([k]) => `${k}=@${k}`).join(', ');
    if (!updates)
        return;
    (0, exports.getDb)().prepare(`UPDATE posts SET ${updates}, updated_at=datetime('now') WHERE id=@id`).run({ ...fields, id });
};
exports.updatePost = updatePost;
const archivePost = (id, actorId) => {
    (0, exports.getDb)().prepare("UPDATE posts SET archived_at=datetime('now'), archived_by=?, updated_at=datetime('now') WHERE id=?").run(actorId, id);
};
exports.archivePost = archivePost;
const restorePost = (id) => {
    (0, exports.getDb)().prepare("UPDATE posts SET archived_at=NULL, archived_by=NULL, updated_at=datetime('now') WHERE id=?").run(id);
};
exports.restorePost = restorePost;
const createPostVariant = (v) => {
    (0, exports.getDb)().prepare(`INSERT INTO post_variants (id, post_id, account_id, body, media_ids)
    VALUES (@id, @post_id, @account_id, @body, @media_ids)`).run(v);
    return (0, exports.getDb)().prepare('SELECT * FROM post_variants WHERE id=?').get(v.id);
};
exports.createPostVariant = createPostVariant;
const getVariantsByPost = (postId) => (0, exports.getDb)().prepare('SELECT * FROM post_variants WHERE post_id=?').all(postId);
exports.getVariantsByPost = getVariantsByPost;
const updateVariant = (id, fields) => {
    const cols = Object.entries(fields).filter(([k]) => k !== 'id').map(([k]) => `${k}=@${k}`).join(', ');
    if (!cols)
        return;
    (0, exports.getDb)().prepare(`UPDATE post_variants SET ${cols} WHERE id=@id`).run({ ...fields, id });
};
exports.updateVariant = updateVariant;
const enqueueVariant = (id, variantId, fireAt) => {
    (0, exports.getDb)().prepare('INSERT OR REPLACE INTO post_queue (id, post_variant_id, fire_at) VALUES (?,?,?)').run(id, variantId, fireAt);
};
exports.enqueueVariant = enqueueVariant;
const getDueQueueItems = () => (0, exports.getDb)().prepare("SELECT * FROM post_queue WHERE status='pending' AND fire_at <= datetime('now') ORDER BY fire_at LIMIT 50").all();
exports.getDueQueueItems = getDueQueueItems;
const lockQueueItem = (id) => {
    const r = (0, exports.getDb)().prepare("UPDATE post_queue SET status='processing', last_attempt_at=datetime('now'), attempts=attempts+1 WHERE id=? AND status='pending'").run(id);
    return r.changes > 0;
};
exports.lockQueueItem = lockQueueItem;
const resolveQueueItem = (id, success, nextFireAt) => {
    if (success) {
        (0, exports.getDb)().prepare("UPDATE post_queue SET status='done' WHERE id=?").run(id);
    }
    else if (nextFireAt) {
        (0, exports.getDb)().prepare("UPDATE post_queue SET status='pending', fire_at=? WHERE id=?").run(nextFireAt, id);
    }
    else {
        (0, exports.getDb)().prepare("UPDATE post_queue SET status='dead' WHERE id=?").run(id);
    }
};
exports.resolveQueueItem = resolveQueueItem;
const upsertInboxItem = (item) => {
    (0, exports.getDb)().prepare(`
    INSERT INTO inbox_items (id, studio_id, account_id, platform, platform_item_id, type,
      author_name, author_platform_id, body, parent_post_id, received_at)
    VALUES (@id, @studio_id, @account_id, @platform, @platform_item_id, @type,
      @author_name, @author_platform_id, @body, @parent_post_id, @received_at)
    ON CONFLICT(account_id, platform_item_id) DO NOTHING
  `).run(item);
};
exports.upsertInboxItem = upsertInboxItem;
const getInboxItems = (studioId, filters = {}) => {
    let q = 'SELECT * FROM inbox_items WHERE studio_id=?';
    const params = [studioId];
    if (!filters.includeArchived)
        q += ' AND archived_at IS NULL';
    if (filters.platform) {
        q += ' AND platform=?';
        params.push(filters.platform);
    }
    if (filters.status) {
        q += ' AND status=?';
        params.push(filters.status);
    }
    if (filters.accountId) {
        q += ' AND account_id=?';
        params.push(filters.accountId);
    }
    q += ' ORDER BY received_at DESC LIMIT 200';
    return (0, exports.getDb)().prepare(q).all(...params);
};
exports.getInboxItems = getInboxItems;
const updateInboxItem = (id, fields) => {
    const cols = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k]) => `${k}=@${k}`).join(', ');
    if (!cols)
        return;
    (0, exports.getDb)().prepare(`UPDATE inbox_items SET ${cols} WHERE id=@id`).run({ ...fields, id });
};
exports.updateInboxItem = updateInboxItem;
const archiveInboxItem = (id, actorId) => {
    (0, exports.getDb)().prepare("UPDATE inbox_items SET archived_at=datetime('now'), archived_by=? WHERE id=?").run(actorId, id);
};
exports.archiveInboxItem = archiveInboxItem;
const restoreInboxItem = (id) => {
    (0, exports.getDb)().prepare("UPDATE inbox_items SET archived_at=NULL, archived_by=NULL WHERE id=?").run(id);
};
exports.restoreInboxItem = restoreInboxItem;
const createMediaAsset = (a) => {
    (0, exports.getDb)().prepare(`INSERT INTO media_assets (id,studio_id,uploaded_by,filename,mime_type,file_size,storage_path,width,height,duration_s,tags,source_provider,source_id,source_hash)
    VALUES (@id,@studio_id,@uploaded_by,@filename,@mime_type,@file_size,@storage_path,@width,@height,@duration_s,@tags,@source_provider,@source_id,@source_hash)`).run({
        ...a,
        source_provider: a.source_provider ?? null,
        source_id: a.source_id ?? null,
        source_hash: a.source_hash ?? null,
    });
    return (0, exports.getDb)().prepare('SELECT * FROM media_assets WHERE id=?').get(a.id);
};
exports.createMediaAsset = createMediaAsset;
const getMediaAssets = (studioId, q, includeArchived = false) => {
    if (q) {
        if (includeArchived)
            return (0, exports.getDb)().prepare("SELECT * FROM media_assets WHERE studio_id=? AND (filename LIKE ? OR tags LIKE ?) ORDER BY created_at DESC").all(studioId, `%${q}%`, `%${q}%`);
        return (0, exports.getDb)().prepare("SELECT * FROM media_assets WHERE studio_id=? AND archived_at IS NULL AND (filename LIKE ? OR tags LIKE ?) ORDER BY created_at DESC").all(studioId, `%${q}%`, `%${q}%`);
    }
    if (includeArchived)
        return (0, exports.getDb)().prepare('SELECT * FROM media_assets WHERE studio_id=? ORDER BY created_at DESC').all(studioId);
    return (0, exports.getDb)().prepare('SELECT * FROM media_assets WHERE studio_id=? AND archived_at IS NULL ORDER BY created_at DESC').all(studioId);
};
exports.getMediaAssets = getMediaAssets;
const deleteMediaAsset = (id) => {
    (0, exports.getDb)().prepare('DELETE FROM media_assets WHERE id=?').run(id);
};
exports.deleteMediaAsset = deleteMediaAsset;
const archiveMediaAsset = (id, actorId) => {
    (0, exports.getDb)().prepare("UPDATE media_assets SET archived_at=datetime('now'), archived_by=? WHERE id=?").run(actorId, id);
};
exports.archiveMediaAsset = archiveMediaAsset;
const restoreMediaAsset = (id) => {
    (0, exports.getDb)().prepare("UPDATE media_assets SET archived_at=NULL, archived_by=NULL WHERE id=?").run(id);
};
exports.restoreMediaAsset = restoreMediaAsset;
const getMediaAssetBySource = (studioId, provider, sourceId) => (0, exports.getDb)().prepare('SELECT * FROM media_assets WHERE studio_id=? AND source_provider=? AND source_id=? LIMIT 1').get(studioId, provider, sourceId) ?? null;
exports.getMediaAssetBySource = getMediaAssetBySource;
const getMediaAssetByHash = (studioId, sourceHash) => (0, exports.getDb)().prepare('SELECT * FROM media_assets WHERE studio_id=? AND source_hash=? LIMIT 1').get(studioId, sourceHash) ?? null;
exports.getMediaAssetByHash = getMediaAssetByHash;
const purgeArchivedContentOlderThan = (cutoffIso) => {
    const db = (0, exports.getDb)();
    const mediaRows = db.prepare("SELECT id, storage_path FROM media_assets WHERE archived_at IS NOT NULL AND archived_at <= datetime(?)").all(cutoffIso);
    let mediaDeleted = 0;
    if (mediaRows.length > 0) {
        const placeholders = mediaRows.map(() => '?').join(',');
        const ids = mediaRows.map(r => r.id);
        const mediaDelete = db.prepare(`DELETE FROM media_assets WHERE id IN (${placeholders})`).run(...ids);
        mediaDeleted = mediaDelete.changes;
    }
    const postDelete = db.prepare("DELETE FROM posts WHERE archived_at IS NOT NULL AND archived_at <= datetime(?)").run(cutoffIso);
    const inboxDelete = db.prepare("DELETE FROM inbox_items WHERE archived_at IS NOT NULL AND archived_at <= datetime(?)").run(cutoffIso);
    return {
        postsDeleted: postDelete.changes,
        inboxDeleted: inboxDelete.changes,
        mediaDeleted,
        mediaStoragePaths: mediaRows.map(r => r.storage_path),
    };
};
exports.purgeArchivedContentOlderThan = purgeArchivedContentOlderThan;
const getMember = (studioId, userId) => (0, exports.getDb)().prepare('SELECT * FROM studio_members WHERE studio_id=? AND user_id=?').get(studioId, userId) ?? null;
exports.getMember = getMember;
const getMembersByStudio = (studioId) => (0, exports.getDb)().prepare('SELECT * FROM studio_members WHERE studio_id=? ORDER BY role, name').all(studioId);
exports.getMembersByStudio = getMembersByStudio;
const upsertMember = (m) => {
    (0, exports.getDb)().prepare(`INSERT INTO studio_members (studio_id,user_id,email,name,role)
    VALUES (@studio_id,@user_id,@email,@name,@role)
    ON CONFLICT(studio_id,user_id) DO UPDATE SET email=excluded.email, name=excluded.name, role=excluded.role`).run(m);
};
exports.upsertMember = upsertMember;
const removeMember = (studioId, userId) => {
    (0, exports.getDb)().prepare('DELETE FROM studio_members WHERE studio_id=? AND user_id=?').run(studioId, userId);
};
exports.removeMember = removeMember;
const ensureOwner = (studioId, userId, email, name) => {
    if (!(0, exports.getMember)(studioId, userId)) {
        (0, exports.upsertMember)({ studio_id: studioId, user_id: userId, email, name, role: 'owner', joined_at: new Date().toISOString() });
    }
};
exports.ensureOwner = ensureOwner;
const createApprovalRequest = (id, postId, requestedBy) => {
    (0, exports.getDb)().prepare('INSERT INTO approval_requests (id,post_id,requested_by) VALUES (?,?,?)').run(id, postId, requestedBy);
    return (0, exports.getDb)().prepare('SELECT * FROM approval_requests WHERE id=?').get(id);
};
exports.createApprovalRequest = createApprovalRequest;
const resolveApproval = (id, status, reviewerId, note) => {
    (0, exports.getDb)().prepare("UPDATE approval_requests SET status=?,reviewer_id=?,reviewer_note=?,resolved_at=datetime('now') WHERE id=?").run(status, reviewerId ?? null, note ?? null, id);
};
exports.resolveApproval = resolveApproval;
const getPendingApproval = (postId) => (0, exports.getDb)().prepare("SELECT * FROM approval_requests WHERE post_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").get(postId) ?? null;
exports.getPendingApproval = getPendingApproval;
// ─── Notifications ───────────────────────────────────────────────────────────
const createNotification = (id, recipientId, studioId, type, title, body, link) => {
    (0, exports.getDb)().prepare('INSERT INTO notifications (id,recipient_id,studio_id,type,title,body,link) VALUES (?,?,?,?,?,?,?)').run(id, recipientId, studioId, type, title, body ?? null, link ?? null);
};
exports.createNotification = createNotification;
const getNotifications = (recipientId, unreadOnly = false) => {
    if (unreadOnly)
        return (0, exports.getDb)().prepare("SELECT * FROM notifications WHERE recipient_id=? AND read=0 ORDER BY created_at DESC LIMIT 50").all(recipientId);
    return (0, exports.getDb)().prepare("SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 50").all(recipientId);
};
exports.getNotifications = getNotifications;
const markNotificationsRead = (recipientId) => {
    (0, exports.getDb)().prepare("UPDATE notifications SET read=1 WHERE recipient_id=?").run(recipientId);
};
exports.markNotificationsRead = markNotificationsRead;
const createRedditAssist = (r) => {
    (0, exports.getDb)().prepare(`
    INSERT INTO reddit_assists (id, post_id, studio_id, requested_by, subreddit, title, body, status, handoff_note)
    VALUES (@id, @post_id, @studio_id, @requested_by, @subreddit, @title, @body, 'handed_off', @handoff_note)
  `).run(r);
    return (0, exports.getDb)().prepare('SELECT * FROM reddit_assists WHERE id=?').get(r.id);
};
exports.createRedditAssist = createRedditAssist;
const getRedditAssistsByPost = (studioId, postId) => (0, exports.getDb)().prepare('SELECT * FROM reddit_assists WHERE studio_id=? AND post_id=? ORDER BY created_at DESC').all(studioId, postId);
exports.getRedditAssistsByPost = getRedditAssistsByPost;
const markRedditAssistPublished = (id, publishUrl) => {
    (0, exports.getDb)().prepare(`
    UPDATE reddit_assists
    SET status='published', publish_url=?, updated_at=datetime('now')
    WHERE id=?
  `).run(publishUrl, id);
};
exports.markRedditAssistPublished = markRedditAssistPublished;
// ─── Studio plans ────────────────────────────────────────────────────────────
const getLocalStudioPlan = (studioId) => ((0, exports.getDb)().prepare('SELECT plan FROM studio_plans WHERE studio_id=?').get(studioId)?.plan) ?? null;
exports.getLocalStudioPlan = getLocalStudioPlan;
const setLocalStudioPlan = (studioId, plan, setBy) => {
    (0, exports.getDb)().prepare(`INSERT INTO studio_plans (studio_id, plan, set_by, set_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(studio_id) DO UPDATE SET plan=excluded.plan, set_by=excluded.set_by, set_at=excluded.set_at`)
        .run(studioId, plan, setBy ?? null);
};
exports.setLocalStudioPlan = setLocalStudioPlan;
const getUserByEmail = (email) => (0, exports.getDb)().prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase()) ?? null;
exports.getUserByEmail = getUserByEmail;
const getUserById = (id) => (0, exports.getDb)().prepare('SELECT * FROM users WHERE id=?').get(id) ?? null;
exports.getUserById = getUserById;
const createUser = (u) => {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    (0, exports.getDb)().prepare(`INSERT INTO users (id, email, name, google_sub, role, status)
    VALUES (@id, @email, @name, @google_sub, @role, @status)`)
        .run({ id, email: u.email.toLowerCase(), name: u.name, google_sub: u.google_sub ?? null, role: u.role, status: u.status });
    return (0, exports.getUserById)(id);
};
exports.createUser = createUser;
const updateUser = (id, fields) => {
    const cols = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k]) => `${k}=@${k}`).join(', ');
    if (!cols)
        return;
    (0, exports.getDb)().prepare(`UPDATE users SET ${cols} WHERE id=@id`).run({ ...fields, id });
};
exports.updateUser = updateUser;
// ─── Audit ───────────────────────────────────────────────────────────────────
const audit = (studioId, actorId, action, entityType, entityId, detail) => {
    const { v4: uuidv4 } = require('uuid');
    (0, exports.getDb)().prepare('INSERT INTO audit_events (id,studio_id,actor_id,action,entity_type,entity_id,detail) VALUES (?,?,?,?,?,?,?)')
        .run(uuidv4(), studioId, actorId, action, entityType, entityId, JSON.stringify(detail ?? {}));
};
exports.audit = audit;
//# sourceMappingURL=db.js.map