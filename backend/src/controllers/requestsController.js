// src/controllers/requestsController.js
const { validationResult } = require('express-validator');
const CabRequest = require('../models/CabRequest');
const BoardingStatus = require('../models/BoardingStatus');
const Notification = require('../models/Notification');
const SmartAllocationService = require('../ai/SmartAllocationService');
const logger = require('../utils/logger');

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
      dropping_area
    } = req.body;
    const normalizedRequestedTime =
      parseFlexibleDateTime(requested_time) ||
      combinePickupDateTime(pickup_date, pickup_time) ||
      parseFlexibleDateTime(pickup_time);

    if ((requested_time || pickup_time || pickup_date) && !normalizedRequestedTime) {
      return res.status(400).json({
        success: false,
        error: 'Invalid requested time. Use ISO datetime or pickup_date + pickup_time.'
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

    // Use current user as employee
    const employee_id = req.user.id;

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
      boarding_area: boarding_area || pickup_location || null,
      dropping_area: dropping_area || drop_location || null
    });

    // Try to create notification (may fail if notifications table is different)
    try {
      await Notification.create({
        user_id: employee_id,
        type: 'REQUEST_CREATED',
        title: 'Cab Request Created',
        message: 'Your cab request has been submitted and is pending approval.'
      });
    } catch (notifError) {
      logger.warn('Failed to create notification:', notifError.message);
    }

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
      priority
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

    // Update request status
    await CabRequest.update(req.params.id, { status: 'IN_PROGRESS' });

    // Try to update boarding status
    try {
      await BoardingStatus.markBoarded(req.params.id, request.employee_id, boarding_area);
    } catch (err) {
      logger.warn('BoardingStatus update failed:', err.message);
    }

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

    // Update request status
    await CabRequest.update(req.params.id, { status: 'COMPLETED' });

    // Try to update boarding status
    try {
      await BoardingStatus.markDropped(req.params.id, request.employee_id, dropping_area);
    } catch (err) {
      logger.warn('BoardingStatus update failed:', err.message);
    }

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

    // Update request status
    await CabRequest.update(req.params.id, { status: 'NO_SHOW' });

    // Try to update boarding status
    try {
      await BoardingStatus.markNoShow(req.params.id, request.employee_id);
    } catch (err) {
      logger.warn('BoardingStatus update failed:', err.message);
    }

    res.json({
      success: true,
      message: 'Passenger marked as no-show'
    });
  } catch (error) {
    logger.error('Mark no-show error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as no-show'
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
