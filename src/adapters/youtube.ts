import axios from 'axios';

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

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export const listYouTubeChannels = async (accessToken: string): Promise<YouTubeChannel[]> => {
  const res = await axios.get<{
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
  }>('https://www.googleapis.com/youtube/v3/channels', {
    headers: authHeaders(accessToken),
    params: { part: 'snippet', mine: true },
    timeout: 15000,
  });

  return (res.data.items ?? [])
    .map(i => ({ id: String(i.id || ''), title: String(i.snippet?.title || 'YouTube Channel') }))
    .filter(i => Boolean(i.id));
};

export const uploadYouTubeVideo = async (
  accessToken: string,
  fileBuffer: Buffer,
  mimeType: string,
  input: YouTubePublishInput,
): Promise<{ videoId: string; videoUrl: string }> => {
  const snippetTitle = input.title.trim().slice(0, 100) || 'Untitled Upload';
  const snippetDescription = (input.description || '').trim().slice(0, 5000);
  const tags = input.isShort ? ['Shorts'] : undefined;

  const session = await axios.post(
    'https://www.googleapis.com/upload/youtube/v3/videos',
    {
      snippet: {
        title: snippetTitle,
        description: snippetDescription,
        categoryId: '20',
        tags,
      },
      status: {
        privacyStatus: input.visibility,
      },
    },
    {
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileBuffer.length),
      },
      params: { uploadType: 'resumable', part: 'snippet,status' },
      timeout: 30000,
    },
  );

  const uploadUrl = String(session.headers.location || '');
  if (!uploadUrl) throw new Error('YouTube upload session did not return a resumable URL');

  const uploadRes = await axios.put<{ id?: string }>(uploadUrl, fileBuffer, {
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
  if (!videoId) throw new Error('YouTube upload succeeded but no video id was returned');

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
};
