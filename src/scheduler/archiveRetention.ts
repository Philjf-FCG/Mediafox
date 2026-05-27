import fs from 'fs/promises';
import path from 'path';
import { purgeArchivedContentOlderThan } from '../utils/db';

const STORAGE_PATH = process.env.MEDIA_STORAGE_PATH ?? path.join(process.cwd(), 'media');

const getRetentionDays = (): number => {
  const raw = Number(process.env.ARCHIVE_RETENTION_DAYS ?? '90');
  if (!Number.isFinite(raw) || raw <= 0) return 90;
  return Math.floor(raw);
};

const daysAgoIso = (days: number): string => {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
};

export const purgeArchivedContent = async (): Promise<void> => {
  const retentionDays = getRetentionDays();
  const cutoff = daysAgoIso(retentionDays);

  const result = purgeArchivedContentOlderThan(cutoff);

  // DB rows are removed first. Best-effort file cleanup follows.
  for (const storagePath of result.mediaStoragePaths) {
    const safeName = path.basename(storagePath);
    const fullPath = path.join(STORAGE_PATH, safeName);
    try {
      await fs.unlink(fullPath);
    } catch {
      // Ignore missing files or transient FS issues.
    }
  }

  const total = result.postsDeleted + result.inboxDeleted + result.mediaDeleted;
  if (total > 0) {
    console.log(
      `[scheduler] archive purge removed posts=${result.postsDeleted}, inbox=${result.inboxDeleted}, media=${result.mediaDeleted} (retention=${retentionDays}d)`,
    );
  }
};
