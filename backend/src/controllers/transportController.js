const TransportProfile = require('../models/TransportProfile');
const Route = require('../models/Route');
const RouteStop = require('../models/RouteStop');
const RecurringTransportService = require('../services/RecurringTransportService');
const CabRequest = require('../models/CabRequest');
const Cab = require('../models/Cab');
const Notification = require('../models/Notification');
const User = require('../models/User');
const RouteOptimizationService = require('../services/RouteOptimizationService');
const logger = require('../utils/logger');

const OFFICE_FALLBACK = {
  name: 'Aisin Automotive Karnataka Private Limited, 106-P, Karinaikanahalli, KIADB Industrial Area, Karnataka 563133',
  latitude: 13.11,
  longitude: 77.99
};

const OFFICE_RADIUS_KM = 0.5;
const BOARDING_RADIUS_KM = 0.25;
const MAX_ROUTE_DISTANCE_FROM_OFFICE_KM = 250;
const ACTIVE_TRIP_STATUSES = ['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'COMPLETED'];
const INDIA_BOUNDS = {
  minLatitude: 5,
  maxLatitude: 38,
  minLongitude: 67,
  maxLongitude: 98
};

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
  return normalized.includes('aisin')
    || normalized.includes('narasapura')
    || normalized.includes('karinaikanahalli')
    || normalized.includes('kiadb')
    || normalized.includes('563133');
};

const normalizeIndianLongitude = (longitude) => {
  const lng = toNumberOrNull(longitude);
  if (lng === null) return null;
  if (lng < 0 && Math.abs(lng) >= INDIA_BOUNDS.minLongitude && Math.abs(lng) <= INDIA_BOUNDS.maxLongitude) {
    return Math.abs(lng);
  }
  return lng;
};

const normalizePoint = (point, { assumeIndia = false } = {}) => {
  if (!point) return null;
  const latitude = toNumberOrNull(point.latitude);
  let longitude = normalizeIndianLongitude(point.longitude);

  if (latitude === null || longitude === null) {
    return {
      ...point,
      latitude: latitude ?? null,
      longitude: longitude ?? null
    };
  }

  if (assumeIndia) {
    const withinIndia =
      latitude >= INDIA_BOUNDS.minLatitude &&
      latitude <= INDIA_BOUNDS.maxLatitude &&
      longitude >= INDIA_BOUNDS.minLongitude &&
      longitude <= INDIA_BOUNDS.maxLongitude;
    if (!withinIndia) {
      return {
        ...point,
        latitude: null,
        longitude: null
      };
    }
  }

  return {
    ...point,
    latitude,
    longitude
  };
};

const getOfficePoint = () => ({
  name: process.env.OFFICE_NAME || OFFICE_FALLBACK.name,
  latitude: toNumberOrNull(process.env.OFFICE_LATITUDE) ?? OFFICE_FALLBACK.latitude,
  longitude: normalizeIndianLongitude(process.env.OFFICE_LONGITUDE) ?? OFFICE_FALLBACK.longitude
});

const emitUserNotification = async (req, userId, payload) => {
  const created = await Notification.create({
    user_id: userId,
    type: payload.type || 'INFO',
    title: payload.title || 'Notification',
    message: payload.message || '',
    data: payload.data || null
  });

  if (req.io && userId !== null && userId !== undefined) {
    req.io.to(`user_${userId}`).emit('notification', {
      id: created?.id,
      ...payload,
      created_at: new Date().toISOString()
    });
  }
};

const normalizeRequestType = (requestType) =>
  String(requestType || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const selectTodayTrip = (requests = []) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  let todayTrips = requests
    .filter((row) => {
      const tripDate = row.requested_time ? new Date(row.requested_time).toISOString().slice(0, 10) : null;
      return tripDate === today && ACTIVE_TRIP_STATUSES.includes(row.status);
    })
    .sort((a, b) => new Date(a.requested_time || a.pickup_time || 0) - new Date(b.requested_time || b.pickup_time || 0));

  const hasSplitRecurring = todayTrips.some((row) => ['RECURRING_INBOUND', 'RECURRING_OUTBOUND'].includes(row.request_type));
  if (hasSplitRecurring) {
    todayTrips = todayTrips.filter((row) => row.request_type !== 'RECURRING');
  }

  const inProgress = todayTrips.find((row) => row.status === 'IN_PROGRESS');
  if (inProgress) return inProgress;

  const upcoming = todayTrips.find((row) => new Date(row.requested_time || row.pickup_time || 0).getTime() >= now);
  if (upcoming) return upcoming;

  return todayTrips[todayTrips.length - 1] || null;
};

const sameCoordinate = (a, b) =>
  a && b
  && toNumberOrNull(a.latitude) !== null
  && toNumberOrNull(a.longitude) !== null
  && toNumberOrNull(b.latitude) !== null
  && toNumberOrNull(b.longitude) !== null
  && Number(toNumberOrNull(a.latitude).toFixed(6)) === Number(toNumberOrNull(b.latitude).toFixed(6))
  && Number(toNumberOrNull(a.longitude).toFixed(6)) === Number(toNumberOrNull(b.longitude).toFixed(6));

const appendUniquePoint = (points, point) => {
  if (!point || toNumberOrNull(point.latitude) === null || toNumberOrNull(point.longitude) === null) {
    return;
  }
  const normalized = {
    ...point,
    latitude: toNumberOrNull(point.latitude),
    longitude: toNumberOrNull(point.longitude)
  };
  if (points.length > 0 && sameCoordinate(points[points.length - 1], normalized)) {
    return;
  }
  points.push(normalized);
};

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
    const currentProfile = await TransportProfile.findByEmployeeId(req.user.id);
    const requestedShift = req.body.shift_code || null;
    const currentShift = currentProfile?.shift_code || null;
    const shiftChanged = currentProfile && requestedShift && requestedShift !== currentShift;

    if (shiftChanged) {
      if (currentProfile.pending_shift_code) {
        return res.status(400).json({
          success: false,
          error: 'A shift change request is already pending approval.'
        });
      }

      const pendingProfile = await TransportProfile.requestShiftChange(req.user.id, {
        shift_code: requestedShift,
        effective_from: req.body.effective_from || currentProfile.effective_from || null,
        effective_to: req.body.effective_to || currentProfile.effective_to || null
      });

      const shiftRequest = await CabRequest.create({
        employee_id: req.user.id,
        route_id: currentProfile.route_id || req.body.route_id || null,
        pickup_time: new Date(),
        requested_time: new Date(),
        travel_time: new Date(),
        departure_location: currentProfile.pickup_location || currentProfile.stop_name || 'Employee boarding point',
        destination_location: currentProfile.drop_location || OFFICE_FALLBACK.name,
        pickup_location: currentProfile.pickup_location || currentProfile.stop_name || 'Employee boarding point',
        drop_location: currentProfile.drop_location || OFFICE_FALLBACK.name,
        boarding_area: currentProfile.pickup_location || currentProfile.stop_name || 'Employee boarding point',
        dropping_area: currentProfile.drop_location || OFFICE_FALLBACK.name,
        priority: 'NORMAL',
        status: 'PENDING',
        number_of_people: 1,
        request_type: 'SHIFT_CHANGE'
      });

      await emitUserNotification(req, req.user.id, {
        type: 'SHIFT_CHANGE_REQUESTED',
        title: 'Shift change submitted',
        message: 'Your shift change request is waiting for HR/Admin approval. Your current shift remains active until approval.',
        data: { request_id: shiftRequest?.id, route: '/employee' }
      });

      const admins = (await User.findAll()).filter((user) => ['HR_ADMIN', 'ADMIN'].includes(user.role));
      for (const admin of admins) {
        await emitUserNotification(req, admin.id, {
          type: 'REQUEST_APPROVAL_REQUIRED',
          title: 'Shift Change Approval Required',
          message: `Shift change request submitted by employee ${req.user.id}. Review and approve from Requests.`,
          data: { request_id: shiftRequest?.id, route: '/requests' }
        });
      }

      const enrichedPending = pendingProfile?.route_id
        ? { ...pendingProfile, stops: await RouteStop.findByRouteId(pendingProfile.route_id) }
        : pendingProfile;

      return res.json({
        success: true,
        data: enrichedPending,
        message: 'Shift change request submitted for approval'
      });
    }

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
    const trip = selectTodayTrip(requests);

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
    const trip = selectTodayTrip(requests);

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
    const officePoint = normalizePoint(getOfficePoint(), { assumeIndia: true });

    const selectedStop =
      (profile?.stop_sequence ? stops.find((stop) => Number(stop.stop_sequence) === Number(profile.stop_sequence)) : null) ||
      (profile?.stop_name ? stops.find((stop) => String(stop.stop_name).trim().toLowerCase() === String(profile.stop_name).trim().toLowerCase()) : null) ||
      null;

    const tripDirection = isOfficeText(trip.pickup_location) ? 'OFFICE_TO_DESTINATION' : 'BOARDING_TO_OFFICE';
    const boardingPoint = normalizePoint(tripDirection === 'OFFICE_TO_DESTINATION'
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
        }, { assumeIndia: true });

    const destinationPoint = normalizePoint(tripDirection === 'OFFICE_TO_DESTINATION'
      ? {
          name: selectedStop?.stop_name || profile?.drop_location || trip.drop_location,
          latitude: selectedStop?.latitude ?? profile?.drop_latitude ?? null,
          longitude: selectedStop?.longitude ?? profile?.drop_longitude ?? null,
          stop_sequence: selectedStop?.stop_sequence ?? profile?.stop_sequence ?? null
        }
      : officePoint, { assumeIndia: true });

    const orderedStops = [...stops]
      .map((stop) => normalizePoint({
        ...stop,
        latitude: stop.latitude,
        longitude: stop.longitude
      }, { assumeIndia: true }))
      .filter((stop) => stop.latitude != null && stop.longitude != null)
      .sort((a, b) => Number(a.stop_sequence || 0) - Number(b.stop_sequence || 0));

    const routePath = [];
    if (tripDirection === 'BOARDING_TO_OFFICE') {
      appendUniquePoint(routePath, {
        name: boardingPoint.name,
        latitude: boardingPoint.latitude,
        longitude: boardingPoint.longitude,
        kind: 'BOARDING_POINT'
      });
      orderedStops.forEach((stop) => {
        if (!selectedStop || Number(stop.stop_sequence || 0) >= Number(selectedStop.stop_sequence || 0)) {
          appendUniquePoint(routePath, {
            name: stop.stop_name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            kind: 'ROUTE_STOP',
            stop_sequence: stop.stop_sequence
          });
        }
      });
      appendUniquePoint(routePath, {
        name: officePoint.name,
        latitude: officePoint.latitude,
        longitude: officePoint.longitude,
        kind: 'OFFICE'
      });
    } else {
      appendUniquePoint(routePath, {
        name: officePoint.name,
        latitude: officePoint.latitude,
        longitude: officePoint.longitude,
        kind: 'OFFICE'
      });
      orderedStops.forEach((stop) => {
        if (!selectedStop || Number(stop.stop_sequence || 0) <= Number(selectedStop.stop_sequence || 0)) {
          appendUniquePoint(routePath, {
            name: stop.stop_name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            kind: 'ROUTE_STOP',
            stop_sequence: stop.stop_sequence
          });
        }
      });
      appendUniquePoint(routePath, {
        name: destinationPoint.name,
        latitude: destinationPoint.latitude,
        longitude: destinationPoint.longitude,
        kind: 'DESTINATION'
      });
    }

    const sanitizedRoutePath = routePath.filter((point) => {
      if (!officePoint?.latitude || !officePoint?.longitude) return true;
      if (point.kind === 'OFFICE') return true;
      if (point.latitude == null || point.longitude == null) return false;
      return distanceKm(
        Number(point.latitude),
        Number(point.longitude),
        Number(officePoint.latitude),
        Number(officePoint.longitude)
      ) <= MAX_ROUTE_DISTANCE_FROM_OFFICE_KM;
    });

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

    const trackingMetrics = RouteOptimizationService.buildTrackingMetrics({
      cab,
      routePath: sanitizedRoutePath,
      currentPoint: cab ? {
        latitude: cab.current_latitude,
        longitude: cab.current_longitude
      } : null,
      tripDirection
    });
    const routePlan = RouteOptimizationService.buildRouteMetrics(
      Array.isArray(requests) ? requests.filter((row) => row.route_id === routeId) : [],
      trip?.pickup_time || trip?.requested_time || new Date()
    );
    const stopsWithEta = (stops || []).map((stop) => {
      const match = routePlan.stopPlan.find((planStop) =>
        (planStop.stop_name && stop.stop_name && String(planStop.stop_name).trim().toLowerCase() === String(stop.stop_name).trim().toLowerCase())
        || (planStop.stop_sequence && stop.stop_sequence && Number(planStop.stop_sequence) === Number(stop.stop_sequence))
      );
      return match ? { ...stop, eta_offset_minutes: match.eta_offset_minutes } : stop;
    });

    res.json({
      success: true,
      data: {
        trip,
        cab,
        profile,
        route: route ? { ...route, stops: stopsWithEta, route_distance_km: routePlan.distanceKm, route_duration_minutes: routePlan.durationMinutes } : null,
        routePath: sanitizedRoutePath,
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
        eta: {
          toNextStopMinutes: trackingMetrics.nextStop ? RouteOptimizationService.estimateTravelMinutes(
            {
              latitude: cab?.current_latitude,
              longitude: cab?.current_longitude
            },
            {
              latitude: trackingMetrics.nextStop.latitude,
              longitude: trackingMetrics.nextStop.longitude
            },
            new Date()
          ) : null,
          routeCompletionPct: trackingMetrics.completionPct,
          finalEtaMinutes: trackingMetrics.etaMinutes
        },
        nextStop: trackingMetrics.nextStop,
        remainingPickupPoints: trackingMetrics.remainingStops,
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
