const { asyncHandler } = require('../middleware/errorHandler');
const Rating = require('../models/Rating');

exports.create = asyncHandler(async (req, res) => {
  const { trip_id, rating, feedback, categories, driver_id, booking_id } = req.body;
  if (!trip_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, error: 'trip_id and rating (1-5) are required' });
  }

  const parsedTripId = parseInt(trip_id);
  const existing = await Rating.findByTripId(parsedTripId);
  if (existing.some(r => r.rated_by === req.user.id)) {
    return res.status(409).json({ success: false, error: 'You already rated this trip' });
  }

  const result = await Rating.create({
    trip_id: parsedTripId, booking_id, rated_by: req.user.id,
    driver_id: driver_id ? parseInt(driver_id) : null, rating, feedback, categories
  });
  res.status(201).json({ success: true, data: result });
});

exports.getByTrip = asyncHandler(async (req, res) => {
  const ratings = await Rating.findByTripId(parseInt(req.params.tripId));
  res.json({ success: true, data: ratings });
});

exports.getByDriver = asyncHandler(async (req, res) => {
  const ratings = await Rating.findByDriverId(parseInt(req.params.driverId));
  res.json({ success: true, data: ratings });
});

exports.getDriverStats = asyncHandler(async (req, res) => {
  const stats = await Rating.getDriverStats(parseInt(req.params.driverId));
  res.json({ success: true, data: stats });
});

exports.getAll = asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, driver_id, min_rating } = req.query;
  const filters = {};
  if (driver_id) filters.driver_id = parseInt(driver_id);
  if (min_rating) filters.min_rating = parseInt(min_rating);
  const ratings = await Rating.getAll(filters, parseInt(limit), parseInt(offset));
  res.json({ success: true, data: ratings });
});
