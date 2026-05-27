import { AccountRecord } from '../utils/db';
export interface PublishResult {
    platformPostId: string;
}
export declare const publishToLinkedIn: (account: AccountRecord, text: string) => Promise<PublishResult>;
export declare const publishImageToLinkedIn: (account: AccountRecord, text: string, imageBuffer: Buffer, filename: string) => Promise<PublishResult>;
export declare const getLinkedInProfile: (accessToken: string) => Promise<{
    id: string;
    localizedFirstName: string;
    localizedLastName: string;
}>;
//# sourceMappingURL=linkedin.d.ts.map