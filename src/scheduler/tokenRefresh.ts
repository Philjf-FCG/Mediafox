import axios from 'axios';
import { getPool, updateAccountTokens, updateAccountStatus, getStudioIntegrationSettings } from '../utils/db';
import { decryptToken, encryptToken } from '../utils/crypto';

interface AccountRow { id: string; studio_id: string; platform: string; access_token: string; refresh_token: string | null; token_expires_at: string | null; extra: string; }

const getStudioOAuthConfig = async (studioId: string): Promise<{
  linkedinClientId: string;
  linkedinClientSecret: string;
  metaAppId: string;
  metaAppSecret: string;
}> => {
  const stored = await getStudioIntegrationSettings(studioId);
  return {
    linkedinClientId: (stored?.linkedin_client_id || process.env.LINKEDIN_CLIENT_ID || '').trim(),
    linkedinClientSecret: (stored?.linkedin_client_secret || process.env.LINKEDIN_CLIENT_SECRET || '').trim(),
    metaAppId: (stored?.meta_app_id || process.env.META_APP_ID || '').trim(),
    metaAppSecret: (stored?.meta_app_secret || process.env.META_APP_SECRET || '').trim(),
  };
};

const refreshBluesky = async (account: AccountRow): Promise<void> => {
  if (!account.refresh_token) {
    await updateAccountStatus(account.id, 'expired');
    return;
  }
  const refreshJwt = decryptToken(account.refresh_token);
  const res = await axios.post<{ accessJwt: string; refreshJwt: string }>(
    'https://bsky.social/xrpc/com.atproto.server.refreshSession',
    null,
    { headers: { Authorization: `Bearer ${refreshJwt}` }, timeout: 10000 },
  );
  await updateAccountTokens(account.id, encryptToken(res.data.accessJwt), encryptToken(res.data.refreshJwt), null);
  await updateAccountStatus(account.id, 'active');
};

const refreshLinkedIn = async (account: AccountRow): Promise<void> => {
  if (!account.refresh_token) {
    await updateAccountStatus(account.id, 'expired');
    return;
  }

  const cfg = await getStudioOAuthConfig(account.studio_id);
  if (!cfg.linkedinClientId || !cfg.linkedinClientSecret) {
    await updateAccountStatus(account.id, 'error');
    return;
  }

  try {
    const refreshToken = decryptToken(account.refresh_token);
    const res = await axios.post<{ access_token: string; expires_in: number; refresh_token?: string }>(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: cfg.linkedinClientId,
        client_secret: cfg.linkedinClientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
    );
    const expiresAt = new Date(Date.now() + res.data.expires_in * 1000).toISOString();
    await updateAccountTokens(
      account.id,
      encryptToken(res.data.access_token),
      res.data.refresh_token ? encryptToken(res.data.refresh_token) : account.refresh_token,
      expiresAt,
    );
    await updateAccountStatus(account.id, 'active');
  } catch {
    await updateAccountStatus(account.id, 'expired');
  }
};

export const refreshExpiringTokens = async (): Promise<void> => {
  // Refresh tokens expiring within the next 7 days
  const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { rows: accounts } = await getPool().query(
    `SELECT * FROM accounts WHERE status='active' AND token_expires_at IS NOT NULL AND token_expires_at < $1`,
    [threshold],
  );

  for (const account of accounts as AccountRow[]) {
    try {
      if (account.platform === 'bluesky') await refreshBluesky(account);
      else if (account.platform === 'linkedin') await refreshLinkedIn(account);
      // Meta tokens can be exchanged for new long-lived tokens before expiry
      else if (account.platform === 'facebook' || account.platform === 'instagram') {
        const cfg = await getStudioOAuthConfig(account.studio_id);
        if (!cfg.metaAppId || !cfg.metaAppSecret) continue;
        const accessToken = decryptToken(account.access_token);
        const res = await axios.get<{ access_token: string; expires_in: number }>(
          'https://graph.facebook.com/v19.0/oauth/access_token',
          {
            params: {
              grant_type: 'fb_exchange_token',
              client_id: cfg.metaAppId,
              client_secret: cfg.metaAppSecret,
              fb_exchange_token: accessToken,
            },
            timeout: 10000,
          },
        );
        const expiresAt = new Date(Date.now() + res.data.expires_in * 1000).toISOString();
        await updateAccountTokens(account.id, encryptToken(res.data.access_token), null, expiresAt);
        await updateAccountStatus(account.id, 'active');
      }
    } catch (err) {
      console.error(`Token refresh failed for account ${account.id} (${account.platform}):`, err);
    }
  }
};
