import axios from 'axios';
import { AccountRecord, updateAccountStatus } from '../utils/db';
import { decryptToken } from '../utils/crypto';
import { consumeRateLimit, checkRateLimit } from '../utils/rateLimit';

const BASE = 'https://graph.facebook.com/v19.0';

export interface PublishResult {
  platformPostId: string;
}

const token = (account: AccountRecord): string => decryptToken(account.access_token);
const pageId = (account: AccountRecord): string => {
  const extra = JSON.parse(account.extra) as { page_id?: string };
  return extra.page_id ?? account.platform_id;
};

const handleMeta = (err: unknown, accountId: string): never => {
  const e = err as { response?: { data?: { error?: { code?: number } } } };
  if (e.response?.data?.error?.code === 190) updateAccountStatus(accountId, 'expired');
  throw err;
};

export const publishToFacebook = async (
  account: AccountRecord,
  message: string,
  link?: string,
  scheduledPublishTime?: number,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'facebook');
  if (!rl.allowed) throw new Error(`Facebook rate limit reached. Resets at ${rl.resetsAt}`);

  const pid = pageId(account);
  const params: Record<string, unknown> = { message, access_token: token(account) };
  if (link) params.link = link;
  if (scheduledPublishTime) { params.scheduled_publish_time = scheduledPublishTime; params.published = false; }

  try {
    const res = await axios.post<{ id: string }>(`${BASE}/${pid}/feed`, params, { timeout: 20000 });
    consumeRateLimit(account.id, 'facebook');
    updateAccountStatus(account.id, 'active');
    return { platformPostId: res.data.id };
  } catch (err) {
    return handleMeta(err, account.id);
  }
};

export const publishPhotoToFacebook = async (
  account: AccountRecord,
  message: string,
  imageUrl: string,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'facebook');
  if (!rl.allowed) throw new Error(`Facebook rate limit reached`);

  const pid = pageId(account);
  try {
    const res = await axios.post<{ id: string }>(`${BASE}/${pid}/photos`, {
      caption: message,
      url: imageUrl,
      access_token: token(account),
    }, { timeout: 30000 });
    consumeRateLimit(account.id, 'facebook');
    return { platformPostId: res.data.id };
  } catch (err) {
    return handleMeta(err, account.id);
  }
};

export const getFacebookPageInsights = async (
  account: AccountRecord,
  since: string,
  until: string,
): Promise<unknown> => {
  const rl = checkRateLimit(account.id, 'facebook');
  if (!rl.allowed) throw new Error('Facebook rate limit reached');

  const pid = pageId(account);
  try {
    const res = await axios.get(`${BASE}/${pid}/insights`, {
      params: {
        metric: 'page_impressions,page_reach,page_engaged_users,page_fans',
        period: 'day',
        since,
        until,
        access_token: token(account),
      },
      timeout: 20000,
    });
    consumeRateLimit(account.id, 'facebook');
    return res.data;
  } catch (err) {
    return handleMeta(err, account.id);
  }
};

export const getFacebookPages = async (userToken: string): Promise<{ id: string; name: string; access_token: string }[]> => {
  const res = await axios.get<{ data: { id: string; name: string; access_token: string }[] }>(
    `${BASE}/me/accounts`,
    { params: { access_token: userToken, fields: 'id,name,access_token' }, timeout: 15000 },
  );
  return res.data.data;
};
