/**
 * src/services/SmartAllocationService.js
 * Core allocation engine with database-level locking and safety
 */

const { sql, getPool, withTransaction } = require('../config/database');
const logger = require('../utils/logger');
const { RaceConditionError, AllocationError, NotFoundError } = require('../utils/errors');
const { istToUTC, formatForResponse } = require('../utils/timezone');
const RouteOptimizationService = require('./RouteOptimizationService');
const Notification = require('../models/Notification');

class SmartAllocationService {
  /**
   * Assign cab to request with database-level locking
   * Prevents race conditions through UPDLOCK
   */
  static async assignCabSafely(requestId, cabId, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await withTransaction(async (tx) => {
          // Step 1: Lock the cab row (prevents concurrent updates)
          const lockResult = await tx.request()
            .input('cabId', sql.Int, cabId)
            .input('status', sql.NVarChar(20), 'AVAILABLE')
            .query(`
              SELECT TOP 1 id, cab_number, capacity, driver_id, current_latitude, current_longitude
              FROM cabs WITH (UPDLOCK, READCOMMITTED)
              WHERE id = @cabId AND status = @status AND is_active = 1
            `);

          // Step 2: Verify cab is still available
          if (lockResult.recordset.length === 0) {
            throw new RaceConditionError('Cab');
          }

          const cab = lockResult.recordset[0];

          // Step 3: Lock the request row
          const requestLockResult = await tx.request()
            .input('requestId', sql.Int, requestId)
            .input('status', sql.NVarChar(50), 'APPROVED')
            .query(`
              SELECT TOP 1 id, employee_id, pickup_time, route_id
              FROM cab_requests WITH (UPDLOCK, READCOMMITTED)
              WHERE id = @requestId AND status IN ('PENDING', 'APPROVED') AND is_active = 1
            `);

          if (requestLockResult.recordset.length === 0) {
            throw new NotFoundError('Request', requestId);
          }

          const request = requestLockResult.recordset[0];

          // Step 4: Update both in atomic transaction
          await tx.request()
            .input('cabId', sql.Int, cabId)
            .input('requestId', sql.Int, requestId)
            .input('assignedAt', sql.DateTime, new Date())
            .input('status', sql.NVarChar(50), 'ASSIGNED')
            .query(`
              BEGIN TRANSACTION;

              UPDATE cabs 
              SET status = 'ASSIGNED', updated_at = GETDATE()
              WHERE id = @cabId;

              UPDATE cab_requests 
              SET cab_id = @cabId, 
                  assigned_at = @assignedAt,
                  status = @status,
                  updated_at = GETDATE()
              WHERE id = @requestId;

              COMMIT TRANSACTION;
            `);

          logger.info('Cab assigned safely', {
            requestId,
            cabId,
            cabNumber: cab.cab_number,
            driverId: cab.driver_id,
            attempt
          });

          return {
            success: true,
            cab,
            request
          };
        });
      } catch (error) {
        lastError = error;

        if (error instanceof RaceConditionError && attempt < maxRetries) {
          logger.warn(`Cab ${cabId} no longer available, retrying attempt ${attempt}/${maxRetries}`);

          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 100));
          continue;
        }

        throw error;
      }
    }

    throw lastError || new AllocationError('Unknown allocation error');
  }

  /**
   * Find best available cabs for a request
   */
  static async findAvailableCabsForRequest(request) {
    const pool = getPool();

    const result = await pool.request()
      .input('status', sql.NVarChar(20), 'AVAILABLE')
      .input('minCapacity', sql.Int, request.passengers || 1)
      .query(`
        SELECT 
          c.id, 
          c.cab_number, 
          c.capacity, 
          c.driver_id, 
          c.current_latitude, 
          c.current_longitude,
          u.name as driver_name,
          ISNULL((SELECT COUNT(*) FROM cab_requests 
                   WHERE cab_id = c.id 
                   AND status IN ('ASSIGNED', 'IN_PROGRESS')
                   AND CAST(pickup_time AS DATE) = CAST(GETDATE() AS DATE)), 0) as current_passengers
        FROM cabs c
        LEFT JOIN users u ON u.id = c.driver_id
        WHERE c.status = @status 
          AND c.is_active = 1
          AND c.capacity >= @minCapacity
        ORDER BY current_passengers ASC, c.capacity ASC, c.id ASC
      `);

    return result.recordset;
  }

  /**
   * Auto-allocate requests within assignment window
   * Called by cron every minute
   */
  static async autoAllocateUpcomingRequests(windowMinutes = 30) {
    try {
      const pool = getPool();
      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowMinutes * 60000);

      // Find unallocated requests within time window
      const requestsResult = await pool.request()
        .input('windowStart', sql.DateTime, now)
        .input('windowEnd', sql.DateTime, windowEnd)
        .query(`
          SELECT TOP 100
            cr.id, 
            cr.employee_id, 
            cr.pickup_location, 
            cr.drop_location,
            cr.pickup_time,
            cr.passengers,
            cr.route_id,
            u.name as employee_name,
            r.name as route_name
          FROM cab_requests cr
          INNER JOIN users u ON u.id = cr.employee_id
          LEFT JOIN routes r ON r.id = cr.route_id
          WHERE cr.status = 'APPROVED'
            AND cr.is_active = 1
            AND cr.cab_id IS NULL
            AND cr.pickup_time BETWEEN @windowStart AND @windowEnd
          ORDER BY cr.pickup_time ASC, cr.created_at ASC
        `);

      const requests = requestsResult.recordset;
      let totalAllocations = 0;
      const processedRoutes = new Set();

      for (const request of requests) {
        try {
          // Get available cabs for this request
          const availableCabs = await this.findAvailableCabsForRequest(request);

          if (availableCabs.length === 0) {
            logger.warn(`No available cabs for request ${request.id}`, {
              employee: request.employee_name,
              pickupTime: request.pickup_time
            });
            continue;
          }

          // Score cabs using optimization service
          const scoredCabs = availableCabs.map(cab => ({
            ...cab,
            score: this.scoreCab(cab, request)
          })).sort((a, b) => b.score - a.score);

          const bestCab = scoredCabs[0];

          // Assign cab (with retry logic)
          const result = await this.assignCabSafely(request.id, bestCab.id);

          totalAllocations++;
          processedRoutes.add(request.route_id);

          // Notify driver and employee
          await this.notifyAllocation(request, bestCab);

          logger.info(`Request ${request.id} allocated to cab ${bestCab.cab_number}`, {
            employee: request.employee_name,
            cabNumber: bestCab.cab_number,
            driverId: bestCab.driver_id
          });
        } catch (error) {
          logger.warn(`Failed to allocate request ${request.id}:`, error.message);
          // Continue with next request
        }
      }

      return {
        success: true,
        totalAllocations,
        requestsProcessed: requests.length,
        processedRoutes: processedRoutes.size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Auto-allocation error:', error);
      return {
        success: false,
        error: error.message,
        totalAllocations: 0,
        requestsProcessed: 0
      };
    }
  }

  /**
   * Score cab for a request (higher score = better match)
   */
  static scoreCab(cab, request) {
    let score = 0;

    // Capacity fit (prefer exact fit, penalize excess seats)
    const passengers = request.passengers || 1;
    const availableSeats = cab.capacity - passengers;
    score += (cab.capacity === passengers ? 50 : 0); // Exact fit
    score -= availableSeats * 2; // Penalize empty seats

    // Current load (prefer less loaded cabs)
    score += (10 - cab.current_passengers) * 5;

    // Driver availability (prefer cabs with assigned drivers)
    score += cab.driver_id ? 30 : 0;

    // Distance from request (prefer closer cabs)
    if (cab.current_latitude && cab.current_longitude && 
        request.pickup_latitude && request.pickup_longitude) {
      const distance = this.calculateDistance(
        cab.current_latitude, cab.current_longitude,
        request.pickup_latitude, request.pickup_longitude
      );
      score -= distance * 0.5; // Penalty for distance
    }

    return Math.max(0, score);
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const toRad = deg => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Notify driver and employee of allocation
   */
  static async notifyAllocation(request, cab) {
    // Notify driver
    await Notification.create({
      user_id: cab.driver_id,
      type: 'CAB_ASSIGNED',
      title: `New trip assigned`,
      message: `Trip for ${request.passengers || 1} passenger(s) from ${request.pickup_location} to ${request.drop_location}`,
      data: {
        requestId: request.id,
        cabId: cab.id,
        cabNumber: cab.cab_number,
        employeeName: request.employee_name,
        pickupTime: request.pickup_time
      }
    });

    // Notify employee
    await Notification.create({
      user_id: request.employee_id,
      type: 'CAB_ASSIGNED',
      title: `Cab assigned to your request`,
      message: `Cab ${cab.cab_number} with driver ${cab.driver_name} has been assigned`,
      data: {
        requestId: request.id,
        cabId: cab.id,
        cabNumber: cab.cab_number,
        driverName: cab.driver_name,
        driverPhone: cab.driver_phone
      }
    });
  }

  /**
   * Check traffic and notify on delays
   */
  static async checkTrafficAndNotify(routeId) {
    try {
      // TODO: Integrate with Google Maps API for real-time traffic
      // This is a placeholder for future enhancement
      logger.info(`Traffic check for route ${routeId}`);
      return { success: true };
    } catch (error) {
      logger.error('Traffic check error:', error);
      return { success: false };
    }
  }

  /**
   * Predict optimal departure time
   */
  static async predictOptimalDepartureTime(routeId, arrivalTime) {
    try {
      const pool = getPool();

      // Get route details
      const routeResult = await pool.request()
        .input('routeId', sql.Int, routeId)
        .query(`
          SELECT estimated_time_minutes FROM routes WHERE id = @routeId
        `);

      if (routeResult.recordset.length === 0) {
        throw new NotFoundError('Route', routeId);
      }

      const route = routeResult.recordset[0];
      const estimatedMinutes = route.estimated_time_minutes || 30;

      // Calculate departure time (add buffer)
      const bufferMinutes = 15;
      const departureTime = new Date(arrivalTime);
      departureTime.setMinutes(departureTime.getMinutes() - estimatedMinutes - bufferMinutes);

      return {
        routeId,
        arrivalTime,
        estimatedTravelTime: estimatedMinutes,
        bufferTime: bufferMinutes,
        recommendedDepartureTime: departureTime.toISOString()
      };
    } catch (error) {
      logger.error('Optimal departure prediction error:', error);
      throw error;
    }
  }

  /**
   * Reassign waiting passengers to different cabs
   */
  static async reassignWaitingPassengers(routeId, date) {
    try {
      const pool = getPool();

      // Find waiting passengers
      const waitingResult = await pool.request()
        .input('routeId', sql.Int, routeId)
        .input('date', sql.DateTime, new Date(date))
        .query(`
          SELECT id, employee_id, pickup_time, passengers
          FROM cab_requests
          WHERE route_id = @routeId
            AND CAST(pickup_time AS DATE) = CAST(@date AS DATE)
            AND status IN ('PENDING', 'APPROVED')
            AND cab_id IS NULL
            AND is_active = 1
        `);

      const waitingPassengers = waitingResult.recordset;
      const reassigned = [];

      for (const passenger of waitingPassengers) {
        try {
          const result = await this.autoAllocateUpcomingRequests(30);
          if (result.success && result.totalAllocations > 0) {
            reassigned.push(passenger.id);
          }
        } catch (error) {
          logger.warn(`Failed to reassign passenger ${passenger.id}:`, error.message);
        }
      }

      return {
        success: true,
        routeId,
        date,
        waitingPassengers: waitingPassengers.length,
        reassigned: reassigned.length
      };
    } catch (error) {
      logger.error('Reassignment error:', error);
      throw error;
    }
  }
}

module.exports = SmartAllocationService;
