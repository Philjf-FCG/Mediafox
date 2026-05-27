"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
router.post('/bootstrap', (req, res) => {
    const studioId = req.studioId;
    const user = req.mediafoxUser;
    const me = (0, db_1.getMember)(studioId, user.userId);
    if (me) {
        res.json({ ok: true, bootstrapped: false, role: me.role });
        return;
    }
    const members = (0, db_1.getMembersByStudio)(studioId);
    if (members.length > 0) {
        res.status(403).json({ error: 'Studio already has members. Ask an owner or manager to invite you.' });
        return;
    }
    (0, db_1.upsertMember)({
        studio_id: studioId,
        user_id: user.userId,
        email: user.email,
        name: user.name,
        role: 'owner',
        joined_at: new Date().toISOString(),
    });
    res.status(201).json({ ok: true, bootstrapped: true, role: 'owner' });
});
const requireOwnerOrManager = (req, res) => {
    const m = (0, db_1.getMember)(req.studioId, req.mediafoxUser.userId);
    if (!m || !['owner', 'manager'].includes(m.role)) {
        res.status(403).json({ error: 'Owner or Manager role required' });
        return false;
    }
    return true;
};
router.get('/', (req, res) => {
    const members = (0, db_1.getMembersByStudio)(req.studioId);
    const me = (0, db_1.getMember)(req.studioId, req.mediafoxUser.userId);
    res.json({ members, my_role: me?.role ?? 'viewer' });
});
router.get('/integration-settings', (req, res) => {
    if (!requireOwnerOrManager(req, res))
        return;
    const saved = (0, db_1.getStudioIntegrationSettingsSummary)(req.studioId);
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
router.put('/integration-settings', (req, res) => {
    if (!requireOwnerOrManager(req, res))
        return;
    const { linkedin_client_id, linkedin_client_secret, linkedin_redirect_uri, linkedin_scopes, meta_app_id, meta_app_secret, meta_redirect_uri, meta_scopes, } = req.body;
    (0, db_1.upsertStudioIntegrationSettings)(req.studioId, req.mediafoxUser.userId, {
        linkedin_client_id,
        linkedin_client_secret,
        linkedin_redirect_uri,
        linkedin_scopes,
        meta_app_id,
        meta_app_secret,
        meta_redirect_uri,
        meta_scopes,
    });
    const saved = (0, db_1.getStudioIntegrationSettingsSummary)(req.studioId);
    res.json({ ok: true, saved });
});
router.post('/invite', (req, res) => {
    if (!requireOwnerOrManager(req, res))
        return;
    const { email, name, role } = req.body;
    if (!email || !name || !role) {
        res.status(400).json({ error: 'email, name, and role are required' });
        return;
    }
    const validRoles = ['owner', 'manager', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
        res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
        return;
    }
    const userId = `invite:${email}`;
    (0, db_1.upsertMember)({ studio_id: req.studioId, user_id: userId, email, name, role: role, joined_at: new Date().toISOString() });
    res.status(201).json({ ok: true, message: `${name} (${email}) added as ${role}` });
});
router.put('/:userId/role', (req, res) => {
    if (!requireOwnerOrManager(req, res))
        return;
    const { role } = req.body;
    if (!role) {
        res.status(400).json({ error: 'role is required' });
        return;
    }
    const member = (0, db_1.getMember)(req.studioId, req.params.userId);
    if (!member) {
        res.status(404).json({ error: 'Member not found' });
        return;
    }
    (0, db_1.upsertMember)({ ...member, role: role });
    res.json({ ok: true });
});
router.delete('/:userId', (req, res) => {
    if (!requireOwnerOrManager(req, res))
        return;
    if (req.params.userId === req.mediafoxUser.userId) {
        res.status(409).json({ error: 'Cannot remove yourself' });
        return;
    }
    (0, db_1.removeMember)(req.studioId, req.params.userId);
    res.json({ ok: true });
});
exports.default = router;
//# sourceMappingURL=team.js.map