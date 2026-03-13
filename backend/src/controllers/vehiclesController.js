const { asyncHandler } = require('../middleware/errorHandler');
const Vehicle = require('../models/Vehicle');

exports.getAll = asyncHandler(async (req, res) => {
  const { vendor_id, vehicle_type } = req.query;
  const vehicles = await Vehicle.findAll({ vendor_id, vehicle_type });
  res.json({ success: true, data: vehicles });
});

exports.getById = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(parseInt(req.params.id));
  if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
  res.json({ success: true, data: vehicle });
});

exports.getAvailable = asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.getAvailable();
  res.json({ success: true, data: vehicles });
});

exports.create = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.create(req.body);
  res.status(201).json({ success: true, data: vehicle });
});

exports.update = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.update(parseInt(req.params.id), req.body);
  if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
  res.json({ success: true, data: vehicle });
});

exports.delete = asyncHandler(async (req, res) => {
  await Vehicle.delete(parseInt(req.params.id));
  res.json({ success: true, message: 'Vehicle deleted' });
});
