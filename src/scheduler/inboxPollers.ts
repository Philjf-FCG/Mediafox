import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getPool, updateAccountStatus } from '../utils/db';
import { decryptToken } from '../utils/crypto';

interface AccountRow { id: string; studio_id: string; platform: string; platform_id: string; access_token: string; refresh_token: string | null; extra: string; display_name: string; }

const upsertInboxItem = async (item: {
  id: string; studio_id: string; account_id: string; platform: string;
  platform_item_id: string; type: string; author_name: string | null;
  author_id: string | null; body: string | null;
}): Promise<void> => {
  await getPool().query(`
    INSERT INTO inbox_items
      (id, studio_id, account_id, platform, platform_item_id, type, author_name, author_platform_id, body, status, received_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unread', NOW())
    ON CONFLICT(account_id, platform_item_id) DO NOTHING
  `, [item.id, item.studio_id, item.account_id, item.platform, item.platform_item_id, item.type,
      item.author_name, item.author_id, item.body]);
};

/** Update a JSON extra field by key in the accounts table */
const updateAccountExtraKey = async (accountId: string, key: string, value: string | number): Promise<void> => {
  // Fetch current extra, merge in application code, write back
  const { rows } = await getPool().query('SELECT extra FROM accounts WHERE id=$1', [accountId]);
  const current = rows[0] as { extra: string } | undefined;
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(current?.extra ?? '{}') as Record<string, unknown>; } catch { /* use empty */ }
  parsed[key] = value;
  await getPool().query('UPDATE accounts SET extra=$1 WHERE id=$2', [JSON.stringify(parsed), accountId]);
};

// ─── Bluesky ──────────────────────────────────────────────────────────────────

const pollBluesky = async (account: AccountRow): Promise<void> => {
  const { BskyAgent } = await import('@atproto/api');
  const extra = JSON.parse(account.extra) as { did: string; cursor?: string };
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (agent as any).session = {
    did: extra.did, handle: account.display_name, email: undefined,
    accessJwt: decryptToken(account.access_token),
    refreshJwt: account.refresh_token ? decryptToken(account.refresh_token) : '',
    active: true,
  };

  const res = await agent.listNotifications({ limit: 25, cursor: extra.cursor });
  const notifications = res.data.notifications.filter(n => ['mention', 'reply'].includes(n.reason));

  for (const notif of notifications) {
    const record = notif.record as { text?: string } | undefined;
    await upsertInboxItem({
      id: uuidv4(),
      studio_id: account.studio_id,
      account_id: account.id,
      platform: 'bluesky',
      platform_item_id: notif.uri,
      type: notif.reason,
      author_name: notif.author.displayName ?? notif.author.handle,
      author_id: notif.author.did,
      body: record?.text ?? null,
    });
  }

  if (res.data.cursor) {
    await updateAccountExtraKey(account.id, 'cursor', res.data.cursor);
  }
};

// ─── Facebook ─────────────────────────────────────────────────────────────────

const pollFacebook = async (account: AccountRow): Promise<void> => {
  const token = decryptToken(account.access_token);
  const extra = JSON.parse(account.extra) as { page_id?: string; since?: number };
  const since = extra.since ?? Math.floor(Date.now() / 1000) - 86400;

  const res = await axios.get<{ data: { id: string; from?: { name: string; id: string }; message?: string; created_time: string }[] }>(
    `https://graph.facebook.com/v19.0/${account.platform_id}/conversations`,
    { params: { fields: 'messages{from,message,created_time}', since, access_token: token }, timeout: 15000 },
  );

  for (const conv of res.data.data ?? []) {
    await upsertInboxItem({
      id: uuidv4(),
      studio_id: account.studio_id,
      account_id: account.id,
      platform: 'facebook',
      platform_item_id: conv.id,
      type: 'message',
      author_name: conv.from?.name ?? null,
      author_id: conv.from?.id ?? null,
      body: conv.message ?? null,
    });
  }

  await updateAccountExtraKey(account.id, 'since', Math.floor(Date.now() / 1000));
};

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

const pollLinkedIn = async (account: AccountRow): Promise<void> => {
  const token = decryptToken(account.access_token);
  const extra = JSON.parse(account.extra) as { org_id?: string; since?: number };

  const params: Record<string, string | number> = {
    q: 'socialActivities',
    authors: `List(urn:li:person:${account.platform_id})`,
    count: 20,
  };
  if (extra.since) params.start = extra.since;

  const res = await axios.get<{ elements: { id: string; message?: { text: string }; actor?: string; created?: { time: number } }[] }>(
    'https://api.linkedin.com/v2/socialActions',
    { headers: { Authorization: `Bearer ${token}` }, params, timeout: 15000 },
  ).catch(() => ({ data: { elements: [] } }));

  for (const el of res.data.elements ?? []) {
    await upsertInboxItem({
      id: uuidv4(),
      studio_id: account.studio_id,
      account_id: account.id,
      platform: 'linkedin',
      platform_item_id: el.id,
      type: 'comment',
      author_name: el.actor ?? null,
      author_id: el.actor ?? null,
      body: el.message?.text ?? null,
    });
  }

  await updateAccountExtraKey(account.id, 'since', Date.now());
};

// ─── Discord (bot) ────────────────────────────────────────────────────────────

const pollDiscord = async (account: AccountRow): Promise<void> => {
  const extra = JSON.parse(account.extra) as { channel_id?: string; last_message_id?: string };
  if (!extra.channel_id) return;

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return;

  const params: Record<string, string | number> = { limit: 25 };
  if (extra.last_message_id) params.after = extra.last_message_id;

  const res = await axios.get<{ id: string; author?: { username: string; id: string }; content?: string }[]>(
    `https://discord.com/api/v10/channels/${extra.channel_id}/messages`,
    { headers: { Authorization: `Bot ${botToken}` }, params, timeout: 10000 },
  ).catch(() => ({ data: [] }));

  let lastId = extra.last_message_id;
  for (const msg of res.data ?? []) {
    await upsertInboxItem({
      id: uuidv4(),
      studio_id: account.studio_id,
      account_id: account.id,
      platform: 'discord',
      platform_item_id: msg.id,
      type: 'message',
      author_name: msg.author?.username ?? null,
      author_id: msg.author?.id ?? null,
      body: msg.content ?? null,
    });
    if (!lastId || msg.id > lastId) lastId = msg.id;
  }

  if (lastId && lastId !== extra.last_message_id) {
    await updateAccountExtraKey(account.id, 'last_message_id', lastId);
  }
};

// ─── Slack ────────────────────────────────────────────────────────────────────

const pollSlack = async (account: AccountRow): Promise<void> => {
  const token = decryptToken(account.access_token);
  const extra = JSON.parse(account.extra) as { channel_id?: string; oldest?: string };
  if (!extra.channel_id) return;

  const params: Record<string, string | number> = { channel: extra.channel_id, limit: 25 };
  if (extra.oldest) params.oldest = extra.oldest;

  const res = await axios.get<{ ok: boolean; messages?: { ts: string; user?: string; username?: string; text?: string }[] }>(
    'https://slack.com/api/conversations.history',
    { headers: { Authorization: `Bearer ${token}` }, params, timeout: 10000 },
  ).catch(() => ({ data: { ok: false, messages: [] } }));

  if (!res.data.ok) return;

  let newest = extra.oldest;
  for (const msg of res.data.messages ?? []) {
    await upsertInboxItem({
      id: uuidv4(),
      studio_id: account.studio_id,
      account_id: account.id,
      platform: 'slack',
      platform_item_id: msg.ts,
      type: 'message',
      author_name: msg.username ?? msg.user ?? null,
      author_id: msg.user ?? null,
      body: msg.text ?? null,
    });
    if (!newest || msg.ts > newest) newest = msg.ts;
  }

  if (newest && newest !== extra.oldest) {
    await updateAccountExtraKey(account.id, 'oldest', newest);
  }
};

// ─── Main poller ──────────────────────────────────────────────────────────────

export const pollAllInboxes = async (): Promise<void> => {
  const { rows: accounts } = await getPool().query(
    `SELECT * FROM accounts WHERE status='active' AND platform IN ('bluesky','facebook','linkedin','discord','slack')`,
  );

  for (const account of accounts as AccountRow[]) {
    try {
      switch (account.platform) {
        case 'bluesky':    await pollBluesky(account); break;
        case 'facebook':   await pollFacebook(account); break;
        case 'linkedin':   await pollLinkedIn(account); break;
        case 'discord':    await pollDiscord(account); break;
        case 'slack':      await pollSlack(account); break;
      }
    } catch (err) {
      console.error(`[inbox] poll failed for ${account.platform} account ${account.id}:`, err);
      // Mark expired if auth error
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await updateAccountStatus(account.id, 'expired');
      }
    }
  }
};
