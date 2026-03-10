// src/controllers/routesController.js
const { validationResult } = require('express-validator');
const Route = require('../models/Route');
const RouteStop = require('../models/RouteStop');
const SmartAllocationService = require('../ai/SmartAllocationService');
const logger = require('../utils/logger');

// Get all routes
exports.getRoutes = async (req, res) => {
  try {
    const routes = await Route.findAll();
    
    res.json({
      success: true,
      data: routes,
      count: routes.length
    });
  } catch (error) {
    logger.error('Get routes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch routes'
    });
  }
};

// Get route by ID
exports.getRouteById = async (req, res) => {
  try {
    const route = await Route.getRouteWithAssignments(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    }

    res.json({
      success: true,
      data: route
    });
  } catch (error) {
    logger.error('Get route error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch route'
    });
  }
};

// Create route
exports.createRoute = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { 
      name, start_point, end_point, 
      start_latitude, start_longitude, 
      end_latitude, end_longitude,
      waypoints, distance_km, estimated_time_minutes 
      , trip_type, standard_pickup_time, stops = []
    } = req.body;

    // Calculate distance and time if not provided
    let calcDistance = distance_km;
    let calcTime = estimated_time_minutes;

    if (!calcDistance && start_latitude && end_latitude) {
      const calculated = await Route.getOptimalRoute(
        start_latitude, start_longitude,
        end_latitude, end_longitude,
        waypoints
      );
      calcDistance = calculated.distance_km;
      calcTime = calculated.estimated_time_minutes;
    }

    const route = await Route.create({
      name,
      start_point,
      end_point,
      start_latitude,
      start_longitude,
      end_latitude,
      end_longitude,
      waypoints,
      distance_km: calcDistance,
      estimated_time_minutes: calcTime,
      trip_type,
      standard_pickup_time
    });

    if (Array.isArray(stops) && stops.length > 0) {
      route.stops = await RouteStop.replaceForRoute(route.id, stops);
    }

    res.status(201).json({
      success: true,
      data: route,
      message: 'Route created successfully'
    });
  } catch (error) {
    logger.error('Create route error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create route'
    });
  }
};

// Update route
exports.updateRoute = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const existingRoute = await Route.findById(req.params.id);
    if (!existingRoute) {
      return res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    }

    const route = await Route.update(req.params.id, req.body);
    if (Array.isArray(req.body.stops)) {
      route.stops = await RouteStop.replaceForRoute(req.params.id, req.body.stops);
    }

    res.json({
      success: true,
      data: route,
      message: 'Route updated successfully'
    });
  } catch (error) {
    logger.error('Update route error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update route'
    });
  }
};

// Delete route
exports.deleteRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    }

    await Route.delete(req.params.id);

    res.json({
      success: true,
      message: 'Route deactivated successfully'
    });
  } catch (error) {
    logger.error('Delete route error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete route'
    });
  }
};

// Auto-allocate cabs for route (AI-powered)
exports.autoAllocate = async (req, res) => {
  try {
    const { date } = req.body;
    const allocationDate = date || new Date().toISOString().split('T')[0];

    const result = await SmartAllocationService.allocateCabsForRoute(
      req.params.id, 
      allocationDate
    );

    res.json({
      success: true,
      data: result,
      message: `Allocated ${result.allocations?.length || 0} requests`
    });
  } catch (error) {
    logger.error('Auto allocate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to allocate cabs'
    });
  }
};

// Check traffic for route
exports.checkTraffic = async (req, res) => {
  try {
    const result = await SmartAllocationService.checkTrafficAndNotify(req.params.id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Check traffic error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check traffic'
    });
  }
};

// Get optimal departure time
exports.getOptimalDeparture = async (req, res) => {
  try {
    const { arrival_time } = req.query;
    
    if (!arrival_time) {
      return res.status(400).json({
        success: false,
        error: 'arrival_time query parameter is required'
      });
    }

    const result = await SmartAllocationService.predictOptimalDepartureTime(
      req.params.id,
      arrival_time
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get optimal departure error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate optimal departure'
    });
  }
};

// Reassign waiting passengers
exports.reassignWaiting = async (req, res) => {
  try {
    const { date } = req.body;
    const reassignDate = date || new Date().toISOString().split('T')[0];

    const result = await SmartAllocationService.reassignWaitingPassengers(
      req.params.id,
      reassignDate
    );

    res.json({
      success: true,
      data: result,
      message: `Reassigned ${result.reassigned?.length || 0} passengers`
    });
  } catch (error) {
    logger.error('Reassign waiting error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reassign passengers'
    });
  }
};
