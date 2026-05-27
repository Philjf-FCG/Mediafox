export interface GooglePhotosAlbum {
    id: string;
    title: string;
    mediaItemsCount?: string;
    coverPhotoBaseUrl?: string;
}
export interface GooglePhotosMediaItem {
    id: string;
    filename: string;
    mimeType?: string;
    baseUrl: string;
    mediaMetadata?: {
        width?: string;
        height?: string;
    };
}
export declare const listGooglePhotosAlbums: (accessToken: string, pageSize?: number, pageToken?: string) => Promise<{
    albums: GooglePhotosAlbum[];
    nextPageToken?: string;
}>;
export declare const listGooglePhotosMediaItems: (accessToken: string, opts: {
    albumId?: string;
    pageSize?: number;
    pageToken?: string;
}) => Promise<{
    items: GooglePhotosMediaItem[];
    nextPageToken?: string;
}>;
export declare const downloadGooglePhotosItem: (accessToken: string, item: GooglePhotosMediaItem) => Promise<Buffer>;
//# sourceMappingURL=googlePhotos.d.ts.map