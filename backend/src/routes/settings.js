const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('HR_ADMIN', 'ADMIN'));

router.get('/', settingsController.getAll);
router.get('/:category', settingsController.getByCategory);
router.put('/', settingsController.update);

module.exports = router;
