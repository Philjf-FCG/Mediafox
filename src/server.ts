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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[mediafox] listening on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});
