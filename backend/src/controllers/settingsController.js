const { asyncHandler } = require('../middleware/errorHandler');
const Setting = require('../models/Setting');
const AuditService = require('../services/AuditService');

exports.getAll = asyncHandler(async (req, res) => {
  const settings = await Setting.getAll();
  res.json({ success: true, data: settings });
});

exports.getByCategory = asyncHandler(async (req, res) => {
  const settings = await Setting.getByCategory(req.params.category);
  res.json({ success: true, data: settings });
});

exports.update = asyncHandler(async (req, res) => {
  const { settings } = req.body;
  if (!Array.isArray(settings)) {
    return res.status(400).json({ success: false, error: 'settings must be an array of {category, key_name, value}' });
  }

  await Setting.bulkSet(settings, req.user.id);

  await AuditService.log({
    user_id: req.user.id, action: 'SETTINGS_UPDATE', entity_type: 'settings',
    new_values: settings, ip_address: req.ip
  });

  res.json({ success: true, message: 'Settings updated' });
});
