// src/routes/index.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const authController = require('../controllers/authController');
const usersController = require('../controllers/usersController');
const cabsController = require('../controllers/cabsController');
const routesController = require('../controllers/routesController');
const requestsController = require('../controllers/requestsController');
const notificationsController = require('../controllers/notificationsController');
const dashboardController = require('../controllers/dashboardController');
const transportController = require('../controllers/transportController');
const { authenticate, authorize } = require('../middleware/auth');

const isUuidOrInt = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)) ||
  /^\d+$/.test(String(value));

// ==================== AUTH ROUTES ====================
router.post('/auth/login', [
  body('email').optional().isString().trim(),
  body('identifier').optional().isString().trim(),
  body('password').notEmpty()
], authController.login);
router.get('/auth/microsoft/start', authController.getMicrosoftStartUrl);
router.get('/auth/microsoft/callback', authController.microsoftCallback);

router.post('/auth/refresh', authController.refreshToken);

router.get('/auth/me', authenticate, authController.getMe);
router.put('/auth/profile', authenticate, authController.updateProfile);
router.post('/auth/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 })
], authController.changePassword);
router.post('/auth/logout', authenticate, authController.logout);

router.get('/transport/profile',
  authenticate,
  authorize('EMPLOYEE', 'USER'),
  transportController.getMyProfile
);

router.put('/transport/profile',
  authenticate,
  authorize('EMPLOYEE', 'USER'),
  transportController.upsertMyProfile
);

router.get('/transport/today-trip',
  authenticate,
  authorize('EMPLOYEE', 'USER'),
  transportController.getMyTodayTrip
);

router.get('/transport/tracking',
  authenticate,
  authorize('EMPLOYEE', 'USER'),
  transportController.getMyTracking
);

// ==================== USER ROUTES ====================
router.get('/users', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  usersController.getUsers
);

router.get('/users/drivers', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  usersController.getDrivers
);

router.get('/users/employees', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  usersController.getEmployees
);

router.get('/users/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  usersController.getUserById
);

router.post('/users', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  [
    body('employee_id').notEmpty(),
    body('name').notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('department').optional(),
    body('role').isIn(['HR_ADMIN', 'ADMIN', 'EMPLOYEE', 'USER', 'CAB_DRIVER', 'DRIVER']),
    body('password').isLength({ min: 6 })
  ],
  usersController.createUser
);

router.put('/users/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  usersController.updateUser
);

router.delete('/users/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  usersController.deleteUser
);

router.delete('/users/:id/permanent', 
  authenticate, 
  authorize('ADMIN'), 
  usersController.hardDeleteUser
);

// ==================== CAB ROUTES ====================
router.get('/cabs', 
  authenticate, 
  cabsController.getCabs
);

router.get('/cabs/available', 
  authenticate, 
  cabsController.getAvailableCabs
);

router.get('/cabs/:id', 
  authenticate, 
  cabsController.getCabById
);

router.get('/cabs/:id/location-history', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  cabsController.getLocationHistory
);

router.post('/cabs', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  [
    body('cab_number').notEmpty(),
    body('capacity').isInt({ min: 1, max: 50 })
  ],
  cabsController.createCab
);

router.put('/cabs/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  cabsController.updateCab
);

router.delete('/cabs/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  cabsController.deleteCab
);

router.post('/cabs/location', 
  authenticate, 
  authorize('CAB_DRIVER', 'DRIVER'), 
  [
    body('latitude').isFloat(),
    body('longitude').isFloat()
  ],
  cabsController.updateLocation
);

router.put('/cabs/:id/status', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN', 'CAB_DRIVER', 'DRIVER'), 
  cabsController.updateStatus
);

router.get('/driver/dashboard', 
  authenticate, 
  authorize('CAB_DRIVER', 'DRIVER'), 
  cabsController.getDriverDashboard
);

// ==================== ROUTE ROUTES ====================
router.get('/routes', 
  authenticate, 
  routesController.getRoutes
);

router.get('/routes/:id', 
  authenticate, 
  routesController.getRouteById
);

router.post('/routes', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  [
    body('name').notEmpty(),
    body('start_point').notEmpty(),
    body('end_point').notEmpty()
  ],
  routesController.createRoute
);

router.put('/routes/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  routesController.updateRoute
);

router.delete('/routes/:id', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  routesController.deleteRoute
);

router.post('/routes/:id/auto-allocate', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  routesController.autoAllocate
);

router.get('/routes/:id/traffic', 
  authenticate, 
  routesController.checkTraffic
);

router.get('/routes/:id/optimal-departure', 
  authenticate, 
  routesController.getOptimalDeparture
);

router.post('/routes/:id/reassign-waiting', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN', 'CAB_DRIVER', 'DRIVER'), 
  routesController.reassignWaiting
);

// ==================== REQUEST ROUTES ====================
router.get('/requests', 
  authenticate, 
  requestsController.getRequests
);

router.get('/requests/stats', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  requestsController.getTodayStats
);

router.get('/requests/:id', 
  authenticate, 
  requestsController.getRequestById
);

router.post('/requests', 
  authenticate, 
  [
    body('route_id').optional().custom((v) => isUuidOrInt(v)),
    body('pickup_time').optional().isString(),
    body('pickup_date').optional().isString(),
    body('requested_time').optional().isString(),
    body('travel_time').optional().isString(),
    body('pickup_location').optional().isString(),
    body('drop_location').optional().isString()
  ],
  requestsController.createRequest
);

router.put('/requests/:id', 
  authenticate, 
  requestsController.updateRequest
);

router.delete('/requests/:id', 
  authenticate, 
  requestsController.deleteRequest
);

router.post('/requests/:id/assign', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  [
    body('cab_id').custom((v) => isUuidOrInt(v))
  ],
  requestsController.assignCab
);

router.post('/requests/:id/approve',
  authenticate,
  authorize('HR_ADMIN', 'ADMIN'),
  requestsController.approveRequest
);

router.post('/requests/:id/cancel', 
  authenticate, 
  requestsController.cancelRequest
);

router.post('/requests/:id/board', 
  authenticate, 
  authorize('CAB_DRIVER', 'DRIVER'), 
  requestsController.markBoarded
);

router.post('/requests/:id/drop', 
  authenticate, 
  authorize('CAB_DRIVER', 'DRIVER'), 
  requestsController.markDropped
);

router.post('/requests/:id/no-show', 
  authenticate, 
  authorize('CAB_DRIVER', 'DRIVER', 'HR_ADMIN', 'ADMIN'), 
  requestsController.markNoShow
);

router.post('/requests/:id/call-attempt',
  authenticate,
  authorize('CAB_DRIVER', 'DRIVER', 'HR_ADMIN', 'ADMIN'),
  requestsController.logCallAttempt
);

// ==================== NOTIFICATION ROUTES ====================
router.get('/notifications', 
  authenticate, 
  notificationsController.getAll
);

router.get('/notifications/unread-count', 
  authenticate, 
  notificationsController.getUnreadCount
);

router.get('/notifications/:id', 
  authenticate, 
  notificationsController.getById
);

router.post('/notifications/:id/read', 
  authenticate, 
  notificationsController.markAsRead
);

router.post('/notifications/read-all', 
  authenticate, 
  notificationsController.markAllAsRead
);

router.delete('/notifications/:id', 
  authenticate, 
  notificationsController.delete
);

router.delete('/notifications/read', 
  authenticate, 
  notificationsController.deleteRead
);

router.post('/notifications/send', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  [
    body('title').notEmpty(),
    body('message').notEmpty()
  ],
  notificationsController.send
);

// ==================== DASHBOARD ROUTES ====================
router.get('/dashboard/stats', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  dashboardController.getStats
);

router.get('/dashboard/capacity', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  dashboardController.getCapacityAnalytics
);

router.get('/dashboard/trip-metrics', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  dashboardController.getTripMetrics
);

router.get('/dashboard/driver-performance', 
  authenticate, 
  authorize('HR_ADMIN', 'ADMIN'), 
  dashboardController.getDriverPerformance
);

// ==================== HEALTH CHECK ====================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
