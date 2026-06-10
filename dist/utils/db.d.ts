import { Pool } from 'pg';
export declare function getPool(): Pool;
export declare function initSchema(): Promise<void>;
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
export declare const getAccountsByStudio: (studioId: string) => Promise<AccountRecord[]>;
export declare const getAccountById: (id: string) => Promise<AccountRecord | null>;
export declare const upsertAccount: (a: Omit<AccountRecord, "connected_at" | "last_synced_at" | "status"> & Partial<Pick<AccountRecord, "status">>) => Promise<AccountRecord>;
export declare const updateAccountStatus: (id: string, status: "active" | "expired" | "error") => Promise<void>;
export declare const updateAccountTokens: (id: string, accessToken: string, refreshToken: string | null, expiresAt: string | null) => Promise<void>;
export declare const deleteAccount: (id: string) => Promise<void>;
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
export declare const createPost: (p: Pick<PostRecord, "id" | "studio_id" | "author_user_id" | "title">) => Promise<PostRecord>;
export declare const getPostById: (id: string) => Promise<PostRecord | null>;
export declare const getPostsByStudio: (studioId: string, status?: string, includeArchived?: boolean) => Promise<PostRecord[]>;
export declare const getPostsInRange: (studioId: string, from: string, to: string, includeArchived?: boolean) => Promise<PostRecord[]>;
export declare const updatePost: (id: string, fields: Partial<PostRecord>) => Promise<void>;
export declare const archivePost: (id: string, actorId: string) => Promise<void>;
export declare const restorePost: (id: string) => Promise<void>;
export declare const createPostVariant: (v: Omit<PostVariantRecord, "status" | "error_message" | "retry_count" | "published_at" | "platform_post_id">) => Promise<PostVariantRecord>;
export declare const getVariantsByPost: (postId: string) => Promise<PostVariantRecord[]>;
export declare const updateVariant: (id: string, fields: Partial<PostVariantRecord>) => Promise<void>;
export interface QueueItem {
    id: string;
    post_variant_id: string;
    fire_at: string;
    attempts: number;
    last_attempt_at: string | null;
    status: string;
    created_at: string;
}
export declare const enqueueVariant: (id: string, variantId: string, fireAt: string) => Promise<void>;
export declare const getDueQueueItems: () => Promise<QueueItem[]>;
export declare const lockQueueItem: (id: string) => Promise<boolean>;
export declare const resolveQueueItem: (id: string, success: boolean, nextFireAt?: string) => Promise<void>;
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
export declare const upsertInboxItem: (item: Omit<InboxItem, "status" | "assigned_to" | "internal_note" | "created_at">) => Promise<void>;
export declare const getInboxItems: (studioId: string, filters?: {
    platform?: string;
    status?: string;
    accountId?: string;
    includeArchived?: boolean;
}) => Promise<InboxItem[]>;
export declare const updateInboxItem: (id: string, fields: {
    status?: string;
    assigned_to?: string;
    internal_note?: string;
}) => Promise<void>;
export declare const archiveInboxItem: (id: string, actorId: string) => Promise<void>;
export declare const restoreInboxItem: (id: string) => Promise<void>;
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
export declare const createMediaAsset: (a: Pick<MediaAsset, "id" | "studio_id" | "uploaded_by" | "filename" | "mime_type" | "file_size" | "storage_path" | "width" | "height" | "duration_s" | "tags"> & Partial<Pick<MediaAsset, "source_provider" | "source_id" | "source_hash">>) => Promise<MediaAsset>;
export declare const getMediaAssets: (studioId: string, q?: string, includeArchived?: boolean) => Promise<MediaAsset[]>;
export declare const deleteMediaAsset: (id: string) => Promise<void>;
export declare const archiveMediaAsset: (id: string, actorId: string) => Promise<void>;
export declare const restoreMediaAsset: (id: string) => Promise<void>;
export declare const getMediaAssetBySource: (studioId: string, provider: string, sourceId: string) => Promise<MediaAsset | null>;
export declare const getMediaAssetByHash: (studioId: string, sourceHash: string) => Promise<MediaAsset | null>;
export interface ArchivePurgeResult {
    postsDeleted: number;
    inboxDeleted: number;
    mediaDeleted: number;
    mediaStoragePaths: string[];
}
export declare const purgeArchivedContentOlderThan: (cutoffIso: string) => Promise<ArchivePurgeResult>;
export interface StudioMember {
    studio_id: string;
    user_id: string;
    email: string;
    name: string;
    role: 'owner' | 'manager' | 'editor' | 'viewer';
    joined_at: string;
}
export declare const getMember: (studioId: string, userId: string) => Promise<StudioMember | null>;
export declare const getMembersByStudio: (studioId: string) => Promise<StudioMember[]>;
export declare const upsertMember: (m: StudioMember) => Promise<void>;
export declare const removeMember: (studioId: string, userId: string) => Promise<void>;
export declare const ensureOwner: (studioId: string, userId: string, email: string, name: string) => Promise<void>;
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
export declare const createApprovalRequest: (id: string, postId: string, requestedBy: string) => Promise<ApprovalRequest>;
export declare const resolveApproval: (id: string, status: "approved" | "rejected" | "withdrawn", reviewerId?: string, note?: string) => Promise<void>;
export declare const getPendingApproval: (postId: string) => Promise<ApprovalRequest | null>;
export declare const createNotification: (id: string, recipientId: string, studioId: string, type: string, title: string, body?: string, link?: string) => Promise<void>;
export declare const getNotifications: (recipientId: string, unreadOnly?: boolean) => Promise<unknown[]>;
export declare const markNotificationsRead: (recipientId: string) => Promise<void>;
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
export declare const createRedditAssist: (r: Pick<RedditAssistRecord, "id" | "post_id" | "studio_id" | "requested_by" | "subreddit" | "title" | "body" | "handoff_note">) => Promise<RedditAssistRecord>;
export declare const getRedditAssistsByPost: (studioId: string, postId: string) => Promise<RedditAssistRecord[]>;
export declare const markRedditAssistPublished: (id: string, publishUrl: string) => Promise<void>;
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
export declare const createTikTokAssist: (r: Pick<TikTokAssistRecord, "id" | "post_id" | "studio_id" | "requested_by" | "caption" | "media_asset_id" | "handoff_note">) => Promise<TikTokAssistRecord>;
export declare const getTikTokAssistsByPost: (studioId: string, postId: string) => Promise<TikTokAssistRecord[]>;
export declare const markTikTokAssistPublished: (id: string, publishUrl: string) => Promise<void>;
export declare const getLocalStudioPlan: (studioId: string) => Promise<string | null>;
export declare const setLocalStudioPlan: (studioId: string, plan: string, setBy?: string) => Promise<void>;
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
export declare const getStudioIntegrationSettings: (studioId: string) => Promise<StudioIntegrationSettings | null>;
export declare const getStudioIntegrationSettingsSummary: (studioId: string) => Promise<Omit<StudioIntegrationSettings, "linkedin_client_secret" | "meta_app_secret"> & {
    has_linkedin_client_secret: boolean;
    has_meta_app_secret: boolean;
}>;
export declare const upsertStudioIntegrationSettings: (studioId: string, updatedBy: string, input: StudioIntegrationSettingsInput) => Promise<void>;
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
export declare const getUserByEmail: (email: string) => Promise<UserRecord | null>;
export declare const getUserById: (id: string) => Promise<UserRecord | null>;
export declare const createUser: (u: Pick<UserRecord, "email" | "name" | "role" | "status"> & Partial<Pick<UserRecord, "google_sub">>) => Promise<UserRecord>;
export declare const updateUser: (id: string, fields: Partial<Pick<UserRecord, "name" | "google_sub" | "role" | "status" | "last_login_at">>) => Promise<void>;
export declare const audit: (studioId: string, actorId: string, action: string, entityType: string, entityId: string, detail?: unknown) => Promise<void>;
//# sourceMappingURL=db.d.ts.map