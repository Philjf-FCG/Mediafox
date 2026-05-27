import { AccountRecord } from '../utils/db';
export interface PublishResult {
    platformPostId: string;
}
export declare const publishImageToInstagram: (account: AccountRecord, imageUrl: string, caption: string) => Promise<PublishResult>;
export declare const publishCarouselToInstagram: (account: AccountRecord, imageUrls: string[], caption: string) => Promise<PublishResult>;
export declare const getInstagramAccounts: (pageAccessToken: string, pageId: string) => Promise<{
    id: string;
    username: string;
}[]>;
//# sourceMappingURL=instagram.d.ts.map