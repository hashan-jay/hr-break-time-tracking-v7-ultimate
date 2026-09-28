import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api'),
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hr_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path.startsWith('/app')) {
        localStorage.removeItem('hr_token');
        localStorage.removeItem('hr_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error, fallback = 'Request failed.') {
  const data = error?.response?.data;
  if (!data) {
    if (error?.code === 'ECONNABORTED') return 'The server took too long to respond.';
    if (error?.message === 'Network Error') return 'Cannot reach the API. Confirm the backend is running on port 5086.';
    return error?.message || fallback;
  }
  if (typeof data === 'string' && data.trim()) return data;
  if (data.message) return data.message;
  if (data.detail) return data.detail;
  if (data.title) return data.title;
  if (data.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors).flat().find(Boolean);
    if (first) return String(first);
  }
  return fallback;
}

export default api;
