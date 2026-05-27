"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const queue_1 = require("./queue");
const tokenRefresh_1 = require("./tokenRefresh");
const inboxPollers_1 = require("./inboxPollers");
const analyticsSync_1 = require("./analyticsSync");
const archiveRetention_1 = require("./archiveRetention");
let running = false;
const startWorker = () => {
    // Post queue — every minute
    node_cron_1.default.schedule('* * * * *', async () => {
        if (running)
            return;
        running = true;
        try {
            await (0, queue_1.processDueItems)();
        }
        catch (err) {
            console.error('[scheduler] error during processDueItems:', err);
        }
        finally {
            running = false;
        }
    });
    // Token refresh — daily at 03:00
    node_cron_1.default.schedule('0 3 * * *', async () => {
        try {
            await (0, tokenRefresh_1.refreshExpiringTokens)();
        }
        catch (err) {
            console.error('[scheduler] error during refreshExpiringTokens:', err);
        }
    });
    // Inbox pollers — every 15 minutes
    node_cron_1.default.schedule('*/15 * * * *', async () => {
        try {
            await (0, inboxPollers_1.pollAllInboxes)();
        }
        catch (err) {
            console.error('[scheduler] error during pollAllInboxes:', err);
        }
    });
    // Analytics sync — every 6 hours
    node_cron_1.default.schedule('0 */6 * * *', async () => {
        try {
            await (0, analyticsSync_1.syncAnalytics)();
        }
        catch (err) {
            console.error('[scheduler] error during syncAnalytics:', err);
        }
    });
    // Archive retention purge — daily at 04:00
    node_cron_1.default.schedule('0 4 * * *', async () => {
        try {
            await (0, archiveRetention_1.purgeArchivedContent)();
        }
        catch (err) {
            console.error('[scheduler] error during purgeArchivedContent:', err);
        }
    });
    console.log('[scheduler] worker started — queue: 1min, inbox: 15min, analytics: 6hr, token refresh: daily 03:00, archive purge: daily 04:00');
};
exports.startWorker = startWorker;
//# sourceMappingURL=worker.js.map