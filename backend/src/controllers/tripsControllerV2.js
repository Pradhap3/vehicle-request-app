const { asyncHandler } = require('../middleware/errorHandler');
const TripStateMachine = require('../services/TripStateMachine');
const TripEvent = require('../models/TripEvent');
const Driver = require('../models/Driver');
const LiveLocation = require('../models/LiveLocation');
const AuditService = require('../services/AuditService');
const logger = require('../utils/logger');

exports.getAll = asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, status, driver_id, date, employee_id } = req.query;
  const filters = {};
  if (status) filters.status = status;
  if (driver_id) filters.driver_id = parseInt(driver_id);
  if (date) filters.date = date;
  if (employee_id) filters.employee_id = parseInt(employee_id);

  const trips = await TripStateMachine.findAll(filters, parseInt(limit), parseInt(offset));
  res.json({ success: true, data: trips });
});

exports.getById = asyncHandler(async (req, res) => {
  const trip = await TripStateMachine.getTrip(parseInt(req.params.id));
  if (!trip) return res.status(404).json({ success: false, error: 'Trip not found' });
  res.json({ success: true, data: trip });
});

exports.getTimeline = asyncHandler(async (req, res) => {
  const events = await TripEvent.findByTripId(parseInt(req.params.id));
  res.json({ success: true, data: events });
});

exports.getTrail = asyncHandler(async (req, res) => {
  const trail = await LiveLocation.getTripTrail(parseInt(req.params.id));
  res.json({ success: true, data: trail });
});

// Driver actions
exports.startEnRoute = asyncHandler(async (req, res) => {
  const { eta_minutes, latitude, longitude } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'DRIVER_EN_ROUTE', req.user.id,
    { eta_minutes, latitude, longitude }
  );
  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').emit('trip_status_update', { trip_id: trip.id, status: 'DRIVER_EN_ROUTE' });
    if (trip.employee_id) req.io.to(`user_${trip.employee_id}`).emit('trip_status_update', { trip_id: trip.id, status: 'DRIVER_EN_ROUTE', eta_minutes });
  }
  res.json({ success: true, data: trip });
});

exports.markArrived = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'ARRIVED', req.user.id,
    { latitude, longitude }
  );
  if (req.io && trip.employee_id) {
    req.io.to(`user_${trip.employee_id}`).emit('driver_arrived', { trip_id: trip.id });
  }
  res.json({ success: true, data: trip });
});

exports.pickupPassenger = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'PASSENGER_ONBOARD', req.user.id,
    { latitude, longitude }
  );
  res.json({ success: true, data: trip });
});

exports.startTrip = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'IN_PROGRESS', req.user.id,
    { latitude, longitude }
  );
  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').emit('trip_status_update', { trip_id: trip.id, status: 'IN_PROGRESS' });
  }
  res.json({ success: true, data: trip });
});

exports.completeTrip = asyncHandler(async (req, res) => {
  const { latitude, longitude, distance_km, duration_minutes } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'COMPLETED', req.user.id,
    { latitude, longitude, distance_km, duration_minutes }
  );
  await AuditService.log({
    user_id: req.user.id, action: 'TRIP_COMPLETE', entity_type: 'trip',
    entity_id: trip.id, new_values: { distance_km, duration_minutes }, ip_address: req.ip
  });
  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').emit('trip_status_update', { trip_id: trip.id, status: 'COMPLETED' });
  }
  res.json({ success: true, data: trip });
});

exports.cancelTrip = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'CANCELLED', req.user.id, { notes }
  );
  res.json({ success: true, data: trip });
});

exports.markNoShow = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'NO_SHOW', req.user.id, { notes }
  );
  res.json({ success: true, data: trip });
});

exports.escalate = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const trip = await TripStateMachine.transition(
    parseInt(req.params.id), 'ESCALATED', req.user.id, { notes }
  );
  res.json({ success: true, data: trip });
});

// Driver today trips
exports.getDriverToday = asyncHandler(async (req, res) => {
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Driver profile not found' });
  const trips = await TripStateMachine.getDriverTodayTrips(driver.id);
  res.json({ success: true, data: trips });
});

// Employee trips
exports.getEmployeeTrips = asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;
  const trips = await TripStateMachine.getEmployeeTrips(req.user.id, parseInt(limit));
  res.json({ success: true, data: trips });
});

// Update driver location during trip
exports.updateLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude, speed, heading, accuracy, altitude } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ success: false, error: 'latitude and longitude are required' });

  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Driver profile not found' });

  await Driver.updateLocation(driver.id, latitude, longitude);

  const tripId = req.body.trip_id ? parseInt(req.body.trip_id) : null;
  await LiveLocation.record({
    driver_id: driver.id, trip_id: tripId,
    latitude, longitude, speed, heading, accuracy, altitude
  });

  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').emit('driver_location', {
      driver_id: driver.id, driver_name: driver.name,
      latitude, longitude, speed, heading, trip_id: tripId,
      vehicle_number: driver.vehicle_number
    });
    if (tripId) {
      req.io.emit(`trip_location_${tripId}`, { latitude, longitude, speed, heading });
    }
  }

  res.json({ success: true, message: 'Location updated' });
});

// Get all live driver locations for admin map
exports.getAllDriverLocations = asyncHandler(async (req, res) => {
  const locations = await LiveLocation.getAllDriverLocations();
  res.json({ success: true, data: locations });
});
