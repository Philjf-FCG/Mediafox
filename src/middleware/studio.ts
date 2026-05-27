import { NextFunction, Request, Response } from 'express';
import { getMember } from '../utils/db';

// Used for routes where studio context is optional (e.g. OAuth callbacks that extract studioId from state param)
export const attachStudioOptional = (req: Request, res: Response, next: NextFunction): void => {
  const user = req.mediafoxUser;
  if (!user) { next(); return; }
  const studioId =
    (req.headers['x-studio-id'] as string) ||
    (req.query.studio_id as string) ||
    (req.body?.studio_id as string);
  if (studioId) {
    const member = getMember(studioId, user.userId);
    if (!member) {
      res.status(403).json({ error: 'You do not have access to this studio' });
      return;
    }
    req.studioId = studioId;
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

  // Allow first-time studio bootstrap only on the dedicated endpoint.
  const allowBootstrap = req.method === 'POST' && req.path === '/bootstrap' && req.baseUrl.endsWith('/team');
  if (!allowBootstrap) {
    const member = getMember(studioId, user.userId);
    if (!member) {
      res.status(403).json({ error: 'You do not have access to this studio' });
      return;
    }
  }

  next();
};
