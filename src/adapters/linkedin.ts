import axios from 'axios';
import { AccountRecord, updateAccountStatus } from '../utils/db';
import { decryptToken } from '../utils/crypto';
import { consumeRateLimit, checkRateLimit } from '../utils/rateLimit';

const BASE = 'https://api.linkedin.com/v2';

export interface PublishResult {
  platformPostId: string;
}

const token = (account: AccountRecord): string => decryptToken(account.access_token);
const authorUrn = (account: AccountRecord): string => {
  const extra = JSON.parse(account.extra) as { org_id?: string };
  if (extra.org_id) return `urn:li:organization:${extra.org_id}`;
  return `urn:li:person:${account.platform_id}`;
};

const headers = (account: AccountRecord) => ({
  Authorization: `Bearer ${token(account)}`,
  'Content-Type': 'application/json',
  'X-Restli-Protocol-Version': '2.0.0',
});

const handleLinkedIn = (err: unknown, accountId: string): never => {
  const e = err as { response?: { status?: number } };
  if (e.response?.status === 401) updateAccountStatus(accountId, 'expired');
  throw err;
};

export const publishToLinkedIn = async (
  account: AccountRecord,
  text: string,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'linkedin');
  if (!rl.allowed) throw new Error(`LinkedIn rate limit reached. Resets at ${rl.resetsAt}`);

  const body = {
    author: authorUrn(account),
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  try {
    const res = await axios.post<string>(`${BASE}/ugcPosts`, body, {
      headers: headers(account),
      timeout: 20000,
    });
    consumeRateLimit(account.id, 'linkedin');
    updateAccountStatus(account.id, 'active');
    const postId = res.headers['x-restli-id'] as string ?? res.data;
    return { platformPostId: postId };
  } catch (err) {
    return handleLinkedIn(err, account.id);
  }
};

export const publishImageToLinkedIn = async (
  account: AccountRecord,
  text: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'linkedin');
  if (!rl.allowed) throw new Error('LinkedIn rate limit reached');

  const at = token(account);
  const author = authorUrn(account);
  const hdrs = headers(account);

  try {
    // Step 1: Register upload
    const reg = await axios.post<{
      value: { uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: string } }; asset: string };
    }>(`${BASE}/assets?action=registerUpload`, {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: author,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    }, { headers: hdrs, timeout: 20000 });
    consumeRateLimit(account.id, 'linkedin');

    const uploadUrl = reg.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = reg.data.value.asset;

    // Step 2: Upload binary
    await axios.put(uploadUrl, imageBuffer, {
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'image/jpeg' },
      timeout: 60000,
    });
    consumeRateLimit(account.id, 'linkedin');

    // Step 3: Create post referencing asset
    const res = await axios.post<string>(`${BASE}/ugcPosts`, {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'IMAGE',
          media: [{ status: 'READY', description: { text: filename }, media: asset, title: { text: filename } }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }, { headers: hdrs, timeout: 20000 });
    consumeRateLimit(account.id, 'linkedin');

    return { platformPostId: res.headers['x-restli-id'] as string ?? res.data };
  } catch (err) {
    return handleLinkedIn(err, account.id);
  }
};

export const getLinkedInProfile = async (accessToken: string): Promise<{ id: string; localizedFirstName: string; localizedLastName: string }> => {
  try {
    const res = await axios.get<{ id: string; localizedFirstName: string; localizedLastName: string }>(
      `${BASE}/me`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
    );
    return res.data;
  } catch {
    // Some apps use OpenID scopes/userinfo instead of /me profile scopes.
    const u = await axios.get<{ sub: string; given_name?: string; family_name?: string; name?: string }>(
      'https://api.linkedin.com/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 },
    );
    const full = (u.data.name || '').trim();
    const [first, ...rest] = full.split(' ').filter(Boolean);
    return {
      id: u.data.sub,
      localizedFirstName: u.data.given_name || first || 'LinkedIn',
      localizedLastName: u.data.family_name || rest.join(' '),
    };
  }
};
