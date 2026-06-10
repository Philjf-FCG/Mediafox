"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const db_1 = require("./utils/db");
const worker_1 = require("./scheduler/worker");
const logger_1 = require("./utils/logger");
const PORT = Number(process.env.PORT ?? 5004);
const HOST = '0.0.0.0';
const app = (0, app_1.createApp)();
app.use((err, _req, res, _next) => {
    logger_1.logger.error('Unhandled error', { error: err?.message });
    if (!res.headersSent)
        res.status(500).json({ error: 'Internal server error' });
});
async function start() {
    await (0, db_1.initSchema)();
    (0, worker_1.startWorker)();
    const server = app.listen(PORT, HOST, () => {
        logger_1.logger.info('MediaFox started', { port: PORT, nodeEnv: process.env.NODE_ENV ?? 'development' });
    });
    const shutdown = () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 9000).unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
start().catch(err => {
    logger_1.logger.error('Startup failed', { error: err?.message });
    process.exit(1);
});
//# sourceMappingURL=server.js.map