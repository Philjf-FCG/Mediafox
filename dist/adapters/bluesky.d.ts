import { AccountRecord } from '../utils/db';
export interface BlueskyExtra {
    did: string;
    pds?: string;
}
export declare const createBlueskySession: (handle: string, appPassword: string) => Promise<{
    did: string;
    accessJwt: string;
    refreshJwt: string;
    handle: string;
}>;
export interface PublishResult {
    platformPostId: string;
}
export declare const publishToBluesky: (account: AccountRecord, body: string, mediaIds: string[], mediaStoragePath: string) => Promise<PublishResult>;
export declare const getBlueskyNotifications: (account: AccountRecord, cursor?: string) => Promise<{
    items: unknown[];
    cursor?: string;
}>;
//# sourceMappingURL=bluesky.d.ts.map