import cron from 'node-cron';
import { processDueItems } from './queue';
import { refreshExpiringTokens } from './tokenRefresh';
import { pollAllInboxes } from './inboxPollers';
import { syncAnalytics } from './analyticsSync';

let running = false;

export const startWorker = (): void => {
  // Post queue — every minute
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await processDueItems();
    } catch (err) {
      console.error('[scheduler] error during processDueItems:', err);
    } finally {
      running = false;
    }
  });

  // Token refresh — daily at 03:00
  cron.schedule('0 3 * * *', async () => {
    try {
      await refreshExpiringTokens();
    } catch (err) {
      console.error('[scheduler] error during refreshExpiringTokens:', err);
    }
  });

  // Inbox pollers — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await pollAllInboxes();
    } catch (err) {
      console.error('[scheduler] error during pollAllInboxes:', err);
    }
  });

  // Analytics sync — every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      await syncAnalytics();
    } catch (err) {
      console.error('[scheduler] error during syncAnalytics:', err);
    }
  });

  console.log('[scheduler] worker started — queue: 1min, inbox: 15min, analytics: 6hr, token refresh: daily 03:00');
};
