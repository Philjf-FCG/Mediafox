import axios from 'axios';

const BASE = 'https://photoslibrary.googleapis.com/v1';

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

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export const listGooglePhotosAlbums = async (
  accessToken: string,
  pageSize = 25,
  pageToken?: string,
): Promise<{ albums: GooglePhotosAlbum[]; nextPageToken?: string }> => {
  const res = await axios.get<{ albums?: GooglePhotosAlbum[]; nextPageToken?: string }>(
    `${BASE}/albums`,
    {
      headers: authHeaders(accessToken),
      params: { pageSize: Math.min(Math.max(pageSize, 1), 50), pageToken },
      timeout: 15000,
    },
  );

  return { albums: res.data.albums ?? [], nextPageToken: res.data.nextPageToken };
};

export const listGooglePhotosMediaItems = async (
  accessToken: string,
  opts: { albumId?: string; pageSize?: number; pageToken?: string },
): Promise<{ items: GooglePhotosMediaItem[]; nextPageToken?: string }> => {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);

  const res = await axios.post<{ mediaItems?: GooglePhotosMediaItem[]; nextPageToken?: string }>(
    `${BASE}/mediaItems:search`,
    {
      albumId: opts.albumId,
      pageSize,
      pageToken: opts.pageToken,
    },
    {
      headers: authHeaders(accessToken),
      timeout: 20000,
    },
  );

  return { items: res.data.mediaItems ?? [], nextPageToken: res.data.nextPageToken };
};

export const downloadGooglePhotosItem = async (
  accessToken: string,
  item: GooglePhotosMediaItem,
): Promise<Buffer> => {
  const dlUrl = `${item.baseUrl}=d`;
  const res = await axios.get<ArrayBuffer>(dlUrl, {
    headers: authHeaders(accessToken),
    responseType: 'arraybuffer',
    timeout: 60000,
    maxContentLength: 120 * 1024 * 1024,
    maxBodyLength: 120 * 1024 * 1024,
  });
  return Buffer.from(res.data);
};
