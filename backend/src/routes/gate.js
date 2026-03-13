const express = require('express');
const router = express.Router();
const gateController = require('../controllers/gateController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('SECURITY', 'HR_ADMIN', 'ADMIN'));

router.post('/check-in', gateController.checkIn);
router.post('/check-out', gateController.checkOut);
router.get('/logs', gateController.getLogs);
router.get('/search', gateController.searchTrips);
router.post('/exception', gateController.logException);

module.exports = router;
