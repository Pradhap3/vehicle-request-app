const TransportProfile = require('../models/TransportProfile');
const Route = require('../models/Route');
const RouteStop = require('../models/RouteStop');
const RecurringTransportService = require('../services/RecurringTransportService');
const CabRequest = require('../models/CabRequest');
const Cab = require('../models/Cab');
const logger = require('../utils/logger');

const OFFICE_FALLBACK = {
  name: 'AISIN Karnataka Limited, Narasapura Industrial Area',
  latitude: 13.2947,
  longitude: 78.2172
};

const OFFICE_RADIUS_KM = 0.5;
const BOARDING_RADIUS_KM = 0.25;

const toNumberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const distanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isNearPoint = (cab, point, radiusKm) => {
  if (!cab || !point) return false;
  const lat1 = toNumberOrNull(cab.current_latitude);
  const lon1 = toNumberOrNull(cab.current_longitude);
  const lat2 = toNumberOrNull(point.latitude);
  const lon2 = toNumberOrNull(point.longitude);
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return false;
  return distanceKm(lat1, lon1, lat2, lon2) <= radiusKm;
};

const hasVisitedPoint = (history = [], point, radiusKm) => {
  if (!point) return false;
  const pointLat = toNumberOrNull(point.latitude);
  const pointLng = toNumberOrNull(point.longitude);
  if (pointLat === null || pointLng === null) return false;

  return history.some((entry) => {
    const lat = toNumberOrNull(entry.latitude);
    const lng = toNumberOrNull(entry.longitude);
    if (lat === null || lng === null) return false;
    return distanceKm(lat, lng, pointLat, pointLng) <= radiusKm;
  });
};

const isOfficeText = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized.includes('aisin') || normalized.includes('narasapura');
};

const getOfficePoint = () => ({
  name: process.env.OFFICE_NAME || OFFICE_FALLBACK.name,
  latitude: toNumberOrNull(process.env.OFFICE_LATITUDE) ?? OFFICE_FALLBACK.latitude,
  longitude: toNumberOrNull(process.env.OFFICE_LONGITUDE) ?? OFFICE_FALLBACK.longitude
});

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
    const profile = await TransportProfile.findByEmployeeId(req.user.id);
    const history = cabId
      ? await Cab.getLocationHistory(cabId, new Date(Date.now() - 2 * 60 * 60 * 1000), new Date())
      : [];
    const officePoint = getOfficePoint();

    const selectedStop =
      (profile?.stop_sequence ? stops.find((stop) => Number(stop.stop_sequence) === Number(profile.stop_sequence)) : null) ||
      (profile?.stop_name ? stops.find((stop) => String(stop.stop_name).trim().toLowerCase() === String(profile.stop_name).trim().toLowerCase()) : null) ||
      null;

    const tripDirection = isOfficeText(trip.pickup_location) ? 'OFFICE_TO_DESTINATION' : 'BOARDING_TO_OFFICE';
    const boardingPoint = tripDirection === 'OFFICE_TO_DESTINATION'
      ? {
          name: officePoint.name,
          latitude: officePoint.latitude,
          longitude: officePoint.longitude,
          source: 'OFFICE'
        }
      : {
          name: selectedStop?.stop_name || profile?.stop_name || trip.pickup_location,
          latitude: selectedStop?.latitude ?? profile?.pickup_latitude ?? null,
          longitude: selectedStop?.longitude ?? profile?.pickup_longitude ?? null,
          stop_sequence: selectedStop?.stop_sequence ?? profile?.stop_sequence ?? null,
          source: selectedStop ? 'ROUTE_STOP' : 'PROFILE'
        };

    const destinationPoint = tripDirection === 'OFFICE_TO_DESTINATION'
      ? {
          name: selectedStop?.stop_name || profile?.drop_location || trip.drop_location,
          latitude: selectedStop?.latitude ?? profile?.drop_latitude ?? null,
          longitude: selectedStop?.longitude ?? profile?.drop_longitude ?? null,
          stop_sequence: selectedStop?.stop_sequence ?? profile?.stop_sequence ?? null
        }
      : officePoint;

    const cabAtBoardingPoint = isNearPoint(cab, boardingPoint, BOARDING_RADIUS_KM);
    const cabAtOffice = isNearPoint(cab, officePoint, OFFICE_RADIUS_KM);
    const visitedBoardingPoint = hasVisitedPoint(history, boardingPoint, BOARDING_RADIUS_KM);

    let routeProgress = 'WAITING_FOR_CAB_ASSIGNMENT';
    if (cab) {
      if (cabAtBoardingPoint) {
        routeProgress = tripDirection === 'OFFICE_TO_DESTINATION' ? 'AT_OFFICE_BOARDING_POINT' : 'AT_BOARDING_POINT';
      } else if (visitedBoardingPoint) {
        routeProgress = tripDirection === 'OFFICE_TO_DESTINATION' ? 'LEFT_OFFICE_BOARDING_POINT' : 'LEFT_BOARDING_POINT';
      } else if (cabAtOffice && tripDirection === 'BOARDING_TO_OFFICE') {
        routeProgress = 'AT_OFFICE';
      } else {
        routeProgress = tripDirection === 'OFFICE_TO_DESTINATION' ? 'COMING_TO_OFFICE_BOARDING_POINT' : 'COMING_TO_BOARDING_POINT';
      }
    }

    const distanceToBoardingKm = cab && boardingPoint?.latitude != null && boardingPoint?.longitude != null
      ? Number(distanceKm(
          Number(cab.current_latitude),
          Number(cab.current_longitude),
          Number(boardingPoint.latitude),
          Number(boardingPoint.longitude)
        ).toFixed(2))
      : null;

    const distanceToOfficeKm = cab && officePoint?.latitude != null && officePoint?.longitude != null
      ? Number(distanceKm(
          Number(cab.current_latitude),
          Number(cab.current_longitude),
          Number(officePoint.latitude),
          Number(officePoint.longitude)
        ).toFixed(2))
      : null;

    res.json({
      success: true,
      data: {
        trip,
        cab,
        profile,
        route: route ? { ...route, stops } : null,
        history,
        officePoint,
        boardingPoint,
        destinationPoint,
        tripDirection,
        routeProgress,
        progressFlags: {
          cabAtBoardingPoint,
          cabAtOffice,
          visitedBoardingPoint
        },
        distances: {
          toBoardingKm: distanceToBoardingKm,
          toOfficeKm: distanceToOfficeKm
        }
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
