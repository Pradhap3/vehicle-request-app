const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('HR_ADMIN', 'ADMIN'));

router.get('/trips/summary', reportsController.tripSummary);
router.get('/trips/daily', reportsController.dailyBreakdown);
router.get('/drivers', reportsController.driverPerformance);
router.get('/vehicles', reportsController.vehicleUtilization);
router.get('/employees', reportsController.employeeUsage);
router.get('/shifts', reportsController.shiftReport);
router.get('/routes', reportsController.routeReport);
router.get('/incidents', reportsController.incidentReport);
router.get('/export/:type', reportsController.exportCSV);

module.exports = router;
