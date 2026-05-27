import axios from 'axios';
import { AccountRecord, updateAccountStatus } from '../utils/db';
import { decryptToken } from '../utils/crypto';
import { consumeRateLimit, checkRateLimit } from '../utils/rateLimit';

const BASE = 'https://graph.facebook.com/v19.0';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

export interface PublishResult {
  platformPostId: string;
}

const token = (account: AccountRecord): string => decryptToken(account.access_token);
const igId = (account: AccountRecord): string => account.platform_id;

const handleMeta = (err: unknown, accountId: string): never => {
  const e = err as { response?: { data?: { error?: { code?: number } } } };
  if (e.response?.data?.error?.code === 190) updateAccountStatus(accountId, 'expired');
  throw err;
};

const pollUntilReady = async (igUserId: string, containerId: string, accessToken: string): Promise<void> => {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const res = await axios.get<{ status_code: string }>(`${BASE}/${containerId}`, {
      params: { fields: 'status_code', access_token: accessToken },
      timeout: 10000,
    });
    if (res.data.status_code === 'FINISHED') return;
    if (res.data.status_code === 'ERROR') throw new Error('Instagram media container processing failed');
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Instagram media container polling timed out');
  void igUserId;
};

export const publishImageToInstagram = async (
  account: AccountRecord,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'instagram');
  if (!rl.allowed) throw new Error(`Instagram rate limit reached. Resets at ${rl.resetsAt}`);

  const at = token(account);
  const id = igId(account);

  try {
    const container = await axios.post<{ id: string }>(`${BASE}/${id}/media`, {
      image_url: imageUrl,
      caption,
      access_token: at,
    }, { timeout: 30000 });
    consumeRateLimit(account.id, 'instagram');

    await pollUntilReady(id, container.data.id, at);

    const publish = await axios.post<{ id: string }>(`${BASE}/${id}/media_publish`, {
      creation_id: container.data.id,
      access_token: at,
    }, { timeout: 15000 });
    consumeRateLimit(account.id, 'instagram');

    updateAccountStatus(account.id, 'active');
    return { platformPostId: publish.data.id };
  } catch (err) {
    return handleMeta(err, account.id);
  }
};

export const publishCarouselToInstagram = async (
  account: AccountRecord,
  imageUrls: string[],
  caption: string,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'instagram');
  if (!rl.allowed) throw new Error('Instagram rate limit reached');

  const at = token(account);
  const id = igId(account);

  try {
    const childIds: string[] = [];
    for (const url of imageUrls.slice(0, 10)) {
      const c = await axios.post<{ id: string }>(`${BASE}/${id}/media`, {
        image_url: url,
        is_carousel_item: true,
        access_token: at,
      }, { timeout: 30000 });
      consumeRateLimit(account.id, 'instagram');
      childIds.push(c.data.id);
    }

    const carousel = await axios.post<{ id: string }>(`${BASE}/${id}/media`, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: at,
    }, { timeout: 30000 });
    consumeRateLimit(account.id, 'instagram');

    await pollUntilReady(id, carousel.data.id, at);

    const publish = await axios.post<{ id: string }>(`${BASE}/${id}/media_publish`, {
      creation_id: carousel.data.id,
      access_token: at,
    }, { timeout: 15000 });
    consumeRateLimit(account.id, 'instagram');

    return { platformPostId: publish.data.id };
  } catch (err) {
    return handleMeta(err, account.id);
  }
};

export const getInstagramAccounts = async (pageAccessToken: string, pageId: string): Promise<{ id: string; username: string }[]> => {
  const res = await axios.get<{ instagram_business_account?: { id: string } }>(
    `${BASE}/${pageId}`,
    { params: { fields: 'instagram_business_account', access_token: pageAccessToken }, timeout: 15000 },
  );
  const igAcct = res.data.instagram_business_account;
  if (!igAcct) return [];
  const detail = await axios.get<{ id: string; username: string }>(
    `${BASE}/${igAcct.id}`,
    { params: { fields: 'id,username', access_token: pageAccessToken }, timeout: 15000 },
  );
  return [detail.data];
};
