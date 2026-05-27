"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadGooglePhotosItem = exports.listGooglePhotosMediaItems = exports.listGooglePhotosAlbums = void 0;
const axios_1 = __importDefault(require("axios"));
const BASE = 'https://photoslibrary.googleapis.com/v1';
const authHeaders = (accessToken) => ({ Authorization: `Bearer ${accessToken}` });
const listGooglePhotosAlbums = async (accessToken, pageSize = 25, pageToken) => {
    const res = await axios_1.default.get(`${BASE}/albums`, {
        headers: authHeaders(accessToken),
        params: { pageSize: Math.min(Math.max(pageSize, 1), 50), pageToken },
        timeout: 15000,
    });
    return { albums: res.data.albums ?? [], nextPageToken: res.data.nextPageToken };
};
exports.listGooglePhotosAlbums = listGooglePhotosAlbums;
const listGooglePhotosMediaItems = async (accessToken, opts) => {
    const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
    const res = await axios_1.default.post(`${BASE}/mediaItems:search`, {
        albumId: opts.albumId,
        pageSize,
        pageToken: opts.pageToken,
    }, {
        headers: authHeaders(accessToken),
        timeout: 20000,
    });
    return { items: res.data.mediaItems ?? [], nextPageToken: res.data.nextPageToken };
};
exports.listGooglePhotosMediaItems = listGooglePhotosMediaItems;
const downloadGooglePhotosItem = async (accessToken, item) => {
    const dlUrl = `${item.baseUrl}=d`;
    const res = await axios_1.default.get(dlUrl, {
        headers: authHeaders(accessToken),
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 120 * 1024 * 1024,
        maxBodyLength: 120 * 1024 * 1024,
    });
    return Buffer.from(res.data);
};
exports.downloadGooglePhotosItem = downloadGooglePhotosItem;
//# sourceMappingURL=googlePhotos.js.map