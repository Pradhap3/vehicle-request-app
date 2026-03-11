import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://vehicle-request-app.onrender.com';

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
          const response = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
          const responseData = response.data?.data || response.data;
          const { token } = responseData;
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
  login: (credentials) => api.post('/api/auth/login', credentials),
  getMicrosoftStartUrl: (redirect) => api.get('/api/auth/microsoft/start', { params: { redirect } }),
  logout: () => api.post('/api/auth/logout'),
  getMe: () => api.get('/api/auth/me'),
  updateProfile: (data) => api.put('/api/auth/profile', data),
  changePassword: (data) => api.post('/api/auth/change-password', data)
};

// User APIs
export const userAPI = {
  getAll: (params) => api.get('/api/users', { params }),
  getById: (id) => api.get(`/api/users/${id}`),
  create: (data) => api.post('/api/users', data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  delete: (id) => api.delete(`/api/users/${id}`),
  hardDelete: (id) => api.delete(`/api/users/${id}/permanent`),
  getDrivers: () => api.get('/api/users/drivers'),
  getEmployees: () => api.get('/api/users/employees')
};

// Cab APIs
export const cabAPI = {
  getAll: (params) => api.get('/api/cabs', { params }),
  getById: (id) => api.get(`/api/cabs/${id}`),
  create: (data) => api.post('/api/cabs', data),
  update: (id, data) => api.put(`/api/cabs/${id}`, data),
  delete: (id) => api.delete(`/api/cabs/${id}`),
  updateLocation: (data) => api.post('/api/cabs/location', data),
  getLocationHistory: (id, params) => api.get(`/api/cabs/${id}/location-history`, { params }),
  getAvailable: (params) => api.get('/api/cabs/available', { params }),
  updateStatus: (id, status) => api.put(`/api/cabs/${id}/status`, { status }),
  getDriverDashboard: () => api.get('/api/driver/dashboard')
};

// Route APIs
export const routeAPI = {
  getAll: (params) => api.get('/api/routes', { params }),
  getById: (id) => api.get(`/api/routes/${id}`),
  create: (data) => api.post('/api/routes', data),
  update: (id, data) => api.put(`/api/routes/${id}`, data),
  delete: (id) => api.delete(`/api/routes/${id}`),
  autoAllocate: (id, data) => api.post(`/api/routes/${id}/auto-allocate`, data),
  checkTraffic: (id) => api.get(`/api/routes/${id}/traffic`),
  getOptimalDeparture: (id) => api.get(`/api/routes/${id}/optimal-departure`),
  reassignWaiting: (id, data) => api.post(`/api/routes/${id}/reassign-waiting`, data)
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
  getAll: (params) => api.get('/api/requests', { params }),
  getById: (id) => api.get(`/api/requests/${id}`),
  create: (data) => api.post('/api/requests', normalizeRequestDatePayload(data)),
  update: (id, data) => api.put(`/api/requests/${id}`, normalizeRequestDatePayload(data)),
  delete: (id) => api.delete(`/api/requests/${id}`),
  approve: (id) => api.post(`/api/requests/${id}/approve`),
  assignCab: (id, data) => api.post(`/api/requests/${id}/assign`, data),
  cancel: (id) => api.post(`/api/requests/${id}/cancel`),
  markBoarded: (id, data) => api.post(`/api/requests/${id}/board`, data),
  markDropped: (id, data) => api.post(`/api/requests/${id}/drop`, data),
  markNoShow: (id) => api.post(`/api/requests/${id}/no-show`),
  logCallAttempt: (id, data) => api.post(`/api/requests/${id}/call-attempt`, data),
  getTodayStats: () => api.get('/api/requests/stats'),
  getMyRequests: () => api.get('/api/requests', { params: { my_requests: true } })
};

export const transportAPI = {
  getMyProfile: () => api.get('/api/transport/profile'),
  saveMyProfile: (data) => api.put('/api/transport/profile', data),
  getMyTodayTrip: () => api.get('/api/transport/today-trip'),
  getMyTracking: () => api.get('/api/transport/tracking')
};

// Notification APIs
export const notificationAPI = {
  getAll: (params) => api.get('/api/notifications', { params }),
  getById: (id) => api.get(`/api/notifications/${id}`),
  markAsRead: (id) => api.post(`/api/notifications/${id}/read`),
  markAllAsRead: () => api.post('/api/notifications/read-all'),
  getUnreadCount: () => api.get('/api/notifications/unread-count'),
  delete: (id) => api.delete(`/api/notifications/${id}`),
  deleteRead: () => api.delete('/api/notifications/read'),
  send: (data) => api.post('/api/notifications/send', data)
};

// Dashboard APIs
export const dashboardAPI = {
  getStats: () => api.get('/api/dashboard/stats'),
  getCapacity: (params) => api.get('/api/dashboard/capacity', { params }),
  getTripMetrics: (params) => api.get('/api/dashboard/trip-metrics', { params }),
  getDriverPerformance: () => api.get('/api/dashboard/driver-performance')
};

export const tripAPI = {
  getMyTrips: () => api.get('/api/employee/trips'),
  getDriverTrips: () => api.get('/api/driver/trips')
};

export const securityAPI = {
  scanVehicle: (data) => api.post('/api/security/gate/scan', data),
  getLogs: (params) => api.get('/api/security/gate/logs', { params })
};

export default api;
