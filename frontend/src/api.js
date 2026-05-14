const DEV_API_BASE = 'http://127.0.0.1:5000/api';

export const API_BASE = process.env.NODE_ENV === 'development' ? DEV_API_BASE : '/api';
export const API_ORIGIN = API_BASE.replace(/\/api$/, '');

export const apiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
