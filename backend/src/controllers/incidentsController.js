const { asyncHandler } = require('../middleware/errorHandler');
const Incident = require('../models/Incident');
const Notification = require('../models/Notification');
const AuditService = require('../services/AuditService');

exports.getAll = asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, status, severity, incident_type } = req.query;
  const filters = {};
  if (status) filters.status = status;
  if (severity) filters.severity = severity;
  if (incident_type) filters.incident_type = incident_type;
  if (req.user.role === 'EMPLOYEE' || req.user.role === 'USER') {
    filters.reported_by = req.user.id;
  }

  const incidents = await Incident.findAll(filters, parseInt(limit), parseInt(offset));
  res.json({ success: true, data: incidents });
});

exports.getById = asyncHandler(async (req, res) => {
  const incident = await Incident.findById(parseInt(req.params.id));
  if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });
  res.json({ success: true, data: incident });
});

exports.create = asyncHandler(async (req, res) => {
  const { incident_type, severity, title, description, trip_id, booking_id, latitude, longitude } = req.body;
  if (!incident_type || !title) {
    return res.status(400).json({ success: false, error: 'incident_type and title are required' });
  }

  const incident = await Incident.create({
    reported_by: req.user.id, incident_type, severity, title, description,
    trip_id, booking_id, latitude, longitude
  });

  // For SOS, notify admins immediately
  if (incident_type === 'SOS') {
    if (req.io) {
      req.io.to('HR_ADMIN').to('ADMIN').to('SECURITY').emit('sos_alert', {
        incident_id: incident.id, incident_ref: incident.incident_ref,
        reporter: req.user.name, severity: 'CRITICAL',
        latitude, longitude, title
      });
    }
  }

  await AuditService.log({
    user_id: req.user.id, action: 'INCIDENT_REPORT', entity_type: 'incident',
    entity_id: incident.id, new_values: { incident_type, severity, title }, ip_address: req.ip
  });

  res.status(201).json({ success: true, data: incident });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status, resolution } = req.body;
  if (!status) return res.status(400).json({ success: false, error: 'status is required' });

  const incident = await Incident.updateStatus(parseInt(req.params.id), status, req.user.id, resolution);
  if (!incident) return res.status(404).json({ success: false, error: 'Incident not found' });

  if (incident.reported_by) {
    await Notification.create({
      user_id: incident.reported_by,
      type: 'INCIDENT_UPDATE',
      title: `Incident ${status.toLowerCase()}`,
      message: `Your incident "${incident.title}" has been ${status.toLowerCase()}`,
      data: { incidentId: incident.id }
    });
  }

  res.json({ success: true, data: incident });
});

exports.sos = asyncHandler(async (req, res) => {
  const { latitude, longitude, trip_id, description } = req.body;

  const incident = await Incident.create({
    reported_by: req.user.id,
    incident_type: 'SOS',
    severity: 'CRITICAL',
    title: `SOS Alert from ${req.user.name}`,
    description: description || 'Emergency SOS triggered',
    trip_id, latitude, longitude
  });

  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').to('SECURITY').emit('sos_alert', {
      incident_id: incident.id, reporter: req.user.name,
      latitude, longitude, trip_id, severity: 'CRITICAL'
    });
  }

  res.status(201).json({ success: true, data: incident, message: 'SOS alert sent' });
});
