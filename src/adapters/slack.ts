import axios from 'axios';
import { AccountRecord } from '../utils/db';
import { decryptToken } from '../utils/crypto';
import { consumeRateLimit, checkRateLimit } from '../utils/rateLimit';

export interface PublishResult {
  platformPostId: string;
}

interface SlackApiResponse {
  ok: boolean;
  ts?: string;
  scheduled_message_id?: string;
  error?: string;
}

const getToken = (account: AccountRecord): string => decryptToken(account.access_token);

const getChannelId = (account: AccountRecord): string => {
  const extra = JSON.parse(account.extra) as { channel_id?: string };
  if (!extra.channel_id) throw new Error('Slack account has no channel_id configured');
  return extra.channel_id;
};

export const publishToSlack = async (
  account: AccountRecord,
  text: string,
  blocks?: unknown[],
  scheduledAt?: Date,
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'slack');
  if (!rl.allowed) throw new Error(`Slack rate limit reached. Resets at ${rl.resetsAt}`);

  const token = getToken(account);
  const channel = getChannelId(account);

  const endpoint = scheduledAt ? 'chat.scheduleMessage' : 'chat.postMessage';
  const body: Record<string, unknown> = { channel, text };
  if (blocks?.length) body.blocks = blocks;
  if (scheduledAt) body.post_at = Math.floor(scheduledAt.getTime() / 1000);

  const res = await axios.post<SlackApiResponse>(
    `https://slack.com/api/${endpoint}`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 },
  );

  if (!res.data.ok) throw new Error(`Slack API error: ${res.data.error}`);
  consumeRateLimit(account.id, 'slack');

  return { platformPostId: res.data.ts ?? res.data.scheduled_message_id ?? 'unknown' };
};

export const replyToSlackMessage = async (
  account: AccountRecord,
  threadTs: string,
  text: string,
): Promise<void> => {
  const token = getToken(account);
  const channel = getChannelId(account);

  const res = await axios.post<SlackApiResponse>(
    'https://slack.com/api/chat.postMessage',
    { channel, text, thread_ts: threadTs },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 },
  );
  if (!res.data.ok) throw new Error(`Slack reply error: ${res.data.error}`);
  consumeRateLimit(account.id, 'slack');
};

export const fetchSlackChannels = async (botToken: string): Promise<{ id: string; name: string }[]> => {
  const res = await axios.get<{ ok: boolean; channels: { id: string; name: string }[]; error?: string }>(
    'https://slack.com/api/conversations.list',
    { headers: { Authorization: `Bearer ${botToken}` }, params: { limit: 200 }, timeout: 15000 },
  );
  if (!res.data.ok) throw new Error(`Slack channels error: ${res.data.error}`);
  return res.data.channels;
};
