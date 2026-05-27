import axios, { AxiosHeaders } from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

const readStudioId = (): string => {
  try {
    return localStorage.getItem('mediafox_studio') ?? '';
  } catch {
    return '';
  }
};

let currentStudioId: string = readStudioId();
let csrfToken: string | null = null;

export const setStudioId = (id: string): void => {
  currentStudioId = id;
  try {
    localStorage.setItem('mediafox_studio', id);
  } catch {
    // Ignore storage write failures so app can still function in restricted contexts.
  }
};

export const getStudioId = (): string => currentStudioId;

const safeMethods = new Set(['get', 'head', 'options']);

const fetchCsrfToken = async (): Promise<string | null> => {
  if (csrfToken) return csrfToken;
  try {
    const r = await api.get<{ csrfToken: string }>('/auth/csrf');
    csrfToken = r.data?.csrfToken || null;
    return csrfToken;
  } catch { return null; }
};

export const initializeCsrfToken = async (): Promise<void> => {
  await fetchCsrfToken();
};

export const clearCsrfToken = (): void => { csrfToken = null; };

api.interceptors.request.use(async cfg => {
  if (currentStudioId) {
    const headers = AxiosHeaders.from(cfg.headers);
    headers.set('x-studio-id', currentStudioId);
    cfg.headers = headers;
  }

  const method = (cfg.method || 'get').toLowerCase();
  if (safeMethods.has(method)) return cfg;

  const token = csrfToken || (await fetchCsrfToken());
  if (token) {
    const headers = AxiosHeaders.from(cfg.headers);
    headers.set('x-csrf-token', token);
    cfg.headers = headers;
  }
  return cfg;
});
