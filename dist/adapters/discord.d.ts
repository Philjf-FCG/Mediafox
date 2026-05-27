import { AccountRecord } from '../utils/db';
export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    image?: {
        url: string;
    };
    footer?: {
        text: string;
    };
    timestamp?: string;
}
export interface PublishResult {
    platformPostId: string;
}
export declare const publishToDiscordWebhook: (account: AccountRecord, content: string, embeds?: DiscordEmbed[]) => Promise<PublishResult>;
export declare const publishToDiscordBot: (account: AccountRecord, channelId: string, content: string, embeds?: DiscordEmbed[]) => Promise<PublishResult>;
export declare const replyToDiscordMessage: (account: AccountRecord, channelId: string, messageId: string, content: string) => Promise<void>;
//# sourceMappingURL=discord.d.ts.map