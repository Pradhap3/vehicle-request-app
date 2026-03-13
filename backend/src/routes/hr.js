const express = require('express');
const router = express.Router();
const hrController = require('../controllers/hrController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('HR_ADMIN', 'ADMIN'));

router.get('/dashboard', hrController.getDashboard);
router.get('/roster', hrController.getEmployeeRoster);
router.get('/shift-transport', hrController.getShiftTransportView);
router.get('/compliance', hrController.getComplianceReport);
router.get('/safety', hrController.getSafetyDashboard);

module.exports = router;
