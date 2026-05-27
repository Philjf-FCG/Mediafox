"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadYouTubeVideo = exports.listYouTubeChannels = void 0;
const axios_1 = __importDefault(require("axios"));
const authHeaders = (accessToken) => ({ Authorization: `Bearer ${accessToken}` });
const listYouTubeChannels = async (accessToken) => {
    const res = await axios_1.default.get('https://www.googleapis.com/youtube/v3/channels', {
        headers: authHeaders(accessToken),
        params: { part: 'snippet', mine: true },
        timeout: 15000,
    });
    return (res.data.items ?? [])
        .map(i => ({ id: String(i.id || ''), title: String(i.snippet?.title || 'YouTube Channel') }))
        .filter(i => Boolean(i.id));
};
exports.listYouTubeChannels = listYouTubeChannels;
const uploadYouTubeVideo = async (accessToken, fileBuffer, mimeType, input) => {
    const snippetTitle = input.title.trim().slice(0, 100) || 'Untitled Upload';
    const snippetDescription = (input.description || '').trim().slice(0, 5000);
    const tags = input.isShort ? ['Shorts'] : undefined;
    const session = await axios_1.default.post('https://www.googleapis.com/upload/youtube/v3/videos', {
        snippet: {
            title: snippetTitle,
            description: snippetDescription,
            categoryId: '20',
            tags,
        },
        status: {
            privacyStatus: input.visibility,
        },
    }, {
        headers: {
            ...authHeaders(accessToken),
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': mimeType,
            'X-Upload-Content-Length': String(fileBuffer.length),
        },
        params: { uploadType: 'resumable', part: 'snippet,status' },
        timeout: 30000,
    });
    const uploadUrl = String(session.headers.location || '');
    if (!uploadUrl)
        throw new Error('YouTube upload session did not return a resumable URL');
    const uploadRes = await axios_1.default.put(uploadUrl, fileBuffer, {
        headers: {
            ...authHeaders(accessToken),
            'Content-Type': mimeType,
            'Content-Length': String(fileBuffer.length),
        },
        timeout: 300000,
        maxContentLength: 512 * 1024 * 1024,
        maxBodyLength: 512 * 1024 * 1024,
    });
    const videoId = String(uploadRes.data?.id || '');
    if (!videoId)
        throw new Error('YouTube upload succeeded but no video id was returned');
    return {
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
};
exports.uploadYouTubeVideo = uploadYouTubeVideo;
//# sourceMappingURL=youtube.js.map