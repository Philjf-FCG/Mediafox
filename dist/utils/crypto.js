"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptToken = exports.encryptToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const getKey = () => {
    const raw = process.env.TOKEN_ENCRYPTION_KEY || '';
    if (!raw || raw === 'change-me-to-a-32-byte-hex-string-in-production') {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('TOKEN_ENCRYPTION_KEY must be set in production');
        }
        return crypto_1.default.scryptSync('mediafox-dev-key', 'salt', 32);
    }
    const buf = Buffer.from(raw, 'hex');
    if (buf.length !== 32)
        throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    return buf;
};
const encryptToken = (plaintext) => {
    const key = getKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};
exports.encryptToken = encryptToken;
const decryptToken = (ciphertext) => {
    const key = getKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
};
exports.decryptToken = decryptToken;
//# sourceMappingURL=crypto.js.map