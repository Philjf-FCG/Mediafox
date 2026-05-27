import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  getAccountsByStudio, getAccountById, upsertAccount, deleteAccount, updateAccountTokens, getMember,
} from '../utils/db';
import { encryptToken } from '../utils/crypto';
import { checkRateLimit } from '../utils/rateLimit';
import { checkAccountLimit } from '../utils/planGating';
import { createBlueskySession } from '../adapters/bluesky';

const router = Router();

const getLinkedInScopes = (): string[] => {
  const configured = (process.env.LINKEDIN_SCOPES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (configured.length > 0) return configured;

  // Avoid deprecated r_basicprofile; use modern lite profile defaults.
  return ['r_liteprofile', 'w_member_social'];
};

type OAuthPlatform = 'slack' | 'meta' | 'linkedin';

interface OAuthStatePayload {
  studioId: string;
  type: string;
  userId: string;
  platform: OAuthPlatform;
  nonce: string;
  iat: number;
  exp: number;
}

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const getOauthStateSecret = (): string =>
  (process.env.OAUTH_STATE_SECRET || process.env.MEDIAFOX_JWT_SECRET || '').trim();

const signOauthState = (payload: Omit<OAuthStatePayload, 'nonce' | 'iat' | 'exp'>): string => {
  const secret = getOauthStateSecret();
  if (!secret) throw new Error('OAUTH_STATE_SECRET or MEDIAFOX_JWT_SECRET must be set');

  const now = Math.floor(Date.now() / 1000);
  const body: OAuthStatePayload = {
    ...payload,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + OAUTH_STATE_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
};

const parseOauthState = (state: string, platform: OAuthPlatform): { studioId: string; type: string; userId: string } | null => {
  const secret = getOauthStateSecret();
  if (!secret) return null;

  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) return null;

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.studioId || !payload?.type || !payload?.userId || !payload?.platform) return null;
    if (payload.platform !== platform) return null;
    if (!payload.exp || payload.exp < now) return null;
    return { studioId: payload.studioId, type: payload.type, userId: payload.userId };
  } catch {
    return null;
  }
};

// ─── List accounts ────────────────────────────────────────────────────────────

router.get('/', (req: Request, res: Response) => {
  const accounts = getAccountsByStudio(req.studioId!).map(a => ({
    id: a.id, type: a.type, platform: a.platform, platform_id: a.platform_id,
    display_name: a.display_name, avatar_url: a.avatar_url,
    token_expires_at: a.token_expires_at, status: a.status, connected_at: a.connected_at,
    extra: JSON.parse(a.extra),
  }));
  res.json({ accounts });
});

// ─── Account health ───────────────────────────────────────────────────────────

router.get('/:id/health', (req: Request, res: Response) => {
  const account = getAccountById(req.params.id);
  if (!account || account.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  const rl = checkRateLimit(account.id, account.platform as never);
  res.json({ status: account.status, token_expires_at: account.token_expires_at, rate_limit: rl });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.delete('/:id', (req: Request, res: Response) => {
  const account = getAccountById(req.params.id);
  if (!account || account.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }
  deleteAccount(req.params.id);
  res.json({ ok: true });
});

// ─── Bluesky connection ───────────────────────────────────────────────────────

router.post('/connect/bluesky', async (req: Request, res: Response) => {
  const { handle, app_password, account_type = 'company' } = req.body as {
    handle?: string; app_password?: string; account_type?: string;
  };
  if (!handle || !app_password) { res.status(400).json({ error: 'handle and app_password required' }); return; }

  const quota = await checkAccountLimit(req.studioId!);
  if (!quota.allowed) {
    res.status(402).json({ error: `Account limit reached (${quota.current}/${quota.max}) on your ${quota.plan} plan. Upgrade to connect more accounts.` });
    return;
  }

  try {
    const session = await createBlueskySession(handle, app_password);
    const id = uuidv4();
    const account = upsertAccount({
      id,
      studio_id: req.studioId!,
      owner_user_id: account_type === 'personal' ? req.mediafoxUser!.userId : null,
      type: account_type as 'company' | 'personal',
      platform: 'bluesky',
      platform_id: session.did,
      display_name: `@${session.handle}`,
      avatar_url: null,
      access_token: encryptToken(session.accessJwt),
      refresh_token: encryptToken(session.refreshJwt),
      token_expires_at: null,
      scope: null,
      extra: JSON.stringify({ did: session.did }),
    });
    res.json({ account: { id: account.id, platform: 'bluesky', display_name: account.display_name } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    res.status(400).json({ error: msg });
  }
});

// ─── Discord Webhook connection ───────────────────────────────────────────────

router.post('/connect/discord/webhook', async (req: Request, res: Response) => {
  const { webhook_url, display_name, account_type = 'company' } = req.body as {
    webhook_url?: string; display_name?: string; account_type?: string;
  };
  if (!webhook_url) { res.status(400).json({ error: 'webhook_url required' }); return; }

  const quota = await checkAccountLimit(req.studioId!);
  if (!quota.allowed) {
    res.status(402).json({ error: `Account limit reached (${quota.current}/${quota.max}) on your ${quota.plan} plan. Upgrade to connect more accounts.` });
    return;
  }

  // Validate by sending a test ping
  try {
    await axios.post(`${webhook_url}?wait=true`, {
      embeds: [{ description: '✅ MediaFox connected', color: 0x5865f2 }],
    }, { timeout: 10000 });
  } catch {
    res.status(400).json({ error: 'Failed to validate webhook URL — check it is correct and the channel exists' });
    return;
  }

  const id = uuidv4();
  const parts = webhook_url.split('/');
  const platformId = parts[parts.length - 2] ?? id;

  const account = upsertAccount({
    id,
    studio_id: req.studioId!,
    owner_user_id: account_type === 'personal' ? req.mediafoxUser!.userId : null,
    type: account_type as 'company' | 'personal',
    platform: 'discord',
    platform_id: platformId,
    display_name: display_name || 'Discord Webhook',
    avatar_url: null,
    access_token: encryptToken('webhook-only'),
    refresh_token: null,
    token_expires_at: null,
    scope: 'webhook',
    extra: JSON.stringify({ webhook_url: encryptToken(webhook_url) }),
  });
  res.json({ account: { id: account.id, platform: 'discord', display_name: account.display_name } });
});

// ─── Slack OAuth ──────────────────────────────────────────────────────────────

router.get('/connect/slack', (req: Request, res: Response) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) { res.status(503).json({ error: 'Slack integration not configured' }); return; }
  if (!getOauthStateSecret()) { res.status(503).json({ error: 'OAuth state signing is not configured' }); return; }
  const state = signOauthState({
    studioId: req.studioId!,
    type: String(req.query.account_type ?? 'company'),
    userId: req.mediafoxUser!.userId,
    platform: 'slack',
  });
  const scopes = 'chat:write,channels:read,channels:history,reactions:read';
  const redirect = process.env.SLACK_REDIRECT_URI;
  res.json({ url: `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirect}&state=${state}` });
});

router.get('/connect/slack/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) { res.status(400).send('Invalid callback'); return; }
  const parsed = parseOauthState(state, 'slack');
  if (!parsed) { res.status(400).send('Invalid callback state'); return; }
  if (parsed.userId !== req.mediafoxUser!.userId) { res.status(403).send('Callback is not for this user'); return; }
  if (!getMember(parsed.studioId, req.mediafoxUser!.userId)) { res.status(403).send('No studio access'); return; }
  const { studioId, type } = parsed;

  try {
    const tokenRes = await axios.post<{
      ok: boolean; access_token: string; team: { id: string; name: string };
      authed_user: { id: string };
    }>(
      'https://slack.com/api/oauth.v2.access',
      new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        redirect_uri: process.env.SLACK_REDIRECT_URI!,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
    );
    if (!tokenRes.data.ok) throw new Error('Slack token exchange failed');
    const { access_token, team } = tokenRes.data;

    // Fetch default channel list
    const chanRes = await axios.get<{ ok: boolean; channels: { id: string; name: string }[] }>(
      'https://slack.com/api/conversations.list',
      { headers: { Authorization: `Bearer ${access_token}` }, params: { limit: 20 }, timeout: 10000 },
    );
    const firstChannel = chanRes.data.channels?.[0];

    upsertAccount({
      id: uuidv4(),
      studio_id: studioId,
      owner_user_id: null,
      type: type as 'company' | 'personal',
      platform: 'slack',
      platform_id: team.id,
      display_name: team.name,
      avatar_url: null,
      access_token: encryptToken(access_token),
      refresh_token: null,
      token_expires_at: null,
      scope: 'chat:write,channels:read,channels:history',
      extra: JSON.stringify({ workspace_id: team.id, channel_id: firstChannel?.id ?? '', channel_name: firstChannel?.name ?? '' }),
    });

    res.redirect(`/?connected=slack&workspace=${encodeURIComponent(team.name)}`);
  } catch (err) {
    console.error('Slack OAuth error:', err);
    res.status(500).send('Slack connection failed');
  }
});

// ─── Meta OAuth (Facebook + Instagram) ───────────────────────────────────────

router.get('/connect/meta', (req: Request, res: Response) => {
  const appId = process.env.META_APP_ID;
  if (!appId) { res.status(503).json({ error: 'Meta integration not configured. META_APP_ID is not set.' }); return; }
  if (!getOauthStateSecret()) { res.status(503).json({ error: 'OAuth state signing is not configured' }); return; }
  const state = signOauthState({
    studioId: req.studioId!,
    type: String(req.query.account_type ?? 'company'),
    userId: req.mediafoxUser!.userId,
    platform: 'meta',
  });
  const scopes = 'pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,instagram_manage_insights';
  const redirect = process.env.META_REDIRECT_URI;
  res.json({ url: `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scopes}&state=${state}&response_type=code` });
});

router.get('/connect/meta/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) { res.status(400).send('Invalid callback'); return; }
  const parsed = parseOauthState(state, 'meta');
  if (!parsed) { res.status(400).send('Invalid callback state'); return; }
  if (parsed.userId !== req.mediafoxUser!.userId) { res.status(403).send('Callback is not for this user'); return; }
  if (!getMember(parsed.studioId, req.mediafoxUser!.userId)) { res.status(403).send('No studio access'); return; }
  const { studioId, type } = parsed;

  try {
    // Exchange code for short-lived token
    const tokenRes = await axios.get<{ access_token: string }>('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code,
      },
      timeout: 15000,
    });
    const shortToken = tokenRes.data.access_token;

    // Exchange for long-lived token (60 days)
    const llRes = await axios.get<{ access_token: string; expires_in: number }>('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
      timeout: 15000,
    });
    const longToken = llRes.data.access_token;
    const expiresAt = new Date(Date.now() + llRes.data.expires_in * 1000).toISOString();

    // Get Pages and their tokens
    const { getFacebookPages } = await import('../adapters/facebook');
    const pages = await getFacebookPages(longToken);

    for (const page of pages) {
      upsertAccount({
        id: uuidv4(),
        studio_id: studioId,
        owner_user_id: null,
        type: type as 'company' | 'personal',
        platform: 'facebook',
        platform_id: page.id,
        display_name: page.name,
        avatar_url: null,
        access_token: encryptToken(page.access_token),
        refresh_token: null,
        token_expires_at: expiresAt,
        scope: 'pages_manage_posts,pages_read_engagement',
        extra: JSON.stringify({ page_id: page.id }),
      });

      // Check for linked Instagram business account
      try {
        const { getInstagramAccounts } = await import('../adapters/instagram');
        const igAccounts = await getInstagramAccounts(page.access_token, page.id);
        for (const ig of igAccounts) {
          upsertAccount({
            id: uuidv4(),
            studio_id: studioId,
            owner_user_id: null,
            type: type as 'company' | 'personal',
            platform: 'instagram',
            platform_id: ig.id,
            display_name: `@${ig.username}`,
            avatar_url: null,
            access_token: encryptToken(page.access_token),
            refresh_token: null,
            token_expires_at: expiresAt,
            scope: 'instagram_basic,instagram_content_publish',
            extra: JSON.stringify({ page_id: page.id, page_access_token: encryptToken(page.access_token) }),
          });
        }
      } catch {
        // No Instagram account linked to this page
      }
    }

    res.redirect(`/?connected=meta&pages=${pages.length}`);
  } catch (err) {
    console.error('Meta OAuth error:', err);
    res.status(500).send('Meta connection failed');
  }
});

// ─── LinkedIn OAuth ───────────────────────────────────────────────────────────

router.get('/connect/linkedin', (req: Request, res: Response) => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) { res.status(503).json({ error: 'LinkedIn integration not configured. LINKEDIN_CLIENT_ID is not set.' }); return; }
  if (!getOauthStateSecret()) { res.status(503).json({ error: 'OAuth state signing is not configured' }); return; }
  const state = signOauthState({
    studioId: req.studioId!,
    type: String(req.query.account_type ?? 'company'),
    userId: req.mediafoxUser!.userId,
    platform: 'linkedin',
  });
  const scopes = getLinkedInScopes().join(' ');
  const redirect = process.env.LINKEDIN_REDIRECT_URI;
  res.json({ url: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&scope=${encodeURIComponent(scopes)}&state=${state}` });
});

router.get('/connect/linkedin/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) { res.status(400).send('Invalid callback'); return; }
  const parsed = parseOauthState(state, 'linkedin');
  if (!parsed) { res.status(400).send('Invalid callback state'); return; }
  if (parsed.userId !== req.mediafoxUser!.userId) { res.status(403).send('Callback is not for this user'); return; }
  if (!getMember(parsed.studioId, req.mediafoxUser!.userId)) { res.status(403).send('No studio access'); return; }
  const { studioId, type } = parsed;

  try {
    const tokenRes = await axios.post<{ access_token: string; expires_in: number }>(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
    );
    const { access_token, expires_in } = tokenRes.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const { getLinkedInProfile } = await import('../adapters/linkedin');
    const profile = await getLinkedInProfile(access_token);
    const name = `${profile.localizedFirstName} ${profile.localizedLastName}`.trim();

    upsertAccount({
      id: uuidv4(),
      studio_id: studioId,
      owner_user_id: type === 'personal' ? req.mediafoxUser?.userId ?? null : null,
      type: type as 'company' | 'personal',
      platform: 'linkedin',
      platform_id: profile.id,
      display_name: name,
      avatar_url: null,
      access_token: encryptToken(access_token),
      refresh_token: null,
      token_expires_at: expiresAt,
      scope: getLinkedInScopes().join(','),
      extra: JSON.stringify({}),
    });

    res.redirect(`/?connected=linkedin&name=${encodeURIComponent(name)}`);
  } catch (err: unknown) {
    const responseData = (err as { response?: { data?: unknown } })?.response?.data;
    console.error('LinkedIn OAuth error:', responseData || err);
    if (responseData) {
      res.status(500).json({ error: 'LinkedIn connection failed', detail: responseData });
      return;
    }
    res.status(500).send('LinkedIn connection failed');
  }
});

// ─── Token refresh ────────────────────────────────────────────────────────────

router.post('/:id/refresh', async (req: Request, res: Response) => {
  const account = getAccountById(req.params.id);
  if (!account || account.studio_id !== req.studioId) { res.status(404).json({ error: 'Not found' }); return; }

  // Only Bluesky supports programmatic refresh currently
  if (account.platform === 'bluesky' && account.refresh_token) {
    try {
      const refreshJwt = (await import('../utils/crypto')).decryptToken(account.refresh_token);
      const r = await axios.post('https://bsky.social/xrpc/com.atproto.server.refreshSession', null, {
        headers: { Authorization: `Bearer ${refreshJwt}` }, timeout: 10000,
      });
      const d = r.data as { accessJwt: string; refreshJwt: string };
      updateAccountTokens(account.id, encryptToken(d.accessJwt), encryptToken(d.refreshJwt), null);
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: 'Refresh failed — please reconnect your Bluesky account' });
    }
    return;
  }

  res.json({ ok: false, message: 'Manual reconnection required for this platform' });
});

export default router;
