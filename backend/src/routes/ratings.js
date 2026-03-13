const express = require('express');
const router = express.Router();
const ratingsController = require('../controllers/ratingsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', authorize('HR_ADMIN', 'ADMIN'), ratingsController.getAll);
router.post('/', ratingsController.create);
router.get('/trip/:tripId', ratingsController.getByTrip);
router.get('/driver/:driverId', ratingsController.getByDriver);
router.get('/driver/:driverId/stats', ratingsController.getDriverStats);

module.exports = router;
