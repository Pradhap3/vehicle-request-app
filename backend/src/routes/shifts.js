const express = require('express');
const router = express.Router();
const shiftsController = require('../controllers/shiftsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', shiftsController.getAll);
router.get('/:id', shiftsController.getById);
router.post('/', authorize('HR_ADMIN', 'ADMIN'), shiftsController.create);
router.put('/:id', authorize('HR_ADMIN', 'ADMIN'), shiftsController.update);
router.delete('/:id', authorize('HR_ADMIN', 'ADMIN'), shiftsController.delete);

module.exports = router;
