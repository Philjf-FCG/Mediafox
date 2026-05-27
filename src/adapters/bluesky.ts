import { BskyAgent, RichText } from '@atproto/api';
import { AccountRecord, updateAccountTokens, updateAccountStatus } from '../utils/db';
import { decryptToken, encryptToken } from '../utils/crypto';
import { consumeRateLimit, checkRateLimit } from '../utils/rateLimit';

export interface BlueskyExtra {
  did: string;
  pds?: string;
}

export const createBlueskySession = async (handle: string, appPassword: string): Promise<{ did: string; accessJwt: string; refreshJwt: string; handle: string }> => {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  const res = await agent.login({ identifier: handle, password: appPassword });
  return {
    did: res.data.did,
    accessJwt: res.data.accessJwt,
    refreshJwt: res.data.refreshJwt,
    handle: res.data.handle,
  };
};

const getAgent = async (account: AccountRecord): Promise<BskyAgent> => {
  const extra = JSON.parse(account.extra) as BlueskyExtra;
  const agent = new BskyAgent({ service: extra.pds ?? 'https://bsky.social' });
  const accessJwt = decryptToken(account.access_token);
  const refreshJwt = account.refresh_token ? decryptToken(account.refresh_token) : undefined;
  // @atproto/api marks session as readonly — bypass to avoid a network roundtrip;
  // refreshIfNeeded validates and refreshes on the next call if the token has expired.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (agent as any).session = {
    did: extra.did,
    handle: account.display_name,
    email: undefined,
    accessJwt,
    refreshJwt: refreshJwt ?? '',
    active: true,
  };
  return agent;
};

const refreshIfNeeded = async (agent: BskyAgent, account: AccountRecord): Promise<void> => {
  try {
    await agent.resumeSession(agent.session!);
  } catch {
    if (!account.refresh_token) throw new Error('Bluesky session expired and no refresh token');
    const refreshJwt = decryptToken(account.refresh_token);
    const res = await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshJwt}` },
    });
    if (!res.ok) throw new Error('Bluesky token refresh failed');
    const data = await res.json() as { accessJwt: string; refreshJwt: string };
    updateAccountTokens(account.id, encryptToken(data.accessJwt), encryptToken(data.refreshJwt), null);
    agent.session!.accessJwt = data.accessJwt;
    agent.session!.refreshJwt = data.refreshJwt;
  }
};

export interface PublishResult {
  platformPostId: string;
}

export const publishToBluesky = async (
  account: AccountRecord,
  body: string,
  mediaIds: string[],
  mediaStoragePath: string,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'bluesky');
  if (!rl.allowed) throw new Error(`Bluesky rate limit reached. Resets at ${rl.resetsAt}`);

  const agent = await getAgent(account);
  await refreshIfNeeded(agent, account);

  const rt = new RichText({ text: body });
  await rt.detectFacets(agent);

  const images: { image: unknown; alt: string }[] = [];

  if (mediaIds.length > 0) {
    const fs = await import('fs/promises');
    const path = await import('path');

    for (const mediaId of mediaIds.slice(0, 4)) {
      try {
        const filePath = path.join(mediaStoragePath, mediaId);
        const data = await fs.readFile(filePath);
        const uploadRes = await agent.uploadBlob(new Uint8Array(data), { encoding: 'image/jpeg' });
        consumeRateLimit(account.id, 'bluesky');
        images.push({ image: uploadRes.data.blob, alt: '' });
      } catch {
        // skip failed image upload
      }
    }
  }

  const post: Record<string, unknown> = { text: rt.text, facets: rt.facets, createdAt: new Date().toISOString() };

  if (images.length === 1) {
    post.embed = { $type: 'app.bsky.embed.images', images };
  } else if (images.length > 1) {
    post.embed = { $type: 'app.bsky.embed.images', images };
  }

  const res = await agent.post(post);
  consumeRateLimit(account.id, 'bluesky');
  updateAccountStatus(account.id, 'active');

  return { platformPostId: res.uri };
};

export const getBlueskyNotifications = async (account: AccountRecord, cursor?: string): Promise<{ items: unknown[]; cursor?: string }> => {
  const agent = await getAgent(account);
  await refreshIfNeeded(agent, account);

  const res = await agent.listNotifications({ limit: 50, cursor });
  consumeRateLimit(account.id, 'bluesky');

  return {
    items: res.data.notifications,
    cursor: res.data.cursor,
  };
};
