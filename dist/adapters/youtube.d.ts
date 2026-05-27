export interface YouTubeChannel {
    id: string;
    title: string;
}
export interface YouTubePublishInput {
    title: string;
    description?: string;
    visibility: 'private' | 'unlisted' | 'public';
    isShort?: boolean;
}
export declare const listYouTubeChannels: (accessToken: string) => Promise<YouTubeChannel[]>;
export declare const uploadYouTubeVideo: (accessToken: string, fileBuffer: Buffer, mimeType: string, input: YouTubePublishInput) => Promise<{
    videoId: string;
    videoUrl: string;
}>;
//# sourceMappingURL=youtube.d.ts.map