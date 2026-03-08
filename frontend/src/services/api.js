import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { token } = response.data;
          localStorage.setItem('token', token);
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.post('/auth/change-password', data)
};

// User APIs
export const userAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  hardDelete: (id) => api.delete(`/users/${id}/hard`),
  getDrivers: () => api.get('/users/drivers'),
  getEmployees: () => api.get('/users/employees')
};

// Cab APIs
export const cabAPI = {
  getAll: (params) => api.get('/cabs', { params }),
  getById: (id) => api.get(`/cabs/${id}`),
  create: (data) => api.post('/cabs', data),
  update: (id, data) => api.put(`/cabs/${id}`, data),
  delete: (id) => api.delete(`/cabs/${id}`),
  updateLocation: (data) => api.post('/cabs/location', data),
  getLocationHistory: (id, params) => api.get(`/cabs/${id}/location-history`, { params }),
  getAvailable: (params) => api.get('/cabs/available', { params }),
  updateStatus: (id, status) => api.put(`/cabs/${id}/status`, { status }),
  getDriverDashboard: () => api.get('/driver/dashboard')
};

// Route APIs
export const routeAPI = {
  getAll: (params) => api.get('/routes', { params }),
  getById: (id) => api.get(`/routes/${id}`),
  create: (data) => api.post('/routes', data),
  update: (id, data) => api.put(`/routes/${id}`, data),
  delete: (id) => api.delete(`/routes/${id}`),
  autoAllocate: (id, data) => api.post(`/routes/${id}/auto-allocate`, data),
  checkTraffic: (id) => api.get(`/routes/${id}/traffic`),
  getOptimalDeparture: (id) => api.get(`/routes/${id}/optimal-departure`),
  reassignWaiting: (id, data) => api.post(`/routes/${id}/reassign-waiting`, data)
};

const normalizeRequestDatePayload = (data = {}) => {
  const payload = { ...data };

  const toIsoIfValid = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
      if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return null;
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
    }

    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  };

  const combineDateAndTime = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) return null;

    const dateStr = String(dateValue).trim();
    const timeStr = String(timeValue).trim();
    const timeMatch = timeStr.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!timeMatch) return null;

    const [, hh, mm, ss = '00'] = timeMatch;
    const dmy = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) {
      const [, dd, mo, yy] = dmy;
      return `${yy}-${mo}-${dd}T${hh}:${mm}:${ss}`;
    }

    const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
      const [, yy, mo, dd] = ymd;
      return `${yy}-${mo}-${dd}T${hh}:${mm}:${ss}`;
    }

    return null;
  };

  const combined = combineDateAndTime(payload.pickup_date, payload.pickup_time);
  const normalizedRequestedTime = combined || toIsoIfValid(payload.requested_time) || toIsoIfValid(payload.pickup_time);
  if (normalizedRequestedTime) {
    payload.requested_time = normalizedRequestedTime;
    payload.pickup_time = normalizedRequestedTime;
  }

  const normalizedTravelTime = toIsoIfValid(payload.travel_time) || normalizedRequestedTime;
  if (normalizedTravelTime) {
    payload.travel_time = normalizedTravelTime;
  }

  return payload;
};

// Request APIs
export const requestAPI = {
  getAll: (params) => api.get('/requests', { params }),
  getById: (id) => api.get(`/requests/${id}`),
  create: (data) => api.post('/requests', normalizeRequestDatePayload(data)),
  update: (id, data) => api.put(`/requests/${id}`, normalizeRequestDatePayload(data)),
  delete: (id) => api.delete(`/requests/${id}`),
  assignCab: (id, data) => api.post(`/requests/${id}/assign`, data),
  cancel: (id) => api.post(`/requests/${id}/cancel`),
  markBoarded: (id, data) => api.post(`/requests/${id}/board`, data),
  markDropped: (id, data) => api.post(`/requests/${id}/drop`, data),
  markNoShow: (id) => api.post(`/requests/${id}/no-show`),
  getTodayStats: () => api.get('/requests/stats'),
  getMyRequests: () => api.get('/requests', { params: { my_requests: true } })
};

// Notification APIs
export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getById: (id) => api.get(`/notifications/${id}`),
  markAsRead: (id) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  delete: (id) => api.delete(`/notifications/${id}`),
  deleteRead: () => api.delete('/notifications/read'),
  send: (data) => api.post('/notifications/send', data)
};

// Dashboard APIs
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getCapacity: (params) => api.get('/dashboard/capacity', { params }),
  getTripMetrics: (params) => api.get('/dashboard/trip-metrics', { params }),
  getDriverPerformance: () => api.get('/dashboard/driver-performance')
};

export default api;
