const { asyncHandler } = require('../middleware/errorHandler');
const GateLog = require('../models/GateLog');
const AuditService = require('../services/AuditService');

exports.checkIn = asyncHandler(async (req, res) => {
  const { vehicle_number, gate_code, trip_id, booking_id, employee_id, driver_id, vehicle_id, notes } = req.body;
  if (!vehicle_number || !gate_code) {
    return res.status(400).json({ success: false, error: 'vehicle_number and gate_code are required' });
  }

  const log = await GateLog.create({
    trip_id, booking_id, vehicle_id, driver_id, employee_id,
    gate_code, action_type: 'CHECK_IN', vehicle_number,
    verification_status: 'VERIFIED', notes, logged_by: req.user.id
  });

  await AuditService.log({
    user_id: req.user.id, action: 'GATE_CHECK_IN', entity_type: 'gate_log',
    entity_id: log.id, new_values: { vehicle_number, gate_code }, ip_address: req.ip
  });

  if (req.io) {
    req.io.to('SECURITY').to('HR_ADMIN').to('ADMIN').emit('gate_activity', {
      id: log.id, action: 'CHECK_IN', vehicle_number, gate_code
    });
  }

  res.status(201).json({ success: true, data: log });
});

exports.checkOut = asyncHandler(async (req, res) => {
  const { vehicle_number, gate_code, trip_id, booking_id, notes } = req.body;
  if (!vehicle_number || !gate_code) {
    return res.status(400).json({ success: false, error: 'vehicle_number and gate_code are required' });
  }

  const log = await GateLog.create({
    trip_id, booking_id, gate_code, action_type: 'CHECK_OUT',
    vehicle_number, verification_status: 'VERIFIED', notes, logged_by: req.user.id
  });

  res.status(201).json({ success: true, data: log });
});

exports.getLogs = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, gate_code, vehicle_number, date, action_type } = req.query;
  const logs = await GateLog.findAll(
    { gate_code, vehicle_number, date, action_type },
    parseInt(limit), parseInt(offset)
  );
  res.json({ success: true, data: logs });
});

exports.searchTrips = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ success: false, error: 'Search query too short' });
  const results = await GateLog.searchTrips(q);
  res.json({ success: true, data: results });
});

exports.logException = asyncHandler(async (req, res) => {
  const { vehicle_number, gate_code, notes } = req.body;
  const log = await GateLog.create({
    gate_code: gate_code || 'MAIN', action_type: 'CHECK_IN',
    vehicle_number, verification_status: 'EXCEPTION',
    notes: notes || 'Exception logged by security', logged_by: req.user.id
  });
  res.status(201).json({ success: true, data: log });
});
