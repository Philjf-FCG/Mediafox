import { Router, Request, Response } from 'express';
import { getInboxItems, updateInboxItem, getAccountById } from '../utils/db';
import { replyToDiscordMessage } from '../adapters/discord';
import { replyToSlackMessage } from '../adapters/slack';
import axios from 'axios';
import { decryptToken } from '../utils/crypto';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { platform, status, account_id } = req.query as { platform?: string; status?: string; account_id?: string };
  const items = getInboxItems(req.studioId!, { platform, status, accountId: account_id });
  res.json({ items });
});

router.put('/:id', (req: Request, res: Response) => {
  const { status, assigned_to, internal_note } = req.body as { status?: string; assigned_to?: string; internal_note?: string };
  updateInboxItem(req.params.id, { status, assigned_to, internal_note });
  res.json({ ok: true });
});

router.post('/:id/reply', async (req: Request, res: Response) => {
  const { text, account_id } = req.body as { text?: string; account_id?: string };
  if (!text) { res.status(400).json({ error: 'text is required' }); return; }
  if (!account_id) { res.status(400).json({ error: 'account_id is required' }); return; }

  const account = getAccountById(account_id);
  if (!account || account.studio_id !== req.studioId) { res.status(404).json({ error: 'Account not found' }); return; }

  const db = (await import('../utils/db')).getDb();
  const item = db.prepare('SELECT * FROM inbox_items WHERE id=?').get(req.params.id) as { platform_item_id: string; platform: string } | undefined;
  if (!item) { res.status(404).json({ error: 'Inbox item not found' }); return; }

  try {
    switch (account.platform) {
      case 'discord': {
        const extra = JSON.parse(account.extra) as { channel_id?: string };
        if (extra.channel_id) {
          await replyToDiscordMessage(account, extra.channel_id, item.platform_item_id, text);
        }
        break;
      }
      case 'slack': {
        await replyToSlackMessage(account, item.platform_item_id, text);
        break;
      }
      case 'bluesky': {
        const { BskyAgent } = await import('@atproto/api');
        const { decryptToken: dec } = await import('../utils/crypto');
        const extra = JSON.parse(account.extra) as { did: string };
        const agent = new BskyAgent({ service: 'https://bsky.social' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (agent as any).session = { did: extra.did, handle: account.display_name, email: undefined, accessJwt: dec(account.access_token), refreshJwt: account.refresh_token ? dec(account.refresh_token) : '', active: true };
        await agent.post({ text, reply: { root: { uri: item.platform_item_id, cid: '' }, parent: { uri: item.platform_item_id, cid: '' } }, createdAt: new Date().toISOString() });
        break;
      }
      case 'facebook': {
        const at = decryptToken(account.access_token);
        await axios.post(`https://graph.facebook.com/v19.0/${item.platform_item_id}/comments`, { message: text, access_token: at }, { timeout: 15000 });
        break;
      }
      case 'instagram': {
        const at = decryptToken(account.access_token);
        await axios.post(`https://graph.facebook.com/v19.0/${item.platform_item_id}/replies`, { message: text, access_token: at }, { timeout: 15000 });
        break;
      }
      case 'linkedin': {
        const at = decryptToken(account.access_token);
        await axios.post('https://api.linkedin.com/v2/socialActions/comments', { actor: `urn:li:person:${account.platform_id}`, message: { text }, object: item.platform_item_id }, { headers: { Authorization: `Bearer ${at}` }, timeout: 15000 });
        break;
      }
    }

    updateInboxItem(req.params.id, { status: 'resolved' });
    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Reply failed';
    res.status(500).json({ error: msg });
  }
});

router.post('/:id/note', (req: Request, res: Response) => {
  const { note } = req.body as { note?: string };
  if (!note) { res.status(400).json({ error: 'note is required' }); return; }
  updateInboxItem(req.params.id, { internal_note: note });
  res.json({ ok: true });
});

export default router;
