export const APP_NAME = 'AISIN Fleet';

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  HR_ADMIN: 'HR Admin',
  DRIVER: 'Driver',
  CAB_DRIVER: 'Driver',
  EMPLOYEE: 'Employee',
  USER: 'Employee',
  SECURITY: 'Security'
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || role || 'User';
