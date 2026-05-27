export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'bluesky' | 'discord' | 'slack';
export interface RateLimitStatus {
    allowed: boolean;
    used: number;
    limit: number;
    remaining: number;
    resetsAt: string;
}
export declare const checkRateLimit: (accountId: string, platform: Platform) => RateLimitStatus;
export declare const consumeRateLimit: (accountId: string, platform: Platform, count?: number) => void;
//# sourceMappingURL=rateLimit.d.ts.map