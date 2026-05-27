"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
const callClaude = async (prompt, maxTokens = 400) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new Error('ANTHROPIC_API_KEY is not configured');
    const res = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
    }, {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        timeout: 30000,
    });
    return res.data.content.find(c => c.type === 'text')?.text ?? '';
};
// ─── Caption suggestions ──────────────────────────────────────────────────────
router.post('/suggest-caption', async (req, res) => {
    const { topic, platform, tone = 'professional', existing_copy } = req.body;
    if (!topic && !existing_copy) {
        res.status(400).json({ error: 'topic or existing_copy is required' });
        return;
    }
    const platformCtx = platform ? ` optimised for ${platform}` : '';
    const charLimit = platform ? ({ bluesky: 300, linkedin: 700, facebook: 500, instagram: 500, discord: 1500, slack: 1500 }[platform] ?? 500) : 500;
    const prompt = existing_copy
        ? `Rewrite this social media post${platformCtx} in a ${tone} tone. Keep it under ${charLimit} characters. Return only the rewritten post, no commentary:\n\n${existing_copy}`
        : `Write 3 different social media captions${platformCtx} about: "${topic}". Tone: ${tone}. Each under ${charLimit} characters. Return them numbered 1. 2. 3. with no other text.`;
    try {
        const text = await callClaude(prompt);
        const suggestions = existing_copy
            ? [text.trim()]
            : text.split(/\n(?=\d+\.)/).map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
        res.json({ suggestions });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'AI suggestion failed';
        res.status(503).json({ error: msg });
    }
});
// ─── Hashtag recommendations ──────────────────────────────────────────────────
router.post('/suggest-hashtags', async (req, res) => {
    const { text, platform } = req.body;
    if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
    }
    const prompt = `Suggest 5-10 relevant hashtags for this social media post${platform ? ` on ${platform}` : ''}. Return only the hashtags as a comma-separated list, no other text:\n\n${text}`;
    try {
        const result = await callClaude(prompt, 200);
        const hashtags = result.split(/[\s,]+/).map(h => h.startsWith('#') ? h : `#${h}`).filter(h => h.length > 1);
        res.json({ hashtags });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'AI suggestion failed';
        res.status(503).json({ error: msg });
    }
});
// ─── Best-time-to-post (AI-enhanced) ──────────────────────────────────────────
router.post('/best-time', async (req, res) => {
    const { platform, account_type = 'company', industry } = req.body;
    const prompt = `What are the 3 best times to post on ${platform ?? 'social media'} for a ${account_type} account${industry ? ` in the ${industry} industry` : ''}? Be specific with times and days. Format: "Day HH:MM — reason". Return only 3 suggestions.`;
    try {
        const text = await callClaude(prompt, 300);
        res.json({ suggestions: text.trim() });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'AI suggestion failed';
        res.status(503).json({ error: msg });
    }
});
exports.default = router;
//# sourceMappingURL=ai.js.map