import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import { createApp } from './app';
import { initSchema } from './utils/db';
import { startWorker } from './scheduler/worker';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 5004);
const HOST = '0.0.0.0';

const app = createApp();

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err?.message });
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initSchema();
  startWorker();
  const server = app.listen(PORT, HOST, () => {
    logger.info('MediaFox started', { port: PORT, nodeEnv: process.env.NODE_ENV ?? 'development' });
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 9000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch(err => {
  logger.error('Startup failed', { error: err?.message });
  process.exit(1);
});
