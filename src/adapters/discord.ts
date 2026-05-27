import axios from 'axios';
import { AccountRecord } from '../utils/db';
import { decryptToken } from '../utils/crypto';
import { consumeRateLimit, checkRateLimit } from '../utils/rateLimit';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

export interface PublishResult {
  platformPostId: string;
}

const getWebhookUrl = (account: AccountRecord): string => {
  const extra = JSON.parse(account.extra) as { webhook_url?: string };
  if (extra.webhook_url) return decryptToken(extra.webhook_url);
  throw new Error('Discord account has no webhook URL configured');
};

export const publishToDiscordWebhook = async (
  account: AccountRecord,
  content: string,
  embeds?: DiscordEmbed[],
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'discord');
  if (!rl.allowed) throw new Error(`Discord rate limit reached. Resets at ${rl.resetsAt}`);

  const webhookUrl = getWebhookUrl(account);

  const body: Record<string, unknown> = {};
  if (content) body.content = content.substring(0, 2000);
  if (embeds?.length) body.embeds = embeds.slice(0, 10);

  const res = await axios.post<{ id: string }>(`${webhookUrl}?wait=true`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  consumeRateLimit(account.id, 'discord');
  return { platformPostId: res.data.id };
};

export const publishToDiscordBot = async (
  account: AccountRecord,
  channelId: string,
  content: string,
  embeds?: DiscordEmbed[],
): Promise<PublishResult> => {
  const rl = checkRateLimit(account.id, 'discord');
  if (!rl.allowed) throw new Error(`Discord rate limit reached. Resets at ${rl.resetsAt}`);

  const botToken = decryptToken(account.access_token);

  const body: Record<string, unknown> = {};
  if (content) body.content = content.substring(0, 2000);
  if (embeds?.length) body.embeds = embeds;

  const res = await axios.post<{ id: string }>(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    body,
    { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
  );

  consumeRateLimit(account.id, 'discord');
  return { platformPostId: res.data.id };
};

export const replyToDiscordMessage = async (
  account: AccountRecord,
  channelId: string,
  messageId: string,
  content: string,
): Promise<void> => {
  const botToken = decryptToken(account.access_token);
  await axios.post(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    { content: content.substring(0, 2000), message_reference: { message_id: messageId } },
    { headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }, timeout: 15000 },
  );
  consumeRateLimit(account.id, 'discord');
};
