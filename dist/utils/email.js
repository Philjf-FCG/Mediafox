"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyPostFailed = exports.notifyPostPublished = exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const getTransport = () => {
    const host = process.env.SMTP_HOST;
    if (!host)
        return null;
    return nodemailer_1.default.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
};
const sendEmail = async (opts) => {
    const transport = getTransport();
    if (!transport)
        return; // silently skip if SMTP not configured
    await transport.sendMail({
        from: process.env.SMTP_FROM ?? `MediaFox <noreply@mediafox.io>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
    });
};
exports.sendEmail = sendEmail;
const notifyPostPublished = async (email, postTitle, platforms) => {
    await (0, exports.sendEmail)({
        to: email,
        subject: `Post published — ${postTitle || 'your post'}`,
        html: `<p>Your post <strong>${postTitle || '(untitled)'}</strong> has been published to: <strong>${platforms.join(', ')}</strong>.</p>`,
    });
};
exports.notifyPostPublished = notifyPostPublished;
const notifyPostFailed = async (email, postTitle, error) => {
    await (0, exports.sendEmail)({
        to: email,
        subject: `Post failed to publish — ${postTitle || 'your post'}`,
        html: `<p>Your post <strong>${postTitle || '(untitled)'}</strong> failed to publish.</p><p>Error: ${error}</p>`,
    });
};
exports.notifyPostFailed = notifyPostFailed;
//# sourceMappingURL=email.js.map