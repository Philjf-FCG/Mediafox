import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createMediaAsset, getMediaAssets, deleteMediaAsset, getDb } from '../utils/db';

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
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };
  const assets = getMediaAssets(req.studioId!, q).map(a => ({
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
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=?').get(req.params.id, req.studioId!) as { storage_path: string; mime_type: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Not found' }); return; }
  const filePath = path.join(STORAGE_PATH(), asset.storage_path);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }
  res.setHeader('Content-Type', asset.mime_type);
  res.sendFile(filePath);
});

router.put('/:id/tags', (req: Request, res: Response) => {
  const { tags } = req.body as { tags?: string[] };
  if (!Array.isArray(tags)) { res.status(400).json({ error: 'tags must be an array' }); return; }
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=?').get(req.params.id, req.studioId!) as { id: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Not found' }); return; }
  getDb().prepare('UPDATE media_assets SET tags=? WHERE id=?').run(JSON.stringify(tags), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req: Request, res: Response) => {
  const asset = getDb().prepare('SELECT * FROM media_assets WHERE id=? AND studio_id=?').get(req.params.id, req.studioId!) as { storage_path: string } | undefined;
  if (!asset) { res.status(404).json({ error: 'Not found' }); return; }
  const filePath = path.join(STORAGE_PATH(), asset.storage_path);
  try { fs.unlinkSync(filePath); } catch { /* ok if already gone */ }
  deleteMediaAsset(req.params.id);
  res.json({ ok: true });
});

// ─── Link preview (OG metadata) ───────────────────────────────────────────────

router.get('/link-preview', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string };
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  try {
    const html = await axios.get<string>(url, {
      timeout: 8000,
      maxContentLength: 500_000,
      headers: { 'User-Agent': 'MediaFox/1.0 (link-preview)' },
    }).then(r => r.data);

    const getMeta = (name: string): string | null => {
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
  } catch {
    res.json({ url, title: null, description: null, image: null, site_name: null });
  }
});

export default router;
