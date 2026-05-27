"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
router.get('/', (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    const items = (0, db_1.getNotifications)(req.mediafoxUser.userId, unreadOnly);
    res.json({ notifications: items });
});
router.post('/read-all', (req, res) => {
    (0, db_1.markNotificationsRead)(req.mediafoxUser.userId);
    res.json({ ok: true });
});
exports.default = router;
//# sourceMappingURL=notifications.js.map