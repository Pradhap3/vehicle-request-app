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
  logout: () => api.post('/auth/logout'),
  updateProfile: (payload) => api.put('/auth/profile', payload)
};

export const driverApi = {
  dashboard: () => api.get('/driver/dashboard'),
  updateLocation: (coords) => api.post('/cabs/location', coords),
  availability: (status) => api.post('/v2/drivers/availability', { status }),
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

export const transportApi = {
  profile: () => api.get('/transport/profile'),
  saveProfile: (payload) => api.put('/transport/profile', payload),
  todayTrip: () => api.get('/transport/today-trip')
};

export const tripApiV2 = {
  driverToday: () => api.get('/v2/trips/driver/today'),
  employeeTrips: (params) => api.get('/v2/trips/employee/my', { params }),
  getById: (id) => api.get(`/v2/trips/${id}`),
  timeline: (id) => api.get(`/v2/trips/${id}/timeline`),
  trail: (id) => api.get(`/v2/trips/${id}/trail`),
  enRoute: (id, payload) => api.post(`/v2/trips/${id}/en-route`, payload),
  arrived: (id, payload) => api.post(`/v2/trips/${id}/arrived`, payload),
  pickup: (id, payload) => api.post(`/v2/trips/${id}/pickup`, payload),
  start: (id, payload) => api.post(`/v2/trips/${id}/start`, payload),
  complete: (id, payload) => api.post(`/v2/trips/${id}/complete`, payload),
  cancel: (id, notes) => api.post(`/v2/trips/${id}/cancel`, { notes }),
  noShow: (id, notes) => api.post(`/v2/trips/${id}/no-show`, { notes }),
  escalate: (id, notes) => api.post(`/v2/trips/${id}/escalate`, { notes }),
  updateLocation: (payload) => api.post('/v2/trips/location/update', payload)
};

export const incidentApi = {
  sos: (payload) => api.post('/v2/incidents/sos', payload)
};

export default api;
