"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const youtube_1 = require("../adapters/youtube");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
const STORAGE_PATH = () => process.env.MEDIA_STORAGE_PATH ?? path_1.default.join(process.cwd(), 'media');
const readAccessToken = (req) => String(req.body?.access_token || '').trim();
router.post('/channels', async (req, res) => {
    const accessToken = readAccessToken(req);
    if (!accessToken) {
        res.status(400).json({ error: 'access_token is required' });
        return;
    }
    try {
        const channels = await (0, youtube_1.listYouTubeChannels)(accessToken);
        res.json({ channels });
    }
    catch (err) {
        const detail = err?.response?.data;
        res.status(502).json({ error: 'Failed to list YouTube channels', detail: detail ?? String(err) });
    }
});
router.post('/publish', async (req, res) => {
    const accessToken = readAccessToken(req);
    const { media_asset_id, title, description, visibility, is_short } = req.body;
    if (!accessToken) {
        res.status(400).json({ error: 'access_token is required' });
        return;
    }
    if (!media_asset_id || !title) {
        res.status(400).json({ error: 'media_asset_id and title are required' });
        return;
    }
    const privacy = visibility || 'private';
    if (!['private', 'unlisted', 'public'].includes(privacy)) {
        res.status(400).json({ error: 'visibility must be private, unlisted, or public' });
        return;
    }
    const asset = (0, db_1.getDb)().prepare('SELECT id, storage_path, mime_type, filename FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(media_asset_id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Media asset not found' });
        return;
    }
    if (!asset.mime_type.startsWith('video/')) {
        res.status(400).json({ error: 'YouTube publishing requires a video asset' });
        return;
    }
    const fullPath = path_1.default.join(STORAGE_PATH(), asset.storage_path);
    if (!fs_1.default.existsSync(fullPath)) {
        res.status(404).json({ error: 'Media file is missing from storage' });
        return;
    }
    try {
        const bytes = fs_1.default.readFileSync(fullPath);
        const out = await (0, youtube_1.uploadYouTubeVideo)(accessToken, bytes, asset.mime_type, {
            title,
            description,
            visibility: privacy,
            isShort: Boolean(is_short),
        });
        res.json({
            ok: true,
            video_id: out.videoId,
            video_url: out.videoUrl,
            asset_id: asset.id,
        });
    }
    catch (err) {
        const detail = err?.response?.data;
        res.status(502).json({ error: 'YouTube publish failed', detail: detail ?? String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=youtube.js.map