import Database from 'better-sqlite3';
export declare const getLocalDbPath: () => string;
export declare const getDb: () => Database.Database;
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
export declare const getAccountsByStudio: (studioId: string) => AccountRecord[];
export declare const getAccountById: (id: string) => AccountRecord | null;
export declare const upsertAccount: (a: Omit<AccountRecord, "connected_at" | "last_synced_at" | "status"> & Partial<Pick<AccountRecord, "status">>) => AccountRecord;
export declare const updateAccountStatus: (id: string, status: "active" | "expired" | "error") => void;
export declare const updateAccountTokens: (id: string, accessToken: string, refreshToken: string | null, expiresAt: string | null) => void;
export declare const deleteAccount: (id: string) => void;
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
export declare const createPost: (p: Pick<PostRecord, "id" | "studio_id" | "author_user_id" | "title">) => PostRecord;
export declare const getPostById: (id: string) => PostRecord | null;
export declare const getPostsByStudio: (studioId: string, status?: string, includeArchived?: boolean) => PostRecord[];
export declare const getPostsInRange: (studioId: string, from: string, to: string, includeArchived?: boolean) => PostRecord[];
export declare const updatePost: (id: string, fields: Partial<PostRecord>) => void;
export declare const archivePost: (id: string, actorId: string) => void;
export declare const restorePost: (id: string) => void;
export declare const createPostVariant: (v: Omit<PostVariantRecord, "status" | "error_message" | "retry_count" | "published_at" | "platform_post_id">) => PostVariantRecord;
export declare const getVariantsByPost: (postId: string) => PostVariantRecord[];
export declare const updateVariant: (id: string, fields: Partial<PostVariantRecord>) => void;
export interface QueueItem {
    id: string;
    post_variant_id: string;
    fire_at: string;
    attempts: number;
    last_attempt_at: string | null;
    status: string;
    created_at: string;
}
export declare const enqueueVariant: (id: string, variantId: string, fireAt: string) => void;
export declare const getDueQueueItems: () => QueueItem[];
export declare const lockQueueItem: (id: string) => boolean;
export declare const resolveQueueItem: (id: string, success: boolean, nextFireAt?: string) => void;
export interface InboxItem {
    id: string;
    studio_id: string;
    account_id: string;
    platform: string;
    platform_item_id: string;
    type: string;
    author_name: string | null;
    author_platform_id: string | null;
    body: string | null;
    parent_post_id: string | null;
    status: string;
    assigned_to: string | null;
    internal_note: string | null;
    archived_at: string | null;
    archived_by: string | null;
    received_at: string;
    created_at: string;
}
export declare const upsertInboxItem: (item: Omit<InboxItem, "status" | "assigned_to" | "internal_note" | "created_at">) => void;
export declare const getInboxItems: (studioId: string, filters?: {
    platform?: string;
    status?: string;
    accountId?: string;
    includeArchived?: boolean;
}) => InboxItem[];
export declare const updateInboxItem: (id: string, fields: {
    status?: string;
    assigned_to?: string;
    internal_note?: string;
}) => void;
export declare const archiveInboxItem: (id: string, actorId: string) => void;
export declare const restoreInboxItem: (id: string) => void;
export interface MediaAsset {
    id: string;
    studio_id: string;
    uploaded_by: string;
    filename: string;
    mime_type: string;
    file_size: number;
    storage_path: string;
    width: number | null;
    height: number | null;
    duration_s: number | null;
    tags: string;
    source_provider: string | null;
    source_id: string | null;
    source_hash: string | null;
    archived_at: string | null;
    archived_by: string | null;
    created_at: string;
}
export declare const createMediaAsset: (a: Pick<MediaAsset, "id" | "studio_id" | "uploaded_by" | "filename" | "mime_type" | "file_size" | "storage_path" | "width" | "height" | "duration_s" | "tags"> & Partial<Pick<MediaAsset, "source_provider" | "source_id" | "source_hash">>) => MediaAsset;
export declare const getMediaAssets: (studioId: string, q?: string, includeArchived?: boolean) => MediaAsset[];
export declare const deleteMediaAsset: (id: string) => void;
export declare const archiveMediaAsset: (id: string, actorId: string) => void;
export declare const restoreMediaAsset: (id: string) => void;
export declare const getMediaAssetBySource: (studioId: string, provider: string, sourceId: string) => MediaAsset | null;
export declare const getMediaAssetByHash: (studioId: string, sourceHash: string) => MediaAsset | null;
export interface ArchivePurgeResult {
    postsDeleted: number;
    inboxDeleted: number;
    mediaDeleted: number;
    mediaStoragePaths: string[];
}
export declare const purgeArchivedContentOlderThan: (cutoffIso: string) => ArchivePurgeResult;
export interface StudioMember {
    studio_id: string;
    user_id: string;
    email: string;
    name: string;
    role: 'owner' | 'manager' | 'editor' | 'viewer';
    joined_at: string;
}
export declare const getMember: (studioId: string, userId: string) => StudioMember | null;
export declare const getMembersByStudio: (studioId: string) => StudioMember[];
export declare const upsertMember: (m: StudioMember) => void;
export declare const removeMember: (studioId: string, userId: string) => void;
export declare const ensureOwner: (studioId: string, userId: string, email: string, name: string) => void;
export interface ApprovalRequest {
    id: string;
    post_id: string;
    requested_by: string;
    reviewer_id: string | null;
    status: string;
    reviewer_note: string | null;
    created_at: string;
    resolved_at: string | null;
}
export declare const createApprovalRequest: (id: string, postId: string, requestedBy: string) => ApprovalRequest;
export declare const resolveApproval: (id: string, status: "approved" | "rejected" | "withdrawn", reviewerId?: string, note?: string) => void;
export declare const getPendingApproval: (postId: string) => ApprovalRequest | null;
export declare const createNotification: (id: string, recipientId: string, studioId: string, type: string, title: string, body?: string, link?: string) => void;
export declare const getNotifications: (recipientId: string, unreadOnly?: boolean) => unknown[];
export declare const markNotificationsRead: (recipientId: string) => void;
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
export declare const createRedditAssist: (r: Pick<RedditAssistRecord, "id" | "post_id" | "studio_id" | "requested_by" | "subreddit" | "title" | "body" | "handoff_note">) => RedditAssistRecord;
export declare const getRedditAssistsByPost: (studioId: string, postId: string) => RedditAssistRecord[];
export declare const markRedditAssistPublished: (id: string, publishUrl: string) => void;
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
export declare const createTikTokAssist: (r: Pick<TikTokAssistRecord, "id" | "post_id" | "studio_id" | "requested_by" | "caption" | "media_asset_id" | "handoff_note">) => TikTokAssistRecord;
export declare const getTikTokAssistsByPost: (studioId: string, postId: string) => TikTokAssistRecord[];
export declare const markTikTokAssistPublished: (id: string, publishUrl: string) => void;
export declare const getLocalStudioPlan: (studioId: string) => string | null;
export declare const setLocalStudioPlan: (studioId: string, plan: string, setBy?: string) => void;
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
export declare const getUserByEmail: (email: string) => UserRecord | null;
export declare const getUserById: (id: string) => UserRecord | null;
export declare const createUser: (u: Pick<UserRecord, "email" | "name" | "role" | "status"> & Partial<Pick<UserRecord, "google_sub">>) => UserRecord;
export declare const updateUser: (id: string, fields: Partial<Pick<UserRecord, "name" | "google_sub" | "role" | "status" | "last_login_at">>) => void;
export declare const audit: (studioId: string, actorId: string, action: string, entityType: string, entityId: string, detail?: unknown) => void;
//# sourceMappingURL=db.d.ts.map