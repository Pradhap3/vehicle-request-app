const express = require('express');
const router = express.Router();
const tripsController = require('../controllers/tripsControllerV2');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Admin/HR trip management
router.get('/', authorize('HR_ADMIN', 'ADMIN'), tripsController.getAll);
router.get('/locations', authorize('HR_ADMIN', 'ADMIN'), tripsController.getAllDriverLocations);
router.get('/:id', tripsController.getById);
router.get('/:id/timeline', tripsController.getTimeline);
router.get('/:id/trail', tripsController.getTrail);

// Driver trip actions
router.get('/driver/today', authorize('CAB_DRIVER', 'DRIVER'), tripsController.getDriverToday);
router.post('/:id/en-route', authorize('CAB_DRIVER', 'DRIVER'), tripsController.startEnRoute);
router.post('/:id/arrived', authorize('CAB_DRIVER', 'DRIVER'), tripsController.markArrived);
router.post('/:id/pickup', authorize('CAB_DRIVER', 'DRIVER'), tripsController.pickupPassenger);
router.post('/:id/start', authorize('CAB_DRIVER', 'DRIVER'), tripsController.startTrip);
router.post('/:id/complete', authorize('CAB_DRIVER', 'DRIVER'), tripsController.completeTrip);
router.post('/:id/cancel', tripsController.cancelTrip);
router.post('/:id/no-show', authorize('CAB_DRIVER', 'DRIVER', 'HR_ADMIN', 'ADMIN'), tripsController.markNoShow);
router.post('/:id/escalate', tripsController.escalate);

// Employee trips
router.get('/employee/my', authorize('EMPLOYEE', 'USER'), tripsController.getEmployeeTrips);

// Location updates
router.post('/location/update', authorize('CAB_DRIVER', 'DRIVER'), tripsController.updateLocation);

module.exports = router;
