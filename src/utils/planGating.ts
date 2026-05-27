import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getAccountsByStudio, getDb } from './db';

interface PlanLimits {
  maxConnectedAccounts: number | null;
  maxScheduledPostsPerMonth: number | null;
  canUseAI: boolean;
  canUseAnalytics: boolean;
  maxTeamMembers: number | null;
}

const MEDIAFOX_LIMITS: Record<string, PlanLimits> = {
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

const getBudgetFoxUrl = (): string | null => {
  const configPath = path.join(process.cwd(), 'fox-suite.config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, string>;
    return config.budgetfox ?? null;
  } catch { return null; }
};

const planCache = new Map<string, { plan: string; expiresAt: number }>();

export const getStudioPlan = async (studioId: string): Promise<string> => {
  const now = Date.now();
  const cached = planCache.get(studioId);
  if (cached && cached.expiresAt > now) return cached.plan;

  const budgetfoxUrl = getBudgetFoxUrl();
  if (!budgetfoxUrl) return 'pro'; // default if BudgetFox not configured

  try {
    const res = await axios.get<{ plan: string }>(`${budgetfoxUrl}/api/billing/subscription/${studioId}`, {
      timeout: 5000,
    });
    const plan = res.data.plan ?? 'pro';
    planCache.set(studioId, { plan, expiresAt: now + 5 * 60 * 1000 }); // 5-min cache
    return plan;
  } catch {
    return planCache.get(studioId)?.plan ?? 'pro';
  }
};

export const getLimits = (planName: string): PlanLimits =>
  MEDIAFOX_LIMITS[planName] ?? DEFAULT_LIMITS;

export const checkAccountLimit = async (studioId: string): Promise<{ allowed: boolean; current: number; max: number | null; plan: string }> => {
  const plan = await getStudioPlan(studioId);
  const limits = getLimits(plan);
  const current = getAccountsByStudio(studioId).length;
  const allowed = limits.maxConnectedAccounts === null || current < limits.maxConnectedAccounts;
  return { allowed, current, max: limits.maxConnectedAccounts, plan };
};

export const checkPostQuota = async (studioId: string): Promise<{ allowed: boolean; current: number; max: number | null; plan: string }> => {
  const plan = await getStudioPlan(studioId);
  const limits = getLimits(plan);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const current = (getDb()
    .prepare(`SELECT COUNT(*) as n FROM posts WHERE studio_id=? AND status='scheduled' AND created_at >= ?`)
    .get(studioId, monthStart.toISOString()) as { n: number }).n;

  const allowed = limits.maxScheduledPostsPerMonth === null || current < limits.maxScheduledPostsPerMonth;
  return { allowed, current, max: limits.maxScheduledPostsPerMonth, plan };
};
