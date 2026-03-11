import axios from 'axios';
import { API_URL } from '../constants/app';
import { authStorage } from '../storage/authStorage';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(async (config) => {
  const session = await authStorage.load();
  if (session.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

export const authApi = {
  login: (identifier, password) => api.post('/auth/login', { identifier, email: identifier, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout')
};

export const driverApi = {
  dashboard: () => api.get('/driver/dashboard'),
  updateLocation: (coords) => api.post('/cabs/location', coords),
  markBoarded: (requestId, payload) => api.post(`/requests/${requestId}/board`, payload),
  markDropped: (requestId, payload) => api.post(`/requests/${requestId}/drop`, payload),
  markNoShow: (requestId, payload) => api.post(`/requests/${requestId}/no-show`, payload || {}),
  logCallAttempt: (requestId, payload) => api.post(`/requests/${requestId}/call-attempt`, payload)
};

export const securityApi = {
  scanVehicle: (payload) => api.post('/security/gate/scan', payload),
  logs: (params) => api.get('/security/gate/logs', { params })
};

export const employeeApi = {
  myTrips: () => api.get('/employee/trips'),
  myTracking: () => api.get('/transport/tracking')
};

export default api;
