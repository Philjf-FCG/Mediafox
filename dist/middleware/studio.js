"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachStudio = exports.attachStudioOptional = void 0;
const db_1 = require("../utils/db");
// Used for routes where studio context is optional (e.g. OAuth callbacks that extract studioId from state param)
const attachStudioOptional = (req, _res, next) => {
    const user = req.mediafoxUser;
    if (!user) {
        next();
        return;
    }
    const studioId = req.headers['x-studio-id'] ||
        req.query.studio_id ||
        req.body?.studio_id;
    if (studioId) {
        req.studioId = studioId;
        (0, db_1.ensureOwner)(studioId, user.userId, user.email, user.name);
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
    // Ensure the authenticated user exists as a member (creates owner on first visit)
    (0, db_1.ensureOwner)(studioId, user.userId, user.email, user.name);
    next();
};
exports.attachStudio = attachStudio;
//# sourceMappingURL=studio.js.map