import { NextFunction, Request, Response } from 'express';
import { ensureOwner } from '../utils/db';

// Used for routes where studio context is optional (e.g. OAuth callbacks that extract studioId from state param)
export const attachStudioOptional = (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.mediafoxUser;
  if (!user) { next(); return; }
  const studioId =
    (req.headers['x-studio-id'] as string) ||
    (req.query.studio_id as string) ||
    (req.body?.studio_id as string);
  if (studioId) {
    req.studioId = studioId;
    ensureOwner(studioId, user.userId, user.email, user.name);
  }
  next();
};

export const attachStudio = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.mediafoxUser;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Studio ID from header, query param, or body — clients must identify their studio
  const studioId =
    (req.headers['x-studio-id'] as string) ||
    (req.query.studio_id as string) ||
    (req.body?.studio_id as string);

  if (!studioId) {
    res.status(400).json({ error: 'x-studio-id header or studio_id is required' });
    return;
  }

  req.studioId = studioId;

  // Ensure the authenticated user exists as a member (creates owner on first visit)
  ensureOwner(studioId, user.userId, user.email, user.name);

  next();
};
