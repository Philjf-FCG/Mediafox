"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
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