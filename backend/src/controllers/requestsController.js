// src/controllers/requestsController.js
const { validationResult } = require('express-validator');
const CabRequest = require('../models/CabRequest');
const BoardingStatus = require('../models/BoardingStatus');
const Notification = require('../models/Notification');
const SmartAllocationService = require('../ai/SmartAllocationService');
const Cab = require('../models/Cab');
const AuditLog = require('../models/AuditLog');
const RecurringTransportService = require('../services/RecurringTransportService');
const logger = require('../utils/logger');

const BOOKING_MIN_ADVANCE_MINUTES = parseInt(process.env.BOOKING_MIN_ADVANCE_MINUTES || '60', 10);
const REQUEST_CONFLICT_WINDOW_MINUTES = parseInt(process.env.REQUEST_CONFLICT_WINDOW_MINUTES || '180', 10);
const REQUIRE_CALL_ATTEMPT_FOR_NO_SHOW = String(process.env.REQUIRE_CALL_ATTEMPT_FOR_NO_SHOW || 'true') === 'true';
const CALL_ATTEMPT_WINDOW_MINUTES = parseInt(process.env.CALL_ATTEMPT_WINDOW_MINUTES || '15', 10);
const BOARDING_ALLOWED_STATUSES = new Set([
  'APPROVED',
  'ASSIGNED',
  'ALLOCATED',
  'SCHEDULED',
  'CONFIRMED',
  'READY_FOR_PICKUP',
  'ON_THE_WAY',
  'ENROUTE'
]);

const normalizeStatus = (status) =>
  String(status || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

const parseFlexibleDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = dmy;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymd) {
    const [, yyyy, mm, dd, hh = '00', mi = '00', ss = '00'] = ymd;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const combinePickupDateTime = (pickupDate, pickupTime) => {
  if (!pickupDate && !pickupTime) return null;

  const timeOnly = pickupTime && String(pickupTime).trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (pickupDate && timeOnly) {
    const [, hh, mi, ss = '00'] = timeOnly;
    const datePart = parseFlexibleDateTime(pickupDate);
    if (!datePart) return null;

    const yyyy = datePart.getFullYear();
    const mm = String(datePart.getMonth() + 1).padStart(2, '0');
    const dd = String(datePart.getDate()).padStart(2, '0');
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`);
  }

  return parseFlexibleDateTime(pickupTime) || parseFlexibleDateTime(pickupDate);
};

const validateBookingLeadTime = (requestedDate) => {
  if (!requestedDate) return null;
  const now = new Date();
  const minAllowed = new Date(now.getTime() + BOOKING_MIN_ADVANCE_MINUTES * 60000);
  if (requestedDate < minAllowed) {
    return `Cab must be booked at least ${BOOKING_MIN_ADVANCE_MINUTES} minutes in advance.`;
  }
  return null;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
};

const emitNotification = async (req, userId, payload) => {
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
  return created;
};

// Get all requests
exports.getRequests = async (req, res) => {
  try {
    const { status, route_id, my_requests } = req.query;
    const filters = {};
    
    if (status) filters.status = status;
    if (route_id) filters.route_id = route_id;
    
    // If employee or requesting own requests, filter by employee_id
    const userRole = req.user.role;
    if (userRole === 'EMPLOYEE' || userRole === 'USER' || my_requests === 'true') {
      await RecurringTransportService.ensureDailyTrips(new Date(), { io: req.io });
      filters.employee_id = req.user.id;
    }

    const requests = await CabRequest.findAll(filters);

    res.json({
      success: true,
      data: requests,
      count: requests.length
    });
  } catch (error) {
    logger.error('Get requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch requests'
    });
  }
};

// Get request by ID
exports.getRequestById = async (req, res) => {
  try {
    const request = await CabRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check access
    const userRole = req.user.role;
    if ((userRole === 'EMPLOYEE' || userRole === 'USER') && request.employee_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    logger.error('Get request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch request'
    });
  }
};

// Create request - only pass fields that exist in DB
exports.createRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { 
      route_id, 
      pickup_date,
      pickup_time,
      pickup_location, 
      drop_location,
      departure_location,
      destination_location,
      requested_time,
      travel_time,
      number_of_people,
      priority,
      boarding_area,
      dropping_area,
      request_type
    } = req.body;
    // Use route standard pickup time as fallback if explicit time not provided.
    let route = null;
    if (route_id) {
      try {
        const Route = require('../models/Route');
        route = await Route.findById(route_id);
      } catch (routeErr) {
        logger.warn(`Route lookup failed for ${route_id}: ${routeErr.message}`);
      }
    }

    let normalizedRequestedTime =
      parseFlexibleDateTime(requested_time) ||
      combinePickupDateTime(pickup_date, pickup_time) ||
      parseFlexibleDateTime(pickup_time);

    if (!normalizedRequestedTime && route?.standard_pickup_time) {
      const hhmmss = String(route.standard_pickup_time);
      const [hh = '08', mm = '00', ss = '00'] = hhmmss.split(':');
      const now = new Date();
      const candidate = new Date(now);
      candidate.setHours(parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10), 0);
      const minAllowed = new Date(now.getTime() + BOOKING_MIN_ADVANCE_MINUTES * 60000);
      if (candidate < minAllowed) candidate.setDate(candidate.getDate() + 1);
      normalizedRequestedTime = candidate;
    }

    if ((requested_time || pickup_time || pickup_date) && !normalizedRequestedTime) {
      return res.status(400).json({
        success: false,
        error: 'Invalid requested time. Use ISO datetime or pickup_date + pickup_time.'
      });
    }
    if (!normalizedRequestedTime) {
      return res.status(400).json({
        success: false,
        error: 'Pickup/requested time is required.'
      });
    }

    const leadTimeError = validateBookingLeadTime(normalizedRequestedTime);
    if (leadTimeError) {
      return res.status(400).json({
        success: false,
        error: leadTimeError
      });
    }

    // Use current user as employee
    const employee_id = req.user.id;

    const conflict = await CabRequest.findConflictingRequest(
      employee_id,
      normalizedRequestedTime,
      null,
      REQUEST_CONFLICT_WINDOW_MINUTES
    );
    if (conflict) {
      return res.status(400).json({
        success: false,
        error: `You already have another active booking near this time (${REQUEST_CONFLICT_WINDOW_MINUTES} minute window).`
      });
    }

    const normalizedTravelTime =
      parseFlexibleDateTime(travel_time) ||
      normalizedRequestedTime ||
      new Date();

    if (travel_time && !parseFlexibleDateTime(travel_time)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid travel time. Use ISO datetime.'
      });
    }

    // Create request with ONLY the fields that exist in DB
    const request = await CabRequest.create({
      employee_id,
      route_id: route_id || null,
      pickup_time: normalizedRequestedTime,
      requested_time: normalizedRequestedTime,
      travel_time: normalizedTravelTime,
      departure_location: departure_location || boarding_area || pickup_location || null,
      destination_location: destination_location || dropping_area || drop_location || null,
      number_of_people: number_of_people ?? 1,
      priority: priority || 'NORMAL',
      request_type: request_type || 'ADHOC',
      boarding_area: boarding_area || pickup_location || null,
      dropping_area: dropping_area || drop_location || null
    });

    await emitNotification(req, employee_id, {
      type: 'REQUEST_CREATED',
      title: 'Cab Request Created',
      message: 'Your cab request has been submitted and is pending approval.',
      data: { request_id: request.id, route_id: request.route_id, route: '/requests' }
    });

    logger.info(`Cab request created: ${request.id}`);

    res.status(201).json({
      success: true,
      data: request,
      message: 'Request created successfully'
    });
  } catch (error) {
    logger.error('Create request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create request'
    });
  }
};

// Update request
exports.updateRequest = async (req, res) => {
  try {
    const existingRequest = await CabRequest.findById(req.params.id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check access
    const userRole = req.user.role;
    if ((userRole === 'EMPLOYEE' || userRole === 'USER') && existingRequest.employee_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Only allow updates if pending (for employees)
    if (existingRequest.status !== 'PENDING' && (userRole === 'EMPLOYEE' || userRole === 'USER')) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update request after it has been processed'
      });
    }

    const {
      route_id,
      pickup_date,
      pickup_time,
      requested_time,
      travel_time,
      pickup_location,
      drop_location,
      departure_location,
      destination_location,
      boarding_area,
      dropping_area,
      status,
      number_of_people,
      priority,
      request_type
    } = req.body;

    const normalizedRequestedTime =
      parseFlexibleDateTime(requested_time) ||
      combinePickupDateTime(pickup_date, pickup_time) ||
      (requested_time !== undefined || pickup_time !== undefined || pickup_date !== undefined ? null : undefined);

    if (
      (requested_time !== undefined || pickup_time !== undefined || pickup_date !== undefined) &&
      normalizedRequestedTime === null
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid requested time. Use ISO datetime or pickup_date + pickup_time.'
      });
    }

    if (normalizedRequestedTime instanceof Date) {
      const leadTimeError = validateBookingLeadTime(normalizedRequestedTime);
      if (leadTimeError) {
        return res.status(400).json({
          success: false,
          error: leadTimeError
        });
      }
    }

    if (normalizedRequestedTime instanceof Date) {
      const conflict = await CabRequest.findConflictingRequest(
        existingRequest.employee_id,
        normalizedRequestedTime,
        req.params.id,
        REQUEST_CONFLICT_WINDOW_MINUTES
      );
      if (conflict) {
        return res.status(400).json({
          success: false,
          error: `Another active booking exists near this time (${REQUEST_CONFLICT_WINDOW_MINUTES} minute window).`
        });
      }
    }

    const normalizedTravelTime =
      parseFlexibleDateTime(travel_time) ||
      (travel_time !== undefined ? null : normalizedRequestedTime);

    if (travel_time !== undefined && !parseFlexibleDateTime(travel_time)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid travel time. Use ISO datetime.'
      });
    }
    
    const request = await CabRequest.update(req.params.id, {
      route_id,
      requested_time: normalizedRequestedTime,
      travel_time: normalizedTravelTime,
      departure_location: departure_location || boarding_area || pickup_location,
      destination_location: destination_location || dropping_area || drop_location,
      boarding_area,
      dropping_area,
      number_of_people,
      priority,
      request_type,
      status
    });

    res.json({
      success: true,
      data: request,
      message: 'Request updated successfully'
    });
  } catch (error) {
    logger.error('Update request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update request'
    });
  }
};

// Delete request
exports.deleteRequest = async (req, res) => {
  try {
    const request = await CabRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check access
    const userRole = req.user.role;
    if ((userRole === 'EMPLOYEE' || userRole === 'USER') && request.employee_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    await CabRequest.delete(req.params.id);

    res.json({
      success: true,
      message: 'Request deleted successfully'
    });
  } catch (error) {
    logger.error('Delete request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete request'
    });
  }
};

// Assign cab to request
exports.assignCab = async (req, res) => {
  try {
    const { cab_id } = req.body;
    
    if (!cab_id) {
      return res.status(400).json({
        success: false,
        error: 'cab_id is required'
      });
    }

    const request = await CabRequest.assignCab(req.params.id, cab_id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Get full request details
    const fullRequest = await CabRequest.findById(req.params.id);
    const employeeId = fullRequest?.employee_id || request.employee_id;
    await emitNotification(req, employeeId, {
      type: 'CAB_ASSIGNED',
      title: 'Cab Assigned',
      message: 'Your cab has been assigned. Please check trip details.',
      data: { request_id: req.params.id, route: '/requests' }
    });

    try {
      const cab = await Cab.findById(cab_id);
      if (cab?.driver_id) {
        await emitNotification(req, cab.driver_id, {
          type: 'DRIVER_ASSIGNMENT',
          title: 'New Passenger Assigned',
          message: 'A passenger has been assigned to your cab route.',
          data: { request_id: req.params.id, route: '/driver' }
        });
      }
    } catch (notifyDriverErr) {
      logger.warn(`Driver assignment notification failed: ${notifyDriverErr.message}`);
    }

    res.json({
      success: true,
      data: fullRequest,
      message: 'Request approved successfully'
    });
  } catch (error) {
    logger.error('Assign cab error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign cab'
    });
  }
};

// Cancel request
exports.cancelRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    
    const request = await CabRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Check access
    const userRole = req.user.role;
    if ((userRole === 'EMPLOYEE' || userRole === 'USER') && request.employee_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const cancelled = await CabRequest.cancel(req.params.id, reason);

    res.json({
      success: true,
      data: cancelled,
      message: 'Request cancelled successfully'
    });
  } catch (error) {
    logger.error('Cancel request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel request'
    });
  }
};

// Mark passenger as boarded
exports.markBoarded = async (req, res) => {
  try {
    const { boarding_area } = req.body;
    
    const request = await CabRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    if (!BOARDING_ALLOWED_STATUSES.has(normalizeStatus(request.status))) {
      return res.status(400).json({
        success: false,
        error: `Cannot board request in ${request.status} status`
      });
    }

    // Update request status
    await CabRequest.update(req.params.id, { status: 'IN_PROGRESS' });

    const assignedCabId = request.assigned_cab_id ?? request.cab_id ?? null;
    if (assignedCabId) {
      try {
        await Cab.updateStatus(assignedCabId, 'ON_TRIP');
      } catch (cabError) {
        logger.warn(`Failed to set cab ON_TRIP for ${assignedCabId}: ${cabError.message}`);
      }
    }

    // Try to update boarding status
    try {
      await BoardingStatus.markBoarded(req.params.id, request.employee_id, boarding_area);
    } catch (err) {
      logger.warn('BoardingStatus update failed:', err.message);
    }

    await emitNotification(req, request.employee_id, {
      type: 'PASSENGER_BOARDED',
      title: 'Boarded',
      message: 'You have been marked as boarded. Trip is in progress.',
      data: { request_id: req.params.id, route: '/requests' }
    });

    res.json({
      success: true,
      message: 'Passenger marked as boarded'
    });
  } catch (error) {
    logger.error('Mark boarded error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as boarded'
    });
  }
};

// Mark passenger as dropped
exports.markDropped = async (req, res) => {
  try {
    const { dropping_area } = req.body;
    
    const request = await CabRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    if (request.status !== 'IN_PROGRESS') {
      return res.status(400).json({
        success: false,
        error: `Cannot drop request in ${request.status} status`
      });
    }

    // Update request status
    await CabRequest.update(req.params.id, { status: 'COMPLETED' });

    // Try to update boarding status
    try {
      await BoardingStatus.markDropped(req.params.id, request.employee_id, dropping_area);
    } catch (err) {
      logger.warn('BoardingStatus update failed:', err.message);
    }

    const assignedCabId = request.assigned_cab_id ?? request.cab_id ?? null;
    if (assignedCabId) {
      try {
        const hasActive = await CabRequest.hasActiveTripsForCab(assignedCabId);
        if (!hasActive) {
          await Cab.updateStatus(assignedCabId, 'AVAILABLE');
        }
      } catch (cabError) {
        logger.warn(`Failed to refresh cab status for ${assignedCabId}: ${cabError.message}`);
      }
    }

    await emitNotification(req, request.employee_id, {
      type: 'PASSENGER_DROPPED',
      title: 'Dropped',
      message: 'You have been marked as dropped. Trip is completed.',
      data: { request_id: req.params.id, route: '/requests' }
    });

    res.json({
      success: true,
      message: 'Passenger marked as dropped'
    });
  } catch (error) {
    logger.error('Mark dropped error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as dropped'
    });
  }
};

// Mark passenger as no-show
exports.markNoShow = async (req, res) => {
  try {
    const request = await CabRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    if (!BOARDING_ALLOWED_STATUSES.has(normalizeStatus(request.status))) {
      return res.status(400).json({
        success: false,
        error: `Cannot mark no-show for request in ${request.status} status`
      });
    }

    if (REQUIRE_CALL_ATTEMPT_FOR_NO_SHOW) {
      const recentCall = await AuditLog.getRecentCallAttempt(req.params.id, CALL_ATTEMPT_WINDOW_MINUTES);
      if (!recentCall) {
        return res.status(400).json({
          success: false,
          error: `Log a passenger call attempt within the last ${CALL_ATTEMPT_WINDOW_MINUTES} minutes before marking no-show.`
        });
      }
    }

    // Update request status
    await CabRequest.update(req.params.id, { status: 'NO_SHOW' });

    // Try to update boarding status
    try {
      await BoardingStatus.markNoShow(req.params.id, request.employee_id);
    } catch (err) {
      logger.warn('BoardingStatus update failed:', err.message);
    }

    const cancelledUpcomingIds = await CabRequest.cancelUpcomingForNoShow(
      request.employee_id,
      req.params.id,
      1
    );

    let reassignedCount = 0;
    if (request.route_id) {
      const baseDate = new Date(request.requested_time || request.pickup_time || new Date());
      const reassignDate = Number.isNaN(baseDate.getTime())
        ? new Date().toISOString().split('T')[0]
        : baseDate.toISOString().split('T')[0];
      const reassignResult = await SmartAllocationService.reassignWaitingPassengers(
        request.route_id,
        reassignDate
      );
      reassignedCount = reassignResult?.reassigned?.length || 0;
    }

    const assignedCabId = request.assigned_cab_id ?? request.cab_id ?? null;
    if (assignedCabId) {
      try {
        const hasActive = await CabRequest.hasActiveTripsForCab(assignedCabId);
        if (!hasActive) {
          await Cab.updateStatus(assignedCabId, 'AVAILABLE');
        }
      } catch (cabError) {
        logger.warn(`Failed to refresh cab status after no-show for ${assignedCabId}: ${cabError.message}`);
      }
    }

    await emitNotification(req, request.employee_id, {
      type: 'PASSENGER_NO_SHOW',
      title: 'Marked as No-Show',
      message: 'You were marked as no-show. Upcoming trips may be cancelled automatically.',
      data: { request_id: req.params.id, route: '/requests' }
    });

    res.json({
      success: true,
      message: 'Passenger marked as no-show',
      data: {
        cancelledUpcomingCount: cancelledUpcomingIds.length,
        reassignedCount
      }
    });
  } catch (error) {
    logger.error('Mark no-show error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as no-show'
    });
  }
};

// Log driver call attempt before no-show
exports.logCallAttempt = async (req, res) => {
  try {
    const { call_status, notes } = req.body;

    const request = await CabRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(request.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot log call attempt for request in ${request.status} status`
      });
    }

    await AuditLog.create({
      user_id: req.user?.id || null,
      action: 'PASSENGER_CALL_ATTEMPT',
      entity_type: 'cab_request',
      entity_id: request.id,
      changes: {
        request_id: request.id,
        employee_id: request.employee_id,
        call_status: call_status || 'ATTEMPTED',
        notes: notes || null,
        logged_at: new Date().toISOString()
      },
      ip_address: getClientIp(req),
      user_agent: req.headers['user-agent'] || null
    });

    res.json({
      success: true,
      message: 'Call attempt logged'
    });
  } catch (error) {
    logger.error('Log call attempt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log call attempt'
    });
  }
};

// Get today's stats
exports.getTodayStats = async (req, res) => {
  try {
    const stats = await CabRequest.getTodayStats();
    const capacity = await SmartAllocationService.getCapacityAnalytics();

    res.json({
      success: true,
      data: {
        ...stats,
        capacity
      }
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
};
