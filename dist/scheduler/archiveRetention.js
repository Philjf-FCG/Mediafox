"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeArchivedContent = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../utils/db");
const STORAGE_PATH = process.env.MEDIA_STORAGE_PATH ?? path_1.default.join(process.cwd(), 'media');
const getRetentionDays = () => {
    const raw = Number(process.env.ARCHIVE_RETENTION_DAYS ?? '90');
    if (!Number.isFinite(raw) || raw <= 0)
        return 90;
    return Math.floor(raw);
};
const daysAgoIso = (days) => {
    const ms = days * 24 * 60 * 60 * 1000;
    return new Date(Date.now() - ms).toISOString();
};
const purgeArchivedContent = async () => {
    const retentionDays = getRetentionDays();
    const cutoff = daysAgoIso(retentionDays);
    const result = (0, db_1.purgeArchivedContentOlderThan)(cutoff);
    // DB rows are removed first. Best-effort file cleanup follows.
    for (const storagePath of result.mediaStoragePaths) {
        const safeName = path_1.default.basename(storagePath);
        const fullPath = path_1.default.join(STORAGE_PATH, safeName);
        try {
            await promises_1.default.unlink(fullPath);
        }
        catch {
            // Ignore missing files or transient FS issues.
        }
    }
    const total = result.postsDeleted + result.inboxDeleted + result.mediaDeleted;
    if (total > 0) {
        console.log(`[scheduler] archive purge removed posts=${result.postsDeleted}, inbox=${result.inboxDeleted}, media=${result.mediaDeleted} (retention=${retentionDays}d)`);
    }
};
exports.purgeArchivedContent = purgeArchivedContent;
//# sourceMappingURL=archiveRetention.js.map