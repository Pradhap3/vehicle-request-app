const TransportProfile = require('../models/TransportProfile');
const Route = require('../models/Route');
const RouteStop = require('../models/RouteStop');
const RecurringTransportService = require('../services/RecurringTransportService');
const CabRequest = require('../models/CabRequest');
const Cab = require('../models/Cab');
const logger = require('../utils/logger');

exports.getMyProfile = async (req, res) => {
  try {
    const profile = await TransportProfile.findByEmployeeId(req.user.id);
    const routes = await Route.findAll();
    const stops = profile?.route_id ? await RouteStop.findByRouteId(profile.route_id) : [];

    res.json({
      success: true,
      data: {
        profile,
        routes,
        stops
      }
    });
  } catch (error) {
    logger.error('Get transport profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transport profile'
    });
  }
};

exports.upsertMyProfile = async (req, res) => {
  try {
    const profile = await TransportProfile.upsert(req.user.id, req.body);
    const enriched = profile?.route_id ? { ...profile, stops: await RouteStop.findByRouteId(profile.route_id) } : profile;
    res.json({
      success: true,
      data: enriched,
      message: 'Transport profile saved'
    });
  } catch (error) {
    logger.error('Upsert transport profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save transport profile'
    });
  }
};

exports.getMyTodayTrip = async (req, res) => {
  try {
    await RecurringTransportService.ensureDailyTrips(new Date(), { io: req.io });
    const requests = await CabRequest.getByEmployeeId(req.user.id);
    const today = new Date().toISOString().slice(0, 10);
    const trip = requests.find((row) => {
      const tripDate = row.requested_time ? new Date(row.requested_time).toISOString().slice(0, 10) : null;
      return tripDate === today && ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(row.status);
    }) || null;

    res.json({
      success: true,
      data: trip
    });
  } catch (error) {
    logger.error('Get today trip error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch today trip'
    });
  }
};

exports.getMyTracking = async (req, res) => {
  try {
    await RecurringTransportService.ensureDailyTrips(new Date(), { io: req.io });
    const requests = await CabRequest.getByEmployeeId(req.user.id);
    const today = new Date().toISOString().slice(0, 10);
    const trip = requests.find((row) => {
      const tripDate = row.requested_time ? new Date(row.requested_time).toISOString().slice(0, 10) : null;
      return tripDate === today && ['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'PENDING'].includes(row.status);
    }) || null;

    if (!trip) {
      return res.json({
        success: true,
        data: null
      });
    }

    const cabId = trip.assigned_cab_id || trip.cab_id || null;
    const routeId = trip.route_id || null;
    const cab = cabId ? await Cab.findById(cabId) : null;
    const route = routeId ? await Route.findById(routeId) : null;
    const stops = routeId ? await RouteStop.findByRouteId(routeId) : [];
    const history = cabId
      ? await Cab.getLocationHistory(cabId, new Date(Date.now() - 2 * 60 * 60 * 1000), new Date())
      : [];

    res.json({
      success: true,
      data: {
        trip,
        cab,
        route: route ? { ...route, stops } : null,
        history
      }
    });
  } catch (error) {
    logger.error('Get employee tracking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tracking data'
    });
  }
};
