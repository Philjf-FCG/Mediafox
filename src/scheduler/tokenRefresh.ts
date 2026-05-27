import axios from 'axios';
import { getDb, updateAccountTokens, updateAccountStatus } from '../utils/db';
import { decryptToken, encryptToken } from '../utils/crypto';

interface AccountRow { id: string; platform: string; access_token: string; refresh_token: string | null; token_expires_at: string | null; extra: string; }

const refreshBluesky = async (account: AccountRow): Promise<void> => {
  if (!account.refresh_token) {
    updateAccountStatus(account.id, 'expired');
    return;
  }
  const refreshJwt = decryptToken(account.refresh_token);
  const res = await axios.post<{ accessJwt: string; refreshJwt: string }>(
    'https://bsky.social/xrpc/com.atproto.server.refreshSession',
    null,
    { headers: { Authorization: `Bearer ${refreshJwt}` }, timeout: 10000 },
  );
  updateAccountTokens(account.id, encryptToken(res.data.accessJwt), encryptToken(res.data.refreshJwt), null);
  updateAccountStatus(account.id, 'active');
};

const refreshLinkedIn = async (account: AccountRow): Promise<void> => {
  if (!account.refresh_token) {
    updateAccountStatus(account.id, 'expired');
    return;
  }
  try {
    const refreshToken = decryptToken(account.refresh_token);
    const res = await axios.post<{ access_token: string; expires_in: number; refresh_token?: string }>(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 },
    );
    const expiresAt = new Date(Date.now() + res.data.expires_in * 1000).toISOString();
    updateAccountTokens(
      account.id,
      encryptToken(res.data.access_token),
      res.data.refresh_token ? encryptToken(res.data.refresh_token) : account.refresh_token,
      expiresAt,
    );
    updateAccountStatus(account.id, 'active');
  } catch {
    updateAccountStatus(account.id, 'expired');
  }
};

export const refreshExpiringTokens = async (): Promise<void> => {
  // Refresh tokens expiring within the next 7 days
  const threshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const accounts = getDb()
    .prepare(`SELECT * FROM accounts WHERE status='active' AND token_expires_at IS NOT NULL AND token_expires_at < ?`)
    .all(threshold) as AccountRow[];

  for (const account of accounts) {
    try {
      if (account.platform === 'bluesky') await refreshBluesky(account);
      else if (account.platform === 'linkedin') await refreshLinkedIn(account);
      // Meta tokens can be exchanged for new long-lived tokens before expiry
      else if (account.platform === 'facebook' || account.platform === 'instagram') {
        if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) continue;
        const accessToken = decryptToken(account.access_token);
        const res = await axios.get<{ access_token: string; expires_in: number }>(
          'https://graph.facebook.com/v19.0/oauth/access_token',
          {
            params: {
              grant_type: 'fb_exchange_token',
              client_id: process.env.META_APP_ID,
              client_secret: process.env.META_APP_SECRET,
              fb_exchange_token: accessToken,
            },
            timeout: 10000,
          },
        );
        const expiresAt = new Date(Date.now() + res.data.expires_in * 1000).toISOString();
        updateAccountTokens(account.id, encryptToken(res.data.access_token), null, expiresAt);
        updateAccountStatus(account.id, 'active');
      }
    } catch (err) {
      console.error(`Token refresh failed for account ${account.id} (${account.platform}):`, err);
    }
  }
};
