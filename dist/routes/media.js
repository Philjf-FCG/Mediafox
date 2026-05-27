"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const db_1 = require("../utils/db");
const STORAGE_PATH = () => process.env.MEDIA_STORAGE_PATH ?? path_1.default.join(process.cwd(), 'media');
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        const dir = STORAGE_PATH();
        fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, _file, cb) => cb(null, (0, uuid_1.v4)()),
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
    },
});
const router = (0, express_1.Router)();
router.get('/', (req, res) => {
    const { q } = req.query;
    const assets = (0, db_1.getMediaAssets)(req.studioId, q).map(a => ({
        ...a, tags: JSON.parse(a.tags),
        url: `/api/media/${a.id}/file`,
    }));
    res.json({ assets });
});
router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    let width = null;
    let height = null;
    if (req.file.mimetype.startsWith('image/')) {
        try {
            const sharp = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
            const meta = await sharp(req.file.path).metadata();
            width = meta.width ?? null;
            height = meta.height ?? null;
        }
        catch { /* sharp optional */ }
    }
    const tags = req.body?.tags ? JSON.parse(req.body.tags) : [];
    const asset = (0, db_1.createMediaAsset)({
        id: (0, uuid_1.v4)(),
        studio_id: req.studioId,
        uploaded_by: req.mediafoxUser.userId,
        filename: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        storage_path: req.file.filename,
        width,
        height,
        duration_s: null,
        tags: JSON.stringify(tags),
    });
    res.status(201).json({ asset: { ...asset, tags, url: `/api/media/${asset.id}/file` } });
});
router.get('/:id/file', (req, res) => {
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=?').get(req.params.id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const filePath = path_1.default.join(STORAGE_PATH(), asset.storage_path);
    if (!fs_1.default.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
    }
    res.setHeader('Content-Type', asset.mime_type);
    res.sendFile(filePath);
});
router.put('/:id/tags', (req, res) => {
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
        res.status(400).json({ error: 'tags must be an array' });
        return;
    }
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=?').get(req.params.id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    (0, db_1.getDb)().prepare('UPDATE media_assets SET tags=? WHERE id=?').run(JSON.stringify(tags), req.params.id);
    res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=?').get(req.params.id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const filePath = path_1.default.join(STORAGE_PATH(), asset.storage_path);
    try {
        fs_1.default.unlinkSync(filePath);
    }
    catch { /* ok if already gone */ }
    (0, db_1.deleteMediaAsset)(req.params.id);
    res.json({ ok: true });
});
// ─── Link preview (OG metadata) ───────────────────────────────────────────────
router.get('/link-preview', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
    }
    try {
        const html = await axios_1.default.get(url, {
            timeout: 8000,
            maxContentLength: 500_000,
            headers: { 'User-Agent': 'MediaFox/1.0 (link-preview)' },
        }).then(r => r.data);
        const getMeta = (name) => {
            const match = html.match(new RegExp(`<meta[^>]+(property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
                || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(property|name)=["']${name}["']`, 'i'));
            return match ? (match[2] ?? match[1] ?? null) : null;
        };
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        res.json({
            url,
            title: getMeta('og:title') ?? titleMatch?.[1]?.trim() ?? null,
            description: getMeta('og:description') ?? getMeta('description') ?? null,
            image: getMeta('og:image') ?? null,
            site_name: getMeta('og:site_name') ?? null,
        });
    }
    catch {
        res.json({ url, title: null, description: null, image: null, site_name: null });
    }
});
exports.default = router;
//# sourceMappingURL=media.js.map