const { asyncHandler } = require('../middleware/errorHandler');
const Booking = require('../models/Booking');
const TripStateMachine = require('../services/TripStateMachine');
const Driver = require('../models/Driver');
const Notification = require('../models/Notification');
const AuditService = require('../services/AuditService');
const logger = require('../utils/logger');

exports.create = asyncHandler(async (req, res) => {
  const { pickup_location, drop_location, pickup_time, passengers, purpose,
          booking_type, priority, route_id, shift_id,
          pickup_latitude, pickup_longitude, drop_latitude, drop_longitude, notes } = req.body;

  if (!pickup_location || !drop_location || !pickup_time) {
    return res.status(400).json({ success: false, error: 'pickup_location, drop_location, and pickup_time are required' });
  }

  const booking = await Booking.create({
    employee_id: req.user.id,
    pickup_location, drop_location, pickup_time,
    passengers: passengers || 1, purpose, booking_type, priority,
    route_id, shift_id, pickup_latitude, pickup_longitude,
    drop_latitude, drop_longitude, notes
  });

  await Notification.create({
    user_id: req.user.id,
    type: 'BOOKING_CREATED',
    title: 'Booking submitted',
    message: `Your ride from ${pickup_location} to ${drop_location} has been booked`,
    data: { bookingId: booking.id, bookingRef: booking.booking_ref }
  });

  await AuditService.log({
    user_id: req.user.id, action: 'BOOKING_CREATE', entity_type: 'booking',
    entity_id: booking.id, new_values: booking, ip_address: req.ip
  });

  if (req.io) {
    req.io.to('HR_ADMIN').to('ADMIN').emit('new_booking', {
      booking_id: booking.id, booking_ref: booking.booking_ref,
      employee_name: req.user.name, pickup_time
    });
  }

  res.status(201).json({ success: true, data: booking });
});

exports.getAll = asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, status, booking_type, date, from_date, to_date, route_id, shift_id, my } = req.query;
  const filters = {};

  if (my === 'true' || req.user.role === 'EMPLOYEE' || req.user.role === 'USER') {
    filters.employee_id = req.user.id;
  }
  if (status) filters.status = status;
  if (booking_type) filters.booking_type = booking_type;
  if (date) filters.date = date;
  if (from_date && to_date) { filters.from_date = from_date; filters.to_date = to_date; }
  if (route_id) filters.route_id = route_id;
  if (shift_id) filters.shift_id = shift_id;

  const result = await Booking.findAll(filters, parseInt(limit), parseInt(offset));
  res.json({ success: true, data: result.data, total: result.total });
});

exports.getById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(parseInt(req.params.id));
  if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
  res.json({ success: true, data: booking });
});

exports.update = asyncHandler(async (req, res) => {
  const booking = await Booking.update(parseInt(req.params.id), req.body);
  if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
  res.json({ success: true, data: booking });
});

exports.cancel = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const booking = await Booking.updateStatus(parseInt(req.params.id), 'CANCELLED', req.user.id, { reason });
  if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

  await AuditService.log({
    user_id: req.user.id, action: 'BOOKING_CANCEL', entity_type: 'booking',
    entity_id: booking.id, new_values: { reason }, ip_address: req.ip
  });

  res.json({ success: true, data: booking, message: 'Booking cancelled' });
});

exports.approve = asyncHandler(async (req, res) => {
  const booking = await Booking.updateStatus(parseInt(req.params.id), 'APPROVED', req.user.id);
  if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

  await Notification.create({
    user_id: booking.employee_id,
    type: 'BOOKING_APPROVED',
    title: 'Booking approved',
    message: 'Your booking has been approved',
    data: { bookingId: booking.id }
  });

  res.json({ success: true, data: booking, message: 'Booking approved' });
});

exports.reject = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ success: false, error: 'Rejection reason is required' });
  const booking = await Booking.updateStatus(parseInt(req.params.id), 'REJECTED', req.user.id, { reason });
  res.json({ success: true, data: booking, message: 'Booking rejected' });
});

exports.assign = asyncHandler(async (req, res) => {
  const { driver_id, vehicle_id } = req.body;
  if (!driver_id) return res.status(400).json({ success: false, error: 'driver_id is required' });

  const bookingId = parseInt(req.params.id);
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

  const driver = await Driver.findById(parseInt(driver_id));
  if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });

  const trip = await TripStateMachine.createTrip({
    booking_id: bookingId,
    driver_id: parseInt(driver_id),
    vehicle_id: vehicle_id ? parseInt(vehicle_id) : driver.vehicle_id,
    route_id: booking.route_id,
    scheduled_pickup: booking.pickup_time,
    pickup_location: booking.pickup_location,
    drop_location: booking.drop_location,
    pickup_latitude: booking.pickup_latitude,
    pickup_longitude: booking.pickup_longitude,
    drop_latitude: booking.drop_latitude,
    drop_longitude: booking.drop_longitude,
    assigned_by: req.user.id
  });

  await Notification.create({
    user_id: driver.user_id,
    type: 'TRIP_ASSIGNED',
    title: 'New trip assigned',
    message: `New trip: ${booking.pickup_location} to ${booking.drop_location}`,
    data: { tripId: trip.id, bookingId }
  });

  if (req.io) {
    req.io.to(`user_${driver.user_id}`).emit('trip_assigned', { trip_id: trip.id, booking_ref: booking.booking_ref });
  }

  res.json({ success: true, data: trip, message: 'Trip assigned to driver' });
});

exports.getMyBookings = asyncHandler(async (req, res) => {
  const result = await Booking.findAll({ employee_id: req.user.id }, 50, 0);
  res.json({ success: true, data: result.data });
});

exports.getMyStats = asyncHandler(async (req, res) => {
  const stats = await Booking.getEmployeeStats(req.user.id);
  res.json({ success: true, data: stats });
});

exports.delete = asyncHandler(async (req, res) => {
  await Booking.softDelete(parseInt(req.params.id));
  res.json({ success: true, message: 'Booking deleted' });
});
