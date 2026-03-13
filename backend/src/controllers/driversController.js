const { asyncHandler } = require('../middleware/errorHandler');
const Driver = require('../models/Driver');

exports.getAll = asyncHandler(async (req, res) => {
  const { availability_status, vendor_id } = req.query;
  const drivers = await Driver.findAll({ availability_status, vendor_id });
  res.json({ success: true, data: drivers });
});

exports.getById = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(parseInt(req.params.id));
  if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
  res.json({ success: true, data: driver });
});

exports.getMyProfile = asyncHandler(async (req, res) => {
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Driver profile not found' });
  res.json({ success: true, data: driver });
});

exports.create = asyncHandler(async (req, res) => {
  const driver = await Driver.create(req.body);
  res.status(201).json({ success: true, data: driver });
});

exports.update = asyncHandler(async (req, res) => {
  const driver = await Driver.update(parseInt(req.params.id), req.body);
  if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
  res.json({ success: true, data: driver });
});

exports.toggleAvailability = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['ONLINE', 'OFFLINE', 'ON_BREAK'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Driver profile not found' });

  const updated = await Driver.updateAvailability(driver.id, status);

  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').emit('driver_status_change', {
      driver_id: driver.id, driver_name: driver.name, status
    });
  }

  res.json({ success: true, data: updated });
});

exports.getOnline = asyncHandler(async (req, res) => {
  const drivers = await Driver.getOnlineDrivers();
  res.json({ success: true, data: drivers });
});

exports.delete = asyncHandler(async (req, res) => {
  await Driver.delete(parseInt(req.params.id));
  res.json({ success: true, message: 'Driver deactivated' });
});
