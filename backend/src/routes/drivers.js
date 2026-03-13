const express = require('express');
const router = express.Router();
const driversController = require('../controllers/driversController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', authorize('HR_ADMIN', 'ADMIN'), driversController.getAll);
router.get('/online', authorize('HR_ADMIN', 'ADMIN'), driversController.getOnline);
router.get('/me', authorize('CAB_DRIVER', 'DRIVER'), driversController.getMyProfile);
router.get('/:id', authorize('HR_ADMIN', 'ADMIN'), driversController.getById);
router.post('/', authorize('HR_ADMIN', 'ADMIN'), driversController.create);
router.put('/:id', authorize('HR_ADMIN', 'ADMIN'), driversController.update);
router.post('/availability', authorize('CAB_DRIVER', 'DRIVER'), driversController.toggleAvailability);
router.delete('/:id', authorize('HR_ADMIN', 'ADMIN'), driversController.delete);

module.exports = router;
