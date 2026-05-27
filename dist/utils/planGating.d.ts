interface PlanLimits {
    maxConnectedAccounts: number | null;
    maxScheduledPostsPerMonth: number | null;
    canUseAI: boolean;
    canUseAnalytics: boolean;
    maxTeamMembers: number | null;
}
export declare const getStudioPlan: (studioId: string) => Promise<string>;
export declare const getLimits: (planName: string) => PlanLimits;
export declare const checkAccountLimit: (studioId: string) => Promise<{
    allowed: boolean;
    current: number;
    max: number | null;
    plan: string;
}>;
export declare const checkPostQuota: (studioId: string) => Promise<{
    allowed: boolean;
    current: number;
    max: number | null;
    plan: string;
}>;
export {};
//# sourceMappingURL=planGating.d.ts.map