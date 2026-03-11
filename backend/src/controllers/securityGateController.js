const Cab = require('../models/Cab');
const SecurityGateLog = require('../models/SecurityGateLog');
const Trip = require('../models/Trip');
const CabRequest = require('../models/CabRequest');
const logger = require('../utils/logger');

exports.scanVehicle = async (req, res) => {
  try {
    const { plate_number, gate_code, event_type = 'ENTRY' } = req.body;
    if (!plate_number || !gate_code) {
      return res.status(400).json({ success: false, error: 'plate_number and gate_code are required' });
    }

    const cabs = await Cab.findAll();
    const cab = cabs.find((row) => String(row.cab_number || '').trim().toLowerCase() === String(plate_number).trim().toLowerCase());
    let decision = 'MANUAL_REVIEW';
    let reason = 'Vehicle exists but no active trip or manifest found';
    let trip = null;
    let manifest = [];
    let activeRequests = [];

    if (!cab) {
      decision = 'DENY';
      reason = 'Unauthorized vehicle';
    } else {
      trip = await Trip.findActiveForCab(cab.id);
      if (!trip && cab.driver_id) {
        const trips = await Trip.findTodayByDriver(cab.driver_id);
        trip = trips.find((row) => ['PLANNED', 'ASSIGNED', 'IN_PROGRESS'].includes(String(row.status || '').toUpperCase())) || null;
      }
      if (trip) {
        manifest = await Trip.findManifestByTripId(trip.id);
      }
      activeRequests = await CabRequest.getAssignedRequestsForCab(cab.id, new Date().toISOString().slice(0, 10));

      if (manifest.length > 0 || activeRequests.length > 0) {
        decision = 'ALLOW';
        reason = manifest.length > 0
          ? `Approved vehicle with active manifest (${manifest.length} passengers)`
          : `Approved vehicle with ${activeRequests.length} assigned request(s)`;
      } else if (cab.status && ['MAINTENANCE', 'OFF_DUTY'].includes(String(cab.status).toUpperCase())) {
        decision = 'DENY';
        reason = `Vehicle is currently ${cab.status}`;
      }
    }

    const log = await SecurityGateLog.create({
      cab_id: cab?.id || null,
      trip_id: trip?.id || null,
      plate_number,
      gate_code,
      event_type,
      decision,
      reason,
      scanned_by_user_id: req.user?.id || null
    });

    res.json({
      success: true,
      data: {
        decision,
        reason,
        cab,
        trip,
        manifestSummary: {
          totalPassengers: manifest.length || activeRequests.length,
          boarded: manifest.filter((row) => row.is_boarded).length,
          dropped: manifest.filter((row) => row.is_dropped).length,
          noShow: manifest.filter((row) => row.no_show).length
        },
        manifest: manifest.length > 0 ? manifest : activeRequests,
        log
      }
    });
  } catch (error) {
    logger.error('Security gate scan error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate vehicle at gate' });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const logs = await SecurityGateLog.findRecent(Number.parseInt(req.query.limit || '100', 10));
    res.json({ success: true, data: logs });
  } catch (error) {
    logger.error('Get security gate logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch security gate logs' });
  }
};
