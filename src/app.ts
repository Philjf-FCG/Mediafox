import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { requireAuth, requireCsrfProtection } from './utils/auth';
import { attachStudio, attachStudioOptional } from './middleware/studio';
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import postRoutes from './routes/posts';
import inboxRoutes from './routes/inbox';
import analyticsRoutes from './routes/analytics';
import mediaRoutes from './routes/media';
import teamRoutes from './routes/team';
import notificationRoutes from './routes/notifications';
import aiRoutes from './routes/ai';

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/+$/, '');

const loadAllowedOrigins = (): string[] => {
  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  const configPath = path.join(process.cwd(), 'fox-suite.config.json');
  if (!fs.existsSync(configPath)) return Array.from(new Set(envOrigins));

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, string>;
    const configOrigins = Object.values(config).filter(Boolean).map(normalizeOrigin);
    return Array.from(new Set([...envOrigins, ...configOrigins]));
  } catch {
    return Array.from(new Set(envOrigins));
  }
};

export const createApp = (): express.Application => {
  const app = express();
  const allowedOrigins = loadAllowedOrigins();
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalizedOrigin)) return cb(null, true);
      if (!isProd && allowedOrigins.length === 0) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} blocked`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use('/api', requireCsrfProtection);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mediafox' }));

  app.use('/api/auth', authRoutes);

  app.get('/api/plan', requireAuth, async (req, res) => {
    const studioId = (req.headers['x-studio-id'] as string) || (req.query.studio_id as string);
    if (!studioId) { res.status(400).json({ error: 'x-studio-id required' }); return; }
    const { getStudioPlan, getLimits, checkAccountLimit, checkPostQuota, PLAN_NAMES } = await import('./utils/planGating');
    const plan = await getStudioPlan(studioId);
    const limits = getLimits(plan);
    const accounts = await checkAccountLimit(studioId);
    const posts = await checkPostQuota(studioId);
    res.json({ plan, limits, available_plans: PLAN_NAMES, usage: { accounts: accounts.current, posts_this_month: posts.current } });
  });

  // Admin: set plan for a studio locally (bypasses BudgetFox)
  app.put('/api/plan', requireAuth, async (req, res) => {
    const studioId = (req.headers['x-studio-id'] as string) || (req.body?.studio_id as string);
    const { plan } = req.body as { plan?: string };
    if (!studioId || !plan) { res.status(400).json({ error: 'studio_id and plan are required' }); return; }
    if (req.mediafoxUser?.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return; }
    const { PLAN_NAMES } = await import('./utils/planGating');
    if (!PLAN_NAMES.includes(plan)) { res.status(400).json({ error: `plan must be one of: ${PLAN_NAMES.join(', ')}` }); return; }
    const { setLocalStudioPlan } = await import('./utils/db');
    setLocalStudioPlan(studioId, plan, req.mediafoxUser.userId);
    res.json({ ok: true, studio_id: studioId, plan });
  });

  // Accounts router registered before the main authed router so OAuth callbacks
  // (which arrive from external providers without x-studio-id) bypass attachStudio.
  // Routes that need req.studioId still get it when the client sends x-studio-id.
  app.use('/api/accounts', requireAuth, attachStudioOptional, accountRoutes);

  const authed = express.Router();
  authed.use(requireAuth);
  authed.use(attachStudio);
  authed.use('/posts', postRoutes);
  authed.use('/inbox', inboxRoutes);
  authed.use('/analytics', analyticsRoutes);
  authed.use('/media', mediaRoutes);
  authed.use('/team', teamRoutes);
  authed.use('/notifications', notificationRoutes);
  authed.use('/ai', aiRoutes);

  app.use('/api', authed);

  // Serve React client in production
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  if (fs.existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    app.get('*', (_req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
  }

  return app;
};
