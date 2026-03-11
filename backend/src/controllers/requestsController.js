const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, AllocationError } = require('../utils/errors');
const CabRequest = require('../models/CabRequest');
const Cab = require('../models/Cab');
const SmartAllocationService = require('../services/SmartAllocationService');
const Notification = require('../models/Notification');
const BoardingStatus = require('../models/BoardingStatus');
const { getPool } = require('../config/database');
const logger = require('../utils/logger');

const normalizeId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? value : parsed;
};

exports.getAllRequests = asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, status, employeeId, employee_id, cabId, date, fromDate, toDate, my_requests } = req.query;
  const parsedLimit = Number.parseInt(limit, 10);
  const parsedOffset = Number.parseInt(offset, 10);

  if (parsedLimit < 1 || parsedLimit > 100) {
    throw new ValidationError('Limit must be between 1 and 100');
  }
  if (parsedOffset < 0) {
    throw new ValidationError('Offset must be >= 0');
  }

  const filters = {};
  if (status) filters.status = status;
  if (cabId) filters.cabId = cabId;
  if (date) filters.date = date;
  if (fromDate && toDate) {
    filters.fromDate = fromDate;
    filters.toDate = toDate;
  }

  if (my_requests === 'true') {
    filters.employeeId = req.user.id;
  } else if (employeeId || employee_id) {
    filters.employeeId = employeeId || employee_id;
  }

  const requests = await CabRequest.findAll(filters, parsedLimit, parsedOffset);

  res.json({
    success: true,
    data: requests,
    pagination: {
      limit: parsedLimit,
      offset: parsedOffset,
      count: requests.length
    }
  });
});

exports.getRequest = asyncHandler(async (req, res) => {
  const request = await CabRequest.findById(normalizeId(req.params.id));
  if (!request) {
    throw new NotFoundError('Request', req.params.id);
  }

  res.json({
    success: true,
    data: request
  });
});

exports.createRequest = asyncHandler(async (req, res) => {
  const {
    pickup_location,
    drop_location,
    pickup_time,
    passengers = 1,
    purpose,
    request_type,
    route_id,
    pickup_latitude,
    pickup_longitude,
    drop_latitude,
    drop_longitude
  } = req.body;

  if (!pickup_location || !drop_location || !pickup_time) {
    throw new ValidationError('Missing required fields: pickup_location, drop_location, pickup_time');
  }

  if (Number(passengers) < 1 || Number(passengers) > 10) {
    throw new ValidationError('Passengers must be between 1 and 10');
  }

  const request = await CabRequest.create({
    employee_id: req.user.id,
    pickup_location,
    drop_location,
    pickup_latitude,
    pickup_longitude,
    drop_latitude,
    drop_longitude,
    pickup_time,
    passengers,
    purpose,
    route_id: normalizeId(route_id),
    request_type: request_type || 'ADHOC'
  });

  try {
    setImmediate(() => {
      SmartAllocationService.autoAllocateUpcomingRequests(30)
        .then((result) => {
          if (result.success && result.totalAllocations > 0) {
            logger.info(`Auto-allocation completed for request ${request.id}`);
          }
        })
        .catch((error) => logger.warn('Auto-allocation failed:', error.message));
    });
  } catch (error) {
    logger.warn('Could not trigger auto-allocation:', error.message);
  }

  await Notification.create({
    user_id: req.user.id,
    type: 'REQUEST_CREATED',
    title: 'Cab request submitted',
    message: `Your request from ${pickup_location} to ${drop_location} has been submitted`,
    data: { requestId: request.id }
  });

  res.status(201).json({
    success: true,
    data: request,
    message: 'Request created successfully. Searching for available cabs...'
  });
});

exports.assignCab = asyncHandler(async (req, res) => {
  const { cab_id } = req.body;

  if (!cab_id) {
    throw new ValidationError('cab_id is required');
  }

  const requestId = normalizeId(req.params.id);
  const cabId = normalizeId(cab_id);

  const result = await SmartAllocationService.assignCabSafely(requestId, cabId, 3);
  if (!result.success) {
    throw new AllocationError('Failed to assign cab to request');
  }

  const request = await CabRequest.findById(requestId);

  await Promise.all([
    Notification.create({
      user_id: result.cab.driver_id,
      type: 'CAB_ASSIGNED',
      title: 'New trip assigned',
      message: `New trip assigned for ${request.passengers || 1} passengers`,
      data: { requestId, cabId, pickupTime: request.pickup_time }
    }),
    Notification.create({
      user_id: request.employee_id,
      type: 'CAB_ASSIGNED',
      title: 'Cab assigned to your request',
      message: `Cab ${result.cab.cab_number} has been assigned`,
      data: { requestId, cabId, cabNumber: result.cab.cab_number }
    })
  ]);

  res.json({
    success: true,
    data: request,
    message: `Cab ${result.cab.cab_number} assigned successfully`
  });
});

exports.markBoarded = asyncHandler(async (req, res) => {
  const { boarding_area, boarding_latitude, boarding_longitude } = req.body;
  if (!boarding_area) {
    throw new ValidationError('boarding_area is required');
  }

  if (boarding_latitude && boarding_longitude) {
    const distance = SmartAllocationService.calculateDistance(
      Number(boarding_latitude),
      Number(boarding_longitude),
      Number(process.env.OFFICE_LATITUDE),
      Number(process.env.OFFICE_LONGITUDE)
    );

    const maxDistance = Number.parseFloat(process.env.OFFICE_GEOFENCE_RADIUS_KM || '1');
    if (distance > maxDistance) {
      throw new ValidationError(`Boarding location is ${distance.toFixed(2)}km away, max is ${maxDistance}km`);
    }
  }

  const requestId = normalizeId(req.params.id);
  const request = await CabRequest.markBoarded(requestId, new Date(), boarding_area, req.user.id);
  await BoardingStatus.markBoarded(requestId, request.employee_id, boarding_area);

  await Notification.create({
    user_id: request.employee_id,
    type: 'TRIP_STARTED',
    title: 'Trip started',
    message: `You have been picked up from ${boarding_area}`,
    data: { requestId }
  });

  res.json({
    success: true,
    data: request,
    message: 'Marked as boarded successfully'
  });
});

exports.markDropped = asyncHandler(async (req, res) => {
  const { dropping_area } = req.body;
  if (!dropping_area) {
    throw new ValidationError('dropping_area is required');
  }

  const requestId = normalizeId(req.params.id);
  const request = await CabRequest.markDropped(requestId, new Date(), dropping_area, req.user.id);
  await BoardingStatus.markDropped(requestId, request.employee_id, dropping_area);

  await Notification.create({
    user_id: request.employee_id,
    type: 'TRIP_COMPLETED',
    title: 'Trip completed',
    message: `You have been dropped at ${dropping_area}`,
    data: { requestId }
  });

  res.json({
    success: true,
    data: request,
    message: 'Marked as dropped successfully'
  });
});

exports.markNoShow = asyncHandler(async (req, res) => {
  const requestId = normalizeId(req.params.id);
  const request = await CabRequest.cancel(
    requestId,
    `NO_SHOW: ${req.body?.reason || 'Passenger unavailable'}`,
    req.user.id
  );
  if (request?.employee_id) {
    await BoardingStatus.markNoShow(requestId, request.employee_id, req.body?.reason || 'Passenger unavailable');
  }

  res.json({
    success: true,
    data: request,
    message: 'Marked as no-show'
  });
});

exports.cancelRequest = asyncHandler(async (req, res) => {
  const requestId = normalizeId(req.params.id);
  const reason = req.body?.reason || 'Cancelled by user';

  const request = await CabRequest.cancel(requestId, reason, req.user.id);

  if (request.cab_id) {
    const cab = await Cab.findById(request.cab_id);
    if (cab && cab.driver_id) {
      await Notification.create({
        user_id: cab.driver_id,
        type: 'REQUEST_CANCELLED',
        title: 'Trip cancelled',
        message: `Trip cancelled by employee: ${reason}`,
        data: { requestId, cabId: request.cab_id }
      });
    }
  }

  res.json({
    success: true,
    data: request,
    message: 'Request cancelled successfully'
  });
});

exports.logCallAttempt = asyncHandler(async (req, res) => {
  const outcome = String(req.body?.outcome || req.body?.call_status || '').trim().toUpperCase();
  const notes = req.body?.notes;
  if (!outcome || !['ANSWERED', 'BUSY', 'MISSED', 'INVALID', 'ATTEMPTED', 'NO_PHONE'].includes(outcome)) {
    throw new ValidationError('Invalid outcome value');
  }

  logger.info(`Call attempt logged for request ${req.params.id}`, {
    outcome,
    notes,
    calledBy: req.user.id
  });

  res.json({
    success: true,
    message: 'Call attempt logged'
  });
});

exports.getStatistics = asyncHandler(async (req, res) => {
  const pool = getPool();
  const rangeDays = Math.min(Math.max(Number.parseInt(req.query?.days || '7', 10), 1), 90);
  const summary = await pool.request()
    .input('rangeDays', rangeDays)
    .query(`
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'ASSIGNED' THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
        AVG(CASE WHEN actual_pickup_time IS NOT NULL THEN DATEDIFF(MINUTE, pickup_time, actual_pickup_time) * 1.0 END) AS average_wait_minutes
      FROM cab_requests
      WHERE pickup_time >= DATEADD(DAY, -@rangeDays, GETDATE())
    `);
  const peakHours = await pool.request()
    .input('rangeDays', rangeDays)
    .query(`
      SELECT TOP 5
        DATEPART(HOUR, pickup_time) AS pickup_hour,
        COUNT(*) AS total
      FROM cab_requests
      WHERE pickup_time >= DATEADD(DAY, -@rangeDays, GETDATE())
      GROUP BY DATEPART(HOUR, pickup_time)
      ORDER BY total DESC, pickup_hour ASC
    `);

  res.json({
    success: true,
    data: {
      totalRequests: summary.recordset[0]?.total_requests || 0,
      completed: summary.recordset[0]?.completed || 0,
      cancelled: summary.recordset[0]?.cancelled || 0,
      pending: summary.recordset[0]?.pending || 0,
      assigned: summary.recordset[0]?.assigned || 0,
      inProgress: summary.recordset[0]?.in_progress || 0,
      averageWaitTime: Number(summary.recordset[0]?.average_wait_minutes || 0),
      peakHours: peakHours.recordset || []
    }
  });
});

exports.approveRequest = asyncHandler(async (req, res) => {
  const requestId = normalizeId(req.params.id);
  const request = await CabRequest.updateStatus(requestId, 'APPROVED', req.user.id);

  await Notification.create({
    user_id: request.employee_id,
    type: 'REQUEST_APPROVED',
    title: 'Request approved',
    message: 'Your cab request has been approved',
    data: { requestId }
  });

  res.json({
    success: true,
    data: request,
    message: 'Request approved successfully'
  });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    throw new ValidationError('reason is required');
  }

  const requestId = normalizeId(req.params.id);
  const request = await CabRequest.cancel(requestId, `REJECTED: ${reason}`, req.user.id);

  await Notification.create({
    user_id: request.employee_id,
    type: 'REQUEST_REJECTED',
    title: 'Request rejected',
    message: `Your request was rejected: ${reason}`,
    data: { requestId }
  });

  res.json({
    success: true,
    data: request,
    message: 'Request rejected'
  });
});

exports.updateRequest = asyncHandler(async (req, res) => {
  const request = await CabRequest.update(normalizeId(req.params.id), req.body);
  res.json({
    success: true,
    data: request,
    message: 'Request updated successfully'
  });
});

exports.deleteRequest = asyncHandler(async (req, res) => {
  await CabRequest.softDelete(normalizeId(req.params.id), req.user.id);
  res.json({
    success: true,
    message: 'Request deleted successfully'
  });
});

exports.getRequests = exports.getAllRequests;
exports.getRequestById = exports.getRequest;
exports.getTodayStats = exports.getStatistics;
