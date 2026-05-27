import { AccountRecord } from '../utils/db';
export interface PublishResult {
    platformPostId: string;
}
export declare const publishToSlack: (account: AccountRecord, text: string, blocks?: unknown[], scheduledAt?: Date) => Promise<PublishResult>;
export declare const replyToSlackMessage: (account: AccountRecord, threadTs: string, text: string) => Promise<void>;
export declare const fetchSlackChannels: (botToken: string) => Promise<{
    id: string;
    name: string;
}[]>;
//# sourceMappingURL=slack.d.ts.map