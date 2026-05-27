"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachStudio = exports.attachStudioOptional = void 0;
const db_1 = require("../utils/db");
// Used for routes where studio context is optional (e.g. OAuth callbacks that extract studioId from state param)
const attachStudioOptional = (req, res, next) => {
    const user = req.mediafoxUser;
    if (!user) {
        next();
        return;
    }
    const studioId = req.headers['x-studio-id'] ||
        req.query.studio_id ||
        req.body?.studio_id;
    if (studioId) {
        const member = (0, db_1.getMember)(studioId, user.userId);
        if (!member) {
            res.status(403).json({ error: 'You do not have access to this studio' });
            return;
        }
        req.studioId = studioId;
    }
    next();
};
exports.attachStudioOptional = attachStudioOptional;
const attachStudio = (req, res, next) => {
    const user = req.mediafoxUser;
    if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    // Studio ID from header, query param, or body — clients must identify their studio
    const studioId = req.headers['x-studio-id'] ||
        req.query.studio_id ||
        req.body?.studio_id;
    if (!studioId) {
        res.status(400).json({ error: 'x-studio-id header or studio_id is required' });
        return;
    }
    req.studioId = studioId;
    // Allow first-time studio bootstrap only on the dedicated endpoint.
    const allowBootstrap = req.method === 'POST' && req.path === '/bootstrap' && req.baseUrl.endsWith('/team');
    if (!allowBootstrap) {
        const member = (0, db_1.getMember)(studioId, user.userId);
        if (!member) {
            res.status(403).json({ error: 'You do not have access to this studio' });
            return;
        }
    }
    next();
};
exports.attachStudio = attachStudio;
//# sourceMappingURL=studio.js.map