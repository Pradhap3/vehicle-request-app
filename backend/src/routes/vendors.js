const express = require('express');
const router = express.Router();
const vendorsController = require('../controllers/vendorsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('HR_ADMIN', 'ADMIN'));

router.get('/', vendorsController.getAll);
router.get('/:id', vendorsController.getById);
router.post('/', vendorsController.create);
router.put('/:id', vendorsController.update);
router.delete('/:id', vendorsController.delete);

module.exports = router;
