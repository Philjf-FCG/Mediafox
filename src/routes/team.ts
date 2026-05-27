import { Router, Request, Response } from 'express';
import {
  getMember,
  getMembersByStudio,
  upsertMember,
  removeMember,
  getStudioIntegrationSettingsSummary,
  upsertStudioIntegrationSettings,
} from '../utils/db';

const router = Router();

router.post('/bootstrap', (req: Request, res: Response) => {
  const studioId = req.studioId!;
  const user = req.mediafoxUser!;
  const me = getMember(studioId, user.userId);
  if (me) {
    res.json({ ok: true, bootstrapped: false, role: me.role });
    return;
  }

  const members = getMembersByStudio(studioId);
  if (members.length > 0) {
    res.status(403).json({ error: 'Studio already has members. Ask an owner or manager to invite you.' });
    return;
  }

  upsertMember({
    studio_id: studioId,
    user_id: user.userId,
    email: user.email,
    name: user.name,
    role: 'owner',
    joined_at: new Date().toISOString(),
  });

  res.status(201).json({ ok: true, bootstrapped: true, role: 'owner' });
});

const requireOwnerOrManager = (req: Request, res: Response): boolean => {
  const m = getMember(req.studioId!, req.mediafoxUser!.userId);
  if (!m || !['owner', 'manager'].includes(m.role)) {
    res.status(403).json({ error: 'Owner or Manager role required' });
    return false;
  }
  return true;
};

router.get('/', (req: Request, res: Response) => {
  const members = getMembersByStudio(req.studioId!);
  const me = getMember(req.studioId!, req.mediafoxUser!.userId);
  res.json({ members, my_role: me?.role ?? 'viewer' });
});

router.get('/integration-settings', (req: Request, res: Response) => {
  if (!requireOwnerOrManager(req, res)) return;

  const saved = getStudioIntegrationSettingsSummary(req.studioId!);
  const effective = {
    linkedin_client_id: saved.linkedin_client_id || process.env.LINKEDIN_CLIENT_ID || null,
    linkedin_redirect_uri: saved.linkedin_redirect_uri || process.env.LINKEDIN_REDIRECT_URI || null,
    linkedin_scopes: saved.linkedin_scopes || process.env.LINKEDIN_SCOPES || null,
    meta_app_id: saved.meta_app_id || process.env.META_APP_ID || null,
    meta_redirect_uri: saved.meta_redirect_uri || process.env.META_REDIRECT_URI || null,
    meta_scopes: saved.meta_scopes || null,
    has_linkedin_client_secret: saved.has_linkedin_client_secret || Boolean(process.env.LINKEDIN_CLIENT_SECRET),
    has_meta_app_secret: saved.has_meta_app_secret || Boolean(process.env.META_APP_SECRET),
  };

  res.json({ saved, effective });
});

router.put('/integration-settings', (req: Request, res: Response) => {
  if (!requireOwnerOrManager(req, res)) return;

  const {
    linkedin_client_id,
    linkedin_client_secret,
    linkedin_redirect_uri,
    linkedin_scopes,
    meta_app_id,
    meta_app_secret,
    meta_redirect_uri,
    meta_scopes,
  } = req.body as {
    linkedin_client_id?: string;
    linkedin_client_secret?: string;
    linkedin_redirect_uri?: string;
    linkedin_scopes?: string;
    meta_app_id?: string;
    meta_app_secret?: string;
    meta_redirect_uri?: string;
    meta_scopes?: string;
  };

  upsertStudioIntegrationSettings(req.studioId!, req.mediafoxUser!.userId, {
    linkedin_client_id,
    linkedin_client_secret,
    linkedin_redirect_uri,
    linkedin_scopes,
    meta_app_id,
    meta_app_secret,
    meta_redirect_uri,
    meta_scopes,
  });

  const saved = getStudioIntegrationSettingsSummary(req.studioId!);
  res.json({ ok: true, saved });
});

router.post('/invite', (req: Request, res: Response) => {
  if (!requireOwnerOrManager(req, res)) return;
  const { email, name, role } = req.body as { email?: string; name?: string; role?: string };
  if (!email || !name || !role) { res.status(400).json({ error: 'email, name, and role are required' }); return; }
  const validRoles = ['owner', 'manager', 'editor', 'viewer'];
  if (!validRoles.includes(role)) { res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` }); return; }

  const userId = `invite:${email}`;
  upsertMember({ studio_id: req.studioId!, user_id: userId, email, name, role: role as never, joined_at: new Date().toISOString() });
  res.status(201).json({ ok: true, message: `${name} (${email}) added as ${role}` });
});

router.put('/:userId/role', (req: Request, res: Response) => {
  if (!requireOwnerOrManager(req, res)) return;
  const { role } = req.body as { role?: string };
  if (!role) { res.status(400).json({ error: 'role is required' }); return; }

  const member = getMember(req.studioId!, req.params.userId);
  if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

  upsertMember({ ...member, role: role as never });
  res.json({ ok: true });
});

router.delete('/:userId', (req: Request, res: Response) => {
  if (!requireOwnerOrManager(req, res)) return;
  if (req.params.userId === req.mediafoxUser!.userId) { res.status(409).json({ error: 'Cannot remove yourself' }); return; }
  removeMember(req.studioId!, req.params.userId);
  res.json({ ok: true });
});

export default router;
