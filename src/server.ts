import 'dotenv/config';
import { createApp } from './app';
import { getDb } from './utils/db';
import { startWorker } from './scheduler/worker';

const PORT = Number(process.env.PORT ?? 5004);

const app = createApp();

// Warm up database connection and run migrations
getDb();

// Start scheduler
startWorker();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[mediafox] listening on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 9000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
