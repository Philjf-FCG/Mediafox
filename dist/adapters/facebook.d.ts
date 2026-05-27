import { AccountRecord } from '../utils/db';
export interface PublishResult {
    platformPostId: string;
}
export declare const publishToFacebook: (account: AccountRecord, message: string, link?: string, scheduledPublishTime?: number) => Promise<PublishResult>;
export declare const publishPhotoToFacebook: (account: AccountRecord, message: string, imageUrl: string) => Promise<PublishResult>;
export declare const getFacebookPageInsights: (account: AccountRecord, since: string, until: string) => Promise<unknown>;
export declare const getFacebookPages: (userToken: string) => Promise<{
    id: string;
    name: string;
    access_token: string;
}[]>;
//# sourceMappingURL=facebook.d.ts.map