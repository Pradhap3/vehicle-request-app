// src/ai/SmartAllocationService.js
// Simplified to work with actual database schema
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class SmartAllocationService {
  
  // Get capacity analytics - simplified without pickup_time/cab_id columns
  static async getCapacityAnalytics(date) {
    try {
      const pool = getPool();
      
      // Get total cabs and their capacity
      const cabsResult = await pool.request().query(`
        SELECT 
          COUNT(*) as total_cabs,
          SUM(capacity) as total_capacity,
          SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_cabs,
          SUM(CASE WHEN status = 'AVAILABLE' THEN capacity ELSE 0 END) as available_capacity
        FROM cabs
        WHERE is_active = 1
      `);
      
      // Get today's request count
      const requestsResult = await pool.request().query(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_requests,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_requests
        FROM cab_requests
        WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)
      `);
      
      const cabs = cabsResult.recordset[0] || {};
      const requests = requestsResult.recordset[0] || {};
      
      return {
        totalCabs: cabs.total_cabs || 0,
        totalCapacity: cabs.total_capacity || 0,
        availableCabs: cabs.available_cabs || 0,
        availableCapacity: cabs.available_capacity || 0,
        totalRequests: requests.total_requests || 0,
        pendingRequests: requests.pending_requests || 0,
        approvedRequests: requests.approved_requests || 0,
        utilizationRate: cabs.total_capacity > 0 
          ? Math.round((requests.total_requests / cabs.total_capacity) * 100) 
          : 0
      };
    } catch (error) {
      logger.error('Error getting capacity analytics:', error);
      return {
        totalCabs: 0,
        totalCapacity: 0,
        availableCabs: 0,
        availableCapacity: 0,
        totalRequests: 0,
        pendingRequests: 0,
        approvedRequests: 0,
        utilizationRate: 0
      };
    }
  }

  // Smart cab allocation for a route
  static async allocateCabsForRoute(routeId, date) {
    try {
      const pool = getPool();
      
      // Get pending requests for this route
      const requestsResult = await pool.request()
        .input('route_id', sql.NVarChar(255), routeId)
        .query(`
          SELECT cr.*, e.name as employee_name
          FROM cab_requests cr
          INNER JOIN users e ON cr.employee_id = e.id
          WHERE cr.route_id = @route_id AND cr.status = 'PENDING'
          ORDER BY cr.created_at
        `);
      
      const pendingRequests = requestsResult.recordset;
      
      if (pendingRequests.length === 0) {
        return { success: true, message: 'No pending requests', allocations: [] };
      }
      
      // Get available cabs
      const cabsResult = await pool.request().query(`
        SELECT * FROM cabs 
        WHERE status = 'AVAILABLE' AND is_active = 1
        ORDER BY capacity DESC
      `);
      
      const availableCabs = cabsResult.recordset;
      
      if (availableCabs.length === 0) {
        return { success: false, message: 'No cabs available', allocations: [] };
      }
      
      // Simple allocation: assign requests to cabs based on capacity
      const allocations = [];
      let cabIndex = 0;
      let currentCabPassengers = 0;
      
      for (const request of pendingRequests) {
        if (cabIndex >= availableCabs.length) break;
        
        const cab = availableCabs[cabIndex];
        
        if (currentCabPassengers >= cab.capacity) {
          cabIndex++;
          currentCabPassengers = 0;
          if (cabIndex >= availableCabs.length) break;
        }
        
        // Approve the request
        await pool.request()
          .input('id', sql.NVarChar(255), request.id)
          .query(`UPDATE cab_requests SET status = 'APPROVED' WHERE id = @id`);
        
        allocations.push({
          requestId: request.id,
          employeeName: request.employee_name,
          cabNumber: availableCabs[cabIndex].cab_number,
          cabId: availableCabs[cabIndex].id
        });
        
        currentCabPassengers++;
      }
      
      logger.info(`Auto-allocated ${allocations.length} requests for route ${routeId}`);
      
      return {
        success: true,
        message: `Allocated ${allocations.length} requests to ${cabIndex + 1} cab(s)`,
        allocations
      };
    } catch (error) {
      logger.error('Error allocating cabs:', error);
      return { success: false, message: error.message, allocations: [] };
    }
  }

  // Check traffic conditions (simplified - returns mock data)
  static async checkTrafficConditions(routeId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('route_id', sql.NVarChar(255), routeId)
        .query(`SELECT * FROM routes WHERE id = @route_id`);
      
      const route = result.recordset[0];
      
      if (!route) {
        return { error: 'Route not found' };
      }
      
      // Mock traffic data (would integrate with Google Maps API in production)
      const conditions = ['clear', 'moderate', 'heavy'];
      const randomCondition = conditions[Math.floor(Math.random() * 3)];
      const delayMinutes = randomCondition === 'clear' ? 0 : 
                          randomCondition === 'moderate' ? 10 : 25;
      
      return {
        routeId,
        routeName: route.name,
        startPoint: route.start_point,
        endPoint: route.end_point,
        estimatedTime: route.estimated_time_minutes,
        trafficCondition: randomCondition,
        delayMinutes,
        adjustedTime: route.estimated_time_minutes + delayMinutes,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error checking traffic:', error);
      return { error: error.message };
    }
  }

  // Get optimal departure time
  static async getOptimalDepartureTime(routeId, arrivalTime) {
    try {
      const traffic = await this.checkTrafficConditions(routeId);
      
      if (traffic.error) {
        return { error: traffic.error };
      }
      
      const arrivalDate = new Date(arrivalTime || new Date());
      const departureDate = new Date(arrivalDate.getTime() - (traffic.adjustedTime * 60000));
      
      return {
        routeId,
        routeName: traffic.routeName,
        desiredArrival: arrivalDate.toISOString(),
        recommendedDeparture: departureDate.toISOString(),
        estimatedTravelTime: traffic.adjustedTime,
        trafficCondition: traffic.trafficCondition
      };
    } catch (error) {
      logger.error('Error getting optimal departure:', error);
      return { error: error.message };
    }
  }

  // Reassign waiting passengers (no-shows)
  static async reassignWaitingPassengers(routeId, date) {
    try {
      // This would handle no-show reassignment
      // For now, just log and return
      logger.info(`Checking for no-show reassignments on route ${routeId}`);
      return { success: true, reassigned: 0 };
    } catch (error) {
      logger.error('Error reassigning passengers:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SmartAllocationService;
