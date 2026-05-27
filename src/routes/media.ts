import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { lookup } from 'dns/promises';
import net from 'net';
import { v4 as uuidv4 } from 'uuid';
import { createMediaAsset, getMediaAssets, archiveMediaAsset, restoreMediaAsset, getDb } from '../utils/db';

const STORAGE_PATH = () => process.env.MEDIA_STORAGE_PATH ?? path.join(process.cwd(), 'media');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = STORAGE_PATH();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => cb(null, uuidv4()),
});

const upload = multer({
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

const router = Router();

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const ipv4ToInt = (ip: string): number | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(p => Number(p));
  if (nums.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) >>> 0) + ((nums[1] << 16) >>> 0) + ((nums[2] << 8) >>> 0) + nums[3];
};

const inIpv4Cidr = (ip: string, cidrBase: string, maskBits: number): boolean => {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(cidrBase);
  if (ipInt == null || baseInt == null) return false;
  const mask = maskBits === 0 ? 0 : ((0xffffffff << (32 - maskBits)) >>> 0);
  return (ipInt & mask) === (baseInt & mask);
};

const isPrivateIpv4 = (ip: string): boolean => {
  const ranges: Array<[string, number]> = [
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

const isBlockedIpAddress = (ip: string): boolean => {
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip);

  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true; // Link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);
  return false;
};

const ensureSafePreviewTarget = async (rawUrl: string): Promise<URL | null> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (!parsed.hostname) return null;
  if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) return null;
  if (parsed.hostname.toLowerCase().endsWith('.local')) return null;

  // If hostname is already an IP, validate directly.
  if (net.isIP(parsed.hostname) !== 0) {
    if (isBlockedIpAddress(parsed.hostname)) return null;
    return parsed;
  }

  try {
    const records = await lookup(parsed.hostname, { all: true });
    if (!records.length) return null;
    if (records.some(r => isBlockedIpAddress(r.address))) return null;
  } catch {
    return null;
  }

  return parsed;
};

router.get('/', (req: Request, res: Response) => {
  const { q, include_archived } = req.query as { q?: string; include_archived?: string };
  const includeArchived = include_archived === '1' || include_archived === 'true';
  const assets = getMediaAssets(req.studioId!, q, includeArchived).map(a => ({
    ...a, tags: JSON.parse(a.tags) as string[],
    url: `/api/media/${a.id}/file`,
  }));
  res.json({ assets });
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  let width: number | null = null;
  let height: number | null = null;
  if (req.file.mimetype.startsWith('image/')) {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(req.file.path).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch { /* sharp optional */ }
  }

  const tags: string[] = req.body?.tags ? JSON.parse(req.body.tags as string) as string[] : [];
  const asset = createMediaAsset({
    id: uuidv4(),
    studio_id: req.studioId!,
    uploaded_by: req.mediafoxUser!.userId,
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

router.get('/:id/file', (req: Request, res: Response) => {
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(req.params.id, req.studioId!) as { storage_path: string; mime_type: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Not found' }); return; }
  const filePath = path.join(STORAGE_PATH(), asset.storage_path);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }
  res.setHeader('Content-Type', asset.mime_type);
  res.sendFile(filePath);
});

router.put('/:id/tags', (req: Request, res: Response) => {
  const { tags } = req.body as { tags?: string[] };
  if (!Array.isArray(tags)) { res.status(400).json({ error: 'tags must be an array' }); return; }
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(req.params.id, req.studioId!) as { id: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Not found' }); return; }
  getDb().prepare('UPDATE media_assets SET tags=? WHERE id=?').run(JSON.stringify(tags), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req: Request, res: Response) => {
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL').get(req.params.id, req.studioId!) as { id: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Not found' }); return; }
  archiveMediaAsset(req.params.id, req.mediafoxUser!.userId);
  res.json({ ok: true, archived: true });
});

router.post('/:id/restore', (req: Request, res: Response) => {
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NOT NULL').get(req.params.id, req.studioId!) as { id: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Archived asset not found' }); return; }
  restoreMediaAsset(req.params.id);
  res.json({ ok: true });
});

// ─── Link preview (OG metadata) ───────────────────────────────────────────────

router.get('/link-preview', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  const safeUrl = await ensureSafePreviewTarget(url);
  if (!safeUrl) {
    res.status(400).json({ error: 'URL is invalid or not allowed for link preview' });
    return;
  }

  try {
    const html = await axios.get<string>(safeUrl.toString(), {
      timeout: 8000,
      maxContentLength: 500_000,
      maxBodyLength: 500_000,
      maxRedirects: 0,
      responseType: 'text',
      headers: { 'User-Agent': 'MediaFox/1.0 (link-preview)' },
    }).then(r => r.data);

    const getMeta = (name: string): string | null => {
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
  } catch {
    res.json({ url: safeUrl.toString(), title: null, description: null, image: null, site_name: null });
  }
});

export default router;
