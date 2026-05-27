"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const db_1 = require("./utils/db");
const worker_1 = require("./scheduler/worker");
const PORT = Number(process.env.PORT ?? 5004);
const app = (0, app_1.createApp)();
// Warm up database connection and run migrations
(0, db_1.getDb)();
// Start scheduler
(0, worker_1.startWorker)();
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[mediafox] listening on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});
//# sourceMappingURL=server.js.map