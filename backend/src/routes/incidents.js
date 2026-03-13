const express = require('express');
const router = express.Router();
const incidentsController = require('../controllers/incidentsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', incidentsController.getAll);
router.get('/:id', incidentsController.getById);
router.post('/', incidentsController.create);
router.post('/sos', incidentsController.sos);
router.put('/:id/status', authorize('HR_ADMIN', 'ADMIN', 'SECURITY'), incidentsController.updateStatus);

module.exports = router;
