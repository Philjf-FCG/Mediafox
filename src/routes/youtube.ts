import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { listYouTubeChannels, uploadYouTubeVideo } from '../adapters/youtube';
import { getDb } from '../utils/db';

const router = Router();
const STORAGE_PATH = () => process.env.MEDIA_STORAGE_PATH ?? path.join(process.cwd(), 'media');

const readAccessToken = (req: Request): string => String(req.body?.access_token || '').trim();

router.post('/channels', async (req: Request, res: Response) => {
  const accessToken = readAccessToken(req);
  if (!accessToken) { res.status(400).json({ error: 'access_token is required' }); return; }

  try {
    const channels = await listYouTubeChannels(accessToken);
    res.json({ channels });
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: unknown } })?.response?.data;
    res.status(502).json({ error: 'Failed to list YouTube channels', detail: detail ?? String(err) });
  }
});

router.post('/publish', async (req: Request, res: Response) => {
  const accessToken = readAccessToken(req);
  const { media_asset_id, title, description, visibility, is_short } = req.body as {
    media_asset_id?: string;
    title?: string;
    description?: string;
    visibility?: 'private' | 'unlisted' | 'public';
    is_short?: boolean;
  };

  if (!accessToken) { res.status(400).json({ error: 'access_token is required' }); return; }
  if (!media_asset_id || !title) { res.status(400).json({ error: 'media_asset_id and title are required' }); return; }

  const privacy = visibility || 'private';
  if (!['private', 'unlisted', 'public'].includes(privacy)) {
    res.status(400).json({ error: 'visibility must be private, unlisted, or public' });
    return;
  }

  const asset = getDb().prepare(
    'SELECT id, storage_path, mime_type, filename FROM media_assets WHERE id=? AND studio_id=? AND archived_at IS NULL',
  ).get(media_asset_id, req.studioId!) as { id: string; storage_path: string; mime_type: string; filename: string } | undefined;

  if (!asset) { res.status(404).json({ error: 'Media asset not found' }); return; }
  if (!asset.mime_type.startsWith('video/')) {
    res.status(400).json({ error: 'YouTube publishing requires a video asset' });
    return;
  }

  const fullPath = path.join(STORAGE_PATH(), asset.storage_path);
  if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'Media file is missing from storage' }); return; }

  try {
    const bytes = fs.readFileSync(fullPath);
    const out = await uploadYouTubeVideo(accessToken, bytes, asset.mime_type, {
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
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: unknown } })?.response?.data;
    res.status(502).json({ error: 'YouTube publish failed', detail: detail ?? String(err) });
  }
});

export default router;
