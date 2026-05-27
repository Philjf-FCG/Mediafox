import { Router, Request, Response } from 'express';
import { getMember, getMembersByStudio, upsertMember, removeMember } from '../utils/db';

const router = Router();

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
