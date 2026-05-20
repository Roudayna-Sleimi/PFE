const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getBrowserOrigin = () => {
  if (typeof window === 'undefined') return '';
  return trimTrailingSlash(window.location.origin);
};

const isLocalBrowser = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
};

const isFileProtocol = () => {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'file:';
};

const LOCAL_BACKEND_ORIGIN = 'http://localhost:5000';

const envBackendUrl = trimTrailingSlash(import.meta.env.VITE_BACKEND_URL || '');
const envSocketUrl = trimTrailingSlash(import.meta.env.VITE_SOCKET_URL || '');

export const BACKEND_ORIGIN = envBackendUrl
  || (isFileProtocol() ? LOCAL_BACKEND_ORIGIN : '')
  || (import.meta.env.DEV && isLocalBrowser() ? LOCAL_BACKEND_ORIGIN : getBrowserOrigin());

export const API_BASE_URL = `${BACKEND_ORIGIN}/api`;
export const SOCKET_URL = envSocketUrl || BACKEND_ORIGIN;

export const apiUrl = (path = '') => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const backendUrl = (path = '') => `${BACKEND_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
