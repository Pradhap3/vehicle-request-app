export const APP_NAME = 'AISIN Fleet';
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://vehicle-request-app.onrender.com';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || API_URL;

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  HR_ADMIN: 'HR Admin',
  DRIVER: 'Driver',
  CAB_DRIVER: 'Driver',
  EMPLOYEE: 'Employee',
  USER: 'Employee',
  SECURITY: 'Security'
};
