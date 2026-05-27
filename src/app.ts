import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { requireAuth } from './utils/auth';
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

const loadAllowedOrigins = (): string[] => {
  const configPath = path.join(process.cwd(), 'fox-suite.config.json');
  if (!fs.existsSync(configPath)) return [];
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, string>;
    return Object.values(config).filter(Boolean);
  } catch { return []; }
};

export const createApp = (): express.Application => {
  const app = express();
  const allowedOrigins = loadAllowedOrigins();

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} blocked`));
    },
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mediafox' }));

  app.use('/api/auth', authRoutes);

  app.get('/api/plan', requireAuth, async (req, res) => {
    const studioId = (req.headers['x-studio-id'] as string) || (req.query.studio_id as string);
    if (!studioId) { res.status(400).json({ error: 'x-studio-id required' }); return; }
    const { getStudioPlan, getLimits, checkAccountLimit, checkPostQuota } = await import('./utils/planGating');
    const plan = await getStudioPlan(studioId);
    const limits = getLimits(plan);
    const accounts = await checkAccountLimit(studioId);
    const posts = await checkPostQuota(studioId);
    res.json({ plan, limits, usage: { accounts: accounts.current, posts_this_month: posts.current } });
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
