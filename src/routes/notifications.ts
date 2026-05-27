import { Router, Request, Response } from 'express';
import { getNotifications, markNotificationsRead } from '../utils/db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const unreadOnly = req.query.unread === 'true';
  const items = getNotifications(req.mediafoxUser!.userId, unreadOnly);
  res.json({ notifications: items });
});

router.post('/read-all', (req: Request, res: Response) => {
  markNotificationsRead(req.mediafoxUser!.userId);
  res.json({ ok: true });
});

export default router;
