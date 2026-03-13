const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookingsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', bookingsController.getAll);
router.get('/my', bookingsController.getMyBookings);
router.get('/my/stats', bookingsController.getMyStats);
router.get('/:id', bookingsController.getById);

router.post('/', bookingsController.create);
router.put('/:id', bookingsController.update);
router.delete('/:id', bookingsController.delete);

router.post('/:id/cancel', bookingsController.cancel);
router.post('/:id/approve', authorize('HR_ADMIN', 'ADMIN'), bookingsController.approve);
router.post('/:id/reject', authorize('HR_ADMIN', 'ADMIN'), bookingsController.reject);
router.post('/:id/assign', authorize('HR_ADMIN', 'ADMIN'), bookingsController.assign);

module.exports = router;
