"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("./utils/auth");
const studio_1 = require("./middleware/studio");
const auth_2 = __importDefault(require("./routes/auth"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const posts_1 = __importDefault(require("./routes/posts"));
const inbox_1 = __importDefault(require("./routes/inbox"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const media_1 = __importDefault(require("./routes/media"));
const team_1 = __importDefault(require("./routes/team"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const ai_1 = __importDefault(require("./routes/ai"));
const loadAllowedOrigins = () => {
    const configPath = path_1.default.join(process.cwd(), 'fox-suite.config.json');
    if (!fs_1.default.existsSync(configPath))
        return [];
    try {
        const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
        return Object.values(config).filter(Boolean);
    }
    catch {
        return [];
    }
};
const createApp = () => {
    const app = (0, express_1.default)();
    const allowedOrigins = loadAllowedOrigins();
    app.use((0, cors_1.default)({
        origin: (origin, cb) => {
            if (!origin)
                return cb(null, true);
            if (allowedOrigins.length === 0)
                return cb(null, true);
            if (allowedOrigins.includes(origin))
                return cb(null, true);
            cb(new Error(`CORS: origin ${origin} blocked`));
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use((0, cookie_parser_1.default)());
    app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mediafox' }));
    app.use('/api/auth', auth_2.default);
    app.get('/api/plan', auth_1.requireAuth, async (req, res) => {
        const studioId = req.headers['x-studio-id'] || req.query.studio_id;
        if (!studioId) {
            res.status(400).json({ error: 'x-studio-id required' });
            return;
        }
        const { getStudioPlan, getLimits, checkAccountLimit, checkPostQuota } = await Promise.resolve().then(() => __importStar(require('./utils/planGating')));
        const plan = await getStudioPlan(studioId);
        const limits = getLimits(plan);
        const accounts = await checkAccountLimit(studioId);
        const posts = await checkPostQuota(studioId);
        res.json({ plan, limits, usage: { accounts: accounts.current, posts_this_month: posts.current } });
    });
    // Accounts router registered before the main authed router so OAuth callbacks
    // (which arrive from external providers without x-studio-id) bypass attachStudio.
    // Routes that need req.studioId still get it when the client sends x-studio-id.
    app.use('/api/accounts', auth_1.requireAuth, studio_1.attachStudioOptional, accounts_1.default);
    const authed = express_1.default.Router();
    authed.use(auth_1.requireAuth);
    authed.use(studio_1.attachStudio);
    authed.use('/posts', posts_1.default);
    authed.use('/inbox', inbox_1.default);
    authed.use('/analytics', analytics_1.default);
    authed.use('/media', media_1.default);
    authed.use('/team', team_1.default);
    authed.use('/notifications', notifications_1.default);
    authed.use('/ai', ai_1.default);
    app.use('/api', authed);
    // Serve React client in production
    const clientBuild = path_1.default.join(__dirname, '..', 'client', 'build');
    if (fs_1.default.existsSync(clientBuild)) {
        app.use(express_1.default.static(clientBuild));
        app.get('*', (_req, res) => res.sendFile(path_1.default.join(clientBuild, 'index.html')));
    }
    return app;
};
exports.createApp = createApp;
//# sourceMappingURL=app.js.map