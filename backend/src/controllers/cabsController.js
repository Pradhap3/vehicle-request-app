// src/controllers/cabsController.js
const { validationResult } = require('express-validator');
const Cab = require('../models/Cab');
const CabRequest = require('../models/CabRequest');
const Route = require('../models/Route');
const RouteStop = require('../models/RouteStop');
const RecurringTransportService = require('../services/RecurringTransportService');
const logger = require('../utils/logger');

// Get all cabs
exports.getCabs = async (req, res) => {
  try {
    const cabs = await Cab.findAll();
    
    res.json({
      success: true,
      data: cabs,
      count: cabs.length
    });
  } catch (error) {
    logger.error('Get cabs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cabs'
    });
  }
};

// Get cab by ID
exports.getCabById = async (req, res) => {
  try {
    const cab = await Cab.findById(req.params.id);
    
    if (!cab) {
      return res.status(404).json({
        success: false,
        error: 'Cab not found'
      });
    }

    res.json({
      success: true,
      data: cab
    });
  } catch (error) {
    logger.error('Get cab error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cab'
    });
  }
};

// Create cab
exports.createCab = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { cab_number, capacity, driver_id } = req.body;

    const cab = await Cab.create({
      cab_number,
      capacity,
      driver_id
    });

    res.status(201).json({
      success: true,
      data: cab,
      message: 'Cab created successfully'
    });
  } catch (error) {
    logger.error('Create cab error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create cab'
    });
  }
};

// Update cab
exports.updateCab = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const existingCab = await Cab.findById(req.params.id);
    if (!existingCab) {
      return res.status(404).json({
        success: false,
        error: 'Cab not found'
      });
    }

    const { cab_number, capacity, driver_id, status } = req.body;

    const cab = await Cab.update(req.params.id, {
      cab_number,
      capacity,
      driver_id,
      status
    });

    res.json({
      success: true,
      data: cab,
      message: 'Cab updated successfully'
    });
  } catch (error) {
    logger.error('Update cab error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update cab'
    });
  }
};

// Delete cab
exports.deleteCab = async (req, res) => {
  try {
    const cab = await Cab.findById(req.params.id);
    
    if (!cab) {
      return res.status(404).json({
        success: false,
        error: 'Cab not found'
      });
    }

    await Cab.delete(req.params.id);

    res.json({
      success: true,
      message: 'Cab deactivated successfully'
    });
  } catch (error) {
    logger.error('Delete cab error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete cab'
    });
  }
};

// Update cab location (for drivers)
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    // Find the cab assigned to this driver
    const cab = await Cab.findByDriverId(req.user.id);
    
    if (!cab) {
      return res.status(404).json({
        success: false,
        error: 'No cab assigned to this driver'
      });
    }

    const updatedCab = await Cab.updateLocation(cab.id, latitude, longitude);

    // Emit socket event for real-time tracking
    if (req.io) {
      req.io.emit('cab_location_update', {
        cab_id: cab.id,
        cab_number: cab.cab_number,
        latitude,
        longitude,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      data: updatedCab,
      message: 'Location updated'
    });
  } catch (error) {
    logger.error('Update location error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update location'
    });
  }
};

// Get cab location history
exports.getLocationHistory = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date) : new Date();

    const history = await Cab.getLocationHistory(req.params.id, startDate, endDate);

    res.json({
      success: true,
      data: history,
      count: history.length
    });
  } catch (error) {
    logger.error('Get location history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location history'
    });
  }
};

// Get available cabs
exports.getAvailableCabs = async (req, res) => {
  try {
    const { capacity } = req.query;
    const cabs = await Cab.findAvailable(parseInt(capacity) || 1);

    res.json({
      success: true,
      data: cabs,
      count: cabs.length
    });
  } catch (error) {
    logger.error('Get available cabs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available cabs'
    });
  }
};

// Update cab status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = ['AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'OFF_DUTY', 'MAINTENANCE'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const cab = await Cab.updateStatus(req.params.id, status);

    // Emit socket event
    if (req.io) {
      req.io.emit('cab_status_update', {
        cab_id: cab.id,
        cab_number: cab.cab_number,
        status,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      data: cab,
      message: 'Status updated'
    });
  } catch (error) {
    logger.error('Update status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status'
    });
  }
};

// Get driver's cab and assignments
exports.getDriverDashboard = async (req, res) => {
  try {
    await RecurringTransportService.ensureDailyTrips(new Date(), { io: req.io });
    const cab = await Cab.findByDriverId(req.user.id);
    
    if (!cab) {
      return res.json({
        success: true,
        data: {
          cab: null,
          assignments: []
        }
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const assignments = await CabRequest.getAssignedRequestsForCab(cab.id, today);
    const primaryRouteId = assignments[0]?.route_id || null;
    const route = primaryRouteId ? await Route.findById(primaryRouteId) : null;
    const stops = primaryRouteId ? await RouteStop.findByRouteId(primaryRouteId) : [];

    res.json({
      success: true,
      data: {
        cab,
        route: route ? { ...route, stops } : null,
        assignments,
        passengers: assignments,
        locationEnabled: !!(cab.current_latitude && cab.current_longitude)
      }
    });
  } catch (error) {
    logger.error('Get driver dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch driver dashboard'
    });
  }
};
