const { asyncHandler } = require('../middleware/errorHandler');
const Shift = require('../models/Shift');

exports.getAll = asyncHandler(async (req, res) => {
  const shifts = await Shift.findAll();
  res.json({ success: true, data: shifts });
});

exports.getById = asyncHandler(async (req, res) => {
  const shift = await Shift.findById(parseInt(req.params.id));
  if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });
  res.json({ success: true, data: shift });
});

exports.create = asyncHandler(async (req, res) => {
  const { shift_code, name, start_time, end_time } = req.body;
  if (!shift_code || !name || !start_time || !end_time) {
    return res.status(400).json({ success: false, error: 'shift_code, name, start_time, and end_time are required' });
  }
  const shift = await Shift.create(req.body);
  res.status(201).json({ success: true, data: shift });
});

exports.update = asyncHandler(async (req, res) => {
  const shift = await Shift.update(parseInt(req.params.id), req.body);
  if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });
  res.json({ success: true, data: shift });
});

exports.delete = asyncHandler(async (req, res) => {
  await Shift.delete(parseInt(req.params.id));
  res.json({ success: true, message: 'Shift deleted' });
});
