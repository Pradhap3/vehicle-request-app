const { asyncHandler } = require('../middleware/errorHandler');
const Vendor = require('../models/Vendor');

exports.getAll = asyncHandler(async (req, res) => {
  const vendors = await Vendor.findAll();
  res.json({ success: true, data: vendors });
});

exports.getById = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(parseInt(req.params.id));
  if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

exports.create = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Vendor name is required' });
  const vendor = await Vendor.create(req.body);
  res.status(201).json({ success: true, data: vendor });
});

exports.update = asyncHandler(async (req, res) => {
  const vendor = await Vendor.update(parseInt(req.params.id), req.body);
  if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
  res.json({ success: true, data: vendor });
});

exports.delete = asyncHandler(async (req, res) => {
  await Vendor.delete(parseInt(req.params.id));
  res.json({ success: true, message: 'Vendor deactivated' });
});
