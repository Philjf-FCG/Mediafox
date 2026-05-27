"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPostQuota = exports.checkAccountLimit = exports.getLimits = exports.getStudioPlan = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const MEDIAFOX_LIMITS = {
    free: {
        maxConnectedAccounts: 2,
        maxScheduledPostsPerMonth: 10,
        canUseAI: false,
        canUseAnalytics: false,
        maxTeamMembers: 1,
    },
    pro: {
        maxConnectedAccounts: 10,
        maxScheduledPostsPerMonth: 100,
        canUseAI: true,
        canUseAnalytics: true,
        maxTeamMembers: 10,
    },
    studio: {
        maxConnectedAccounts: 30,
        maxScheduledPostsPerMonth: 500,
        canUseAI: true,
        canUseAnalytics: true,
        maxTeamMembers: 50,
    },
    enterprise: {
        maxConnectedAccounts: null,
        maxScheduledPostsPerMonth: null,
        canUseAI: true,
        canUseAnalytics: true,
        maxTeamMembers: null,
    },
};
const DEFAULT_LIMITS = MEDIAFOX_LIMITS.pro;
const getBudgetFoxUrl = () => {
    const configPath = path_1.default.join(process.cwd(), 'fox-suite.config.json');
    if (!fs_1.default.existsSync(configPath))
        return null;
    try {
        const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
        return config.budgetfox ?? null;
    }
    catch {
        return null;
    }
};
const planCache = new Map();
const getStudioPlan = async (studioId) => {
    const now = Date.now();
    const cached = planCache.get(studioId);
    if (cached && cached.expiresAt > now)
        return cached.plan;
    const budgetfoxUrl = getBudgetFoxUrl();
    if (!budgetfoxUrl)
        return 'pro'; // default if BudgetFox not configured
    try {
        const res = await axios_1.default.get(`${budgetfoxUrl}/api/billing/subscription/${studioId}`, {
            timeout: 5000,
        });
        const plan = res.data.plan ?? 'pro';
        planCache.set(studioId, { plan, expiresAt: now + 5 * 60 * 1000 }); // 5-min cache
        return plan;
    }
    catch {
        return planCache.get(studioId)?.plan ?? 'pro';
    }
};
exports.getStudioPlan = getStudioPlan;
const getLimits = (planName) => MEDIAFOX_LIMITS[planName] ?? DEFAULT_LIMITS;
exports.getLimits = getLimits;
const checkAccountLimit = async (studioId) => {
    const plan = await (0, exports.getStudioPlan)(studioId);
    const limits = (0, exports.getLimits)(plan);
    const current = (0, db_1.getAccountsByStudio)(studioId).length;
    const allowed = limits.maxConnectedAccounts === null || current < limits.maxConnectedAccounts;
    return { allowed, current, max: limits.maxConnectedAccounts, plan };
};
exports.checkAccountLimit = checkAccountLimit;
const checkPostQuota = async (studioId) => {
    const plan = await (0, exports.getStudioPlan)(studioId);
    const limits = (0, exports.getLimits)(plan);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const current = (0, db_1.getDb)()
        .prepare(`SELECT COUNT(*) as n FROM posts WHERE studio_id=? AND status='scheduled' AND created_at >= ?`)
        .get(studioId, monthStart.toISOString()).n;
    const allowed = limits.maxScheduledPostsPerMonth === null || current < limits.maxScheduledPostsPerMonth;
    return { allowed, current, max: limits.maxScheduledPostsPerMonth, plan };
};
exports.checkPostQuota = checkPostQuota;
//# sourceMappingURL=planGating.js.map