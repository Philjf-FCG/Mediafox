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
const promises_1 = require("dns/promises");
const net_1 = __importDefault(require("net"));
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
        const allowed = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/heic',
            'image/heif',
            'video/mp4',
            'video/quicktime',
            'application/pdf',
        ];
        cb(null, allowed.includes(file.mimetype));
    },
});
const router = (0, express_1.Router)();
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const ipv4ToInt = (ip) => {
    const parts = ip.split('.');
    if (parts.length !== 4)
        return null;
    const nums = parts.map(p => Number(p));
    if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 255))
        return null;
    return ((nums[0] << 24) >>> 0) + ((nums[1] << 16) >>> 0) + ((nums[2] << 8) >>> 0) + nums[3];
};
const inIpv4Cidr = (ip, cidrBase, maskBits) => {
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(cidrBase);
    if (ipInt == null || baseInt == null)
        return false;
    const mask = maskBits === 0 ? 0 : ((0xffffffff << (32 - maskBits)) >>> 0);
    return (ipInt & mask) === (baseInt & mask);
};
const isPrivateIpv4 = (ip) => {
    const ranges = [
        ['10.0.0.0', 8],
        ['127.0.0.0', 8],
        ['169.254.0.0', 16],
        ['172.16.0.0', 12],
        ['192.168.0.0', 16],
        ['100.64.0.0', 10],
        ['0.0.0.0', 8],
    ];
    return ranges.some(([base, bits]) => inIpv4Cidr(ip, base, bits));
};
const isBlockedIpAddress = (ip) => {
    if (net_1.default.isIP(ip) === 4)
        return isPrivateIpv4(ip);
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::')
        return true;
    if (normalized.startsWith('fe80:'))
        return true; // Link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd'))
        return true; // Unique local
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1])
        return isPrivateIpv4(mapped[1]);
    return false;
};
const ensureSafePreviewTarget = async (rawUrl) => {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    }
    catch {
        return null;
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
        return null;
    if (!parsed.hostname)
        return null;
    if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase()))
        return null;
    if (parsed.hostname.toLowerCase().endsWith('.local'))
        return null;
    // If hostname is already an IP, validate directly.
    if (net_1.default.isIP(parsed.hostname) !== 0) {
        if (isBlockedIpAddress(parsed.hostname))
            return null;
        return parsed;
    }
    try {
        const records = await (0, promises_1.lookup)(parsed.hostname, { all: true });
        if (!records.length)
            return null;
        if (records.some(r => isBlockedIpAddress(r.address)))
            return null;
    }
    catch {
        return null;
    }
    return parsed;
};
router.get('/', (req, res) => {
    const { q, include_archived } = req.query;
    const includeArchived = include_archived === '1' || include_archived === 'true';
    const assets = (0, db_1.getMediaAssets)(req.studioId, q, includeArchived).map(a => ({
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
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(req.params.id, req.studioId);
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
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(req.params.id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    (0, db_1.getDb)().prepare('UPDATE media_assets SET tags=? WHERE id=?').run(JSON.stringify(tags), req.params.id);
    res.json({ ok: true });
});
router.delete('/:id', (req, res) => {
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(req.params.id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    (0, db_1.archiveMediaAsset)(req.params.id, req.mediafoxUser.userId);
    res.json({ ok: true, archived: true });
});
router.post('/:id/restore', (req, res) => {
    const asset = (0, db_1.getDb)().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NOT NULL').get(req.params.id, req.studioId);
    if (!asset) {
        res.status(404).json({ error: 'Archived asset not found' });
        return;
    }
    (0, db_1.restoreMediaAsset)(req.params.id);
    res.json({ ok: true });
});
// ─── Link preview (OG metadata) ───────────────────────────────────────────────
router.get('/link-preview', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        res.status(400).json({ error: 'url is required' });
        return;
    }
    const safeUrl = await ensureSafePreviewTarget(url);
    if (!safeUrl) {
        res.status(400).json({ error: 'URL is invalid or not allowed for link preview' });
        return;
    }
    try {
        const html = await axios_1.default.get(safeUrl.toString(), {
            timeout: 8000,
            maxContentLength: 500_000,
            maxBodyLength: 500_000,
            maxRedirects: 0,
            responseType: 'text',
            headers: { 'User-Agent': 'MediaFox/1.0 (link-preview)' },
        }).then(r => r.data);
        const getMeta = (name) => {
            const match = html.match(new RegExp(`<meta[^>]+(property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
                || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(property|name)=["']${name}["']`, 'i'));
            return match ? (match[2] ?? match[1] ?? null) : null;
        };
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        res.json({
            url: safeUrl.toString(),
            title: getMeta('og:title') ?? titleMatch?.[1]?.trim() ?? null,
            description: getMeta('og:description') ?? getMeta('description') ?? null,
            image: getMeta('og:image') ?? null,
            site_name: getMeta('og:site_name') ?? null,
        });
    }
    catch {
        res.json({ url: safeUrl.toString(), title: null, description: null, image: null, site_name: null });
    }
});
exports.default = router;
//# sourceMappingURL=media.js.map