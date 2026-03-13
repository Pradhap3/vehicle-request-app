const express = require('express');
const router = express.Router();
const vehiclesController = require('../controllers/vehiclesController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', vehiclesController.getAll);
router.get('/available', vehiclesController.getAvailable);
router.get('/:id', vehiclesController.getById);
router.post('/', authorize('HR_ADMIN', 'ADMIN'), vehiclesController.create);
router.put('/:id', authorize('HR_ADMIN', 'ADMIN'), vehiclesController.update);
router.delete('/:id', authorize('HR_ADMIN', 'ADMIN'), vehiclesController.delete);

module.exports = router;
