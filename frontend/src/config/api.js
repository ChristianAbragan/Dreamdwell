const FALLBACK_API_BASE_URL = 'http://localhost:5000';

const configuredApiBaseUrl = process.env.REACT_APP_API_BASE_URL;
const browserOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : '';

export const API_BASE_URL =
  configuredApiBaseUrl && configuredApiBaseUrl !== browserOrigin && !configuredApiBaseUrl.startsWith('/')
    ? configuredApiBaseUrl
    : FALLBACK_API_BASE_URL;
