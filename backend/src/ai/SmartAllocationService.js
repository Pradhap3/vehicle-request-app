// src/ai/SmartAllocationService.js
// Simplified to work with actual database schema
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class SmartAllocationService {
  static schemaCache = null;
  static driverRoutesAvailable = null;

  static async hasDriverRoutesTable() {
    if (this.driverRoutesAvailable !== null) return this.driverRoutesAvailable;
    try {
      const pool = getPool();
      const result = await pool.request().query(`SELECT OBJECT_ID('driver_routes') AS table_id`);
      this.driverRoutesAvailable = !!result.recordset[0]?.table_id;
      return this.driverRoutesAvailable;
    } catch (error) {
      this.driverRoutesAvailable = false;
      return false;
    }
  }

  static async getCabRequestSchema() {
    if (this.schemaCache) return this.schemaCache;

    const pool = getPool();
    const result = await pool.request().query(`
      SELECT c.name AS column_name
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('cab_requests')
    `);

    const columns = new Set(result.recordset.map((r) => String(r.column_name).toLowerCase()));
    const pick = (names) => names.find((n) => columns.has(n)) || null;

    this.schemaCache = {
      columns,
      assignmentColumn: pick(['assigned_cab_id', 'cab_id']),
      requestTimeColumn: pick(['requested_time', 'pickup_time', 'created_at']),
      requestTypeColumn: pick(['request_type'])
    };

    return this.schemaCache;
  }

  static bindFlexibleId(request, paramName, id) {
    if (id === null || id === undefined) {
      request.input(paramName, sql.NVarChar(255), null);
      return;
    }
    if (typeof id === 'number' && Number.isInteger(id)) {
      request.input(paramName, sql.Int, id);
      return;
    }
    const normalized = String(id).trim();
    if (/^\d+$/.test(normalized)) {
      request.input(paramName, sql.Int, parseInt(normalized, 10));
      return;
    }
    request.input(paramName, sql.NVarChar(255), normalized);
  }
  
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
  static async allocateCabsForRoute(routeId, date, options = {}) {
    try {
      const pool = getPool();
      
      // Get pending requests for this route
      const schema = await this.getCabRequestSchema();
      const requestsReq = pool.request();
      this.bindFlexibleId(requestsReq, 'route_id', routeId);
      if (options.onlyUpcomingWithinMinutes) {
        requestsReq.input('window_minutes', sql.Int, options.onlyUpcomingWithinMinutes);
      }
      const requestsResult = await requestsReq.query(`
          SELECT cr.*, e.name as employee_name
          FROM cab_requests cr
          INNER JOIN users e ON cr.employee_id = e.id
          WHERE cr.route_id = @route_id AND cr.status = 'PENDING'
            ${schema.requestTypeColumn ? `AND cr.${schema.requestTypeColumn} = 'RECURRING'` : ''}
            ${
              options.onlyUpcomingWithinMinutes
                ? `AND ${schema.requestTimeColumn || 'created_at'} >= GETDATE()
                   AND ${schema.requestTimeColumn || 'created_at'} <= DATEADD(MINUTE, @window_minutes, GETDATE())`
                : ''
            }
          ORDER BY cr.created_at
        `);
      
      const pendingRequests = requestsResult.recordset;
      
      if (pendingRequests.length === 0) {
        return { success: true, message: 'No pending requests', allocations: [] };
      }
      
      // Get available cabs (route-aware priority: same-route history, then capacity)
      const cabsReq = pool.request();
      this.bindFlexibleId(cabsReq, 'route_id', routeId);
      const hasDriverRoutes = await this.hasDriverRoutesTable();
      const routeStatsJoin = schema.assignmentColumn
        ? `
        LEFT JOIN (
          SELECT
            cr.${schema.assignmentColumn} AS cab_id,
            COUNT(*) AS route_trip_count
          FROM cab_requests cr
          WHERE cr.route_id = @route_id
            AND cr.${schema.assignmentColumn} IS NOT NULL
          GROUP BY cr.${schema.assignmentColumn}
        ) route_stats ON route_stats.cab_id = c.id
        `
        : `LEFT JOIN (SELECT NULL AS cab_id, 0 AS route_trip_count) route_stats ON 1 = 0`;
      const driverRouteJoin = hasDriverRoutes
        ? `
        LEFT JOIN driver_routes dr
          ON dr.driver_id = c.driver_id
         AND dr.route_id = @route_id
         AND dr.is_active = 1
        `
        : `LEFT JOIN (SELECT NULL AS driver_id, NULL AS route_id, 0 AS is_active) dr ON 1 = 0`;

      const cabsResult = await cabsReq.query(`
        SELECT
          c.*,
          COALESCE(route_stats.route_trip_count, 0) AS route_trip_count,
          CASE WHEN dr.route_id IS NULL THEN 0 ELSE 1 END AS driver_route_match
        FROM cabs c
        ${routeStatsJoin}
        ${driverRouteJoin}
        WHERE c.status = 'AVAILABLE' AND c.is_active = 1
        ORDER BY
          CASE WHEN dr.route_id IS NULL THEN 1 ELSE 0 END ASC,
          CASE WHEN c.driver_id IS NULL THEN 1 ELSE 0 END ASC,
          COALESCE(route_stats.route_trip_count, 0) DESC,
          c.capacity DESC
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
        const approveReq = pool.request();
        this.bindFlexibleId(approveReq, 'id', request.id);
        if (schema.assignmentColumn) {
          this.bindFlexibleId(approveReq, 'cab_id', availableCabs[cabIndex].id);
        }
        await approveReq
          .query(`
            UPDATE cab_requests
            SET status = 'APPROVED'
                ${schema.assignmentColumn ? `, ${schema.assignmentColumn} = @cab_id` : ''}
            WHERE id = @id
          `);
        
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
      const request = pool.request();
      this.bindFlexibleId(request, 'route_id', routeId);
      const result = await request
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

  // Backward-compatible method used by routesController + cron
  static async checkTrafficAndNotify(routeId) {
    const traffic = await this.checkTrafficConditions(routeId);
    return {
      success: !traffic.error,
      ...traffic
    };
  }

  // Backward-compatible alias used by routesController
  static async predictOptimalDepartureTime(routeId, arrivalTime) {
    return this.getOptimalDepartureTime(routeId, arrivalTime);
  }

  // Reassign waiting passengers (no-shows)
  static async reassignWaitingPassengers(routeId, date) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();

      if (!schema.assignmentColumn) {
        return { success: true, reassigned: [], message: 'No assignment column in cab_requests' };
      }

      const targetDate = date || new Date().toISOString().slice(0, 10);

      const waitingReq = pool.request();
      this.bindFlexibleId(waitingReq, 'route_id', routeId);
      waitingReq.input('target_date', sql.Date, targetDate);
      const waitingResult = await waitingReq.query(`
        SELECT *
        FROM cab_requests
        WHERE route_id = @route_id
          AND status = 'PENDING'
          ${schema.requestTypeColumn ? `AND ${schema.requestTypeColumn} = 'RECURRING'` : ''}
          AND CAST(${schema.requestTimeColumn || 'created_at'} AS DATE) = @target_date
        ORDER BY created_at ASC
      `);
      const waiting = waitingResult.recordset;

      if (waiting.length === 0) {
        return { success: true, reassigned: [], message: 'No waiting passengers' };
      }

      const assignedReq = pool.request();
      this.bindFlexibleId(assignedReq, 'route_id', routeId);
      assignedReq.input('target_date', sql.Date, targetDate);
      const assignedResult = await assignedReq.query(`
        SELECT
          cr.${schema.assignmentColumn} AS cab_id,
          COUNT(*) AS used_seats
        FROM cab_requests cr
        WHERE cr.route_id = @route_id
          AND cr.${schema.assignmentColumn} IS NOT NULL
          AND cr.status IN ('APPROVED', 'ASSIGNED', 'IN_PROGRESS')
          AND CAST(cr.${schema.requestTimeColumn || 'created_at'} AS DATE) = @target_date
        GROUP BY cr.${schema.assignmentColumn}
      `);

      const cabsResult = await pool.request().query(`
        SELECT id, cab_number, capacity
        FROM cabs
        WHERE is_active = 1
      `);

      const usedByCab = new Map();
      for (const row of assignedResult.recordset) {
        usedByCab.set(String(row.cab_id), Number(row.used_seats) || 0);
      }

      const cabState = cabsResult.recordset
        .map((cab) => ({
          ...cab,
          used: usedByCab.get(String(cab.id)) || 0,
          free: Math.max(0, (Number(cab.capacity) || 0) - (usedByCab.get(String(cab.id)) || 0))
        }))
        .filter((c) => c.free > 0)
        .sort((a, b) => b.free - a.free);

      const reassigned = [];
      let cabIndex = 0;

      for (const req of waiting) {
        while (cabIndex < cabState.length && cabState[cabIndex].free <= 0) cabIndex++;
        if (cabIndex >= cabState.length) break;

        const cab = cabState[cabIndex];
        const updateReq = pool.request();
        this.bindFlexibleId(updateReq, 'id', req.id);
        this.bindFlexibleId(updateReq, 'cab_id', cab.id);
        await updateReq.query(`
          UPDATE cab_requests
          SET ${schema.assignmentColumn} = @cab_id,
              status = 'APPROVED'
          WHERE id = @id
        `);

        cab.free -= 1;
        reassigned.push({
          requestId: req.id,
          cabId: cab.id,
          cabNumber: cab.cab_number
        });
      }

      logger.info(`Reassigned ${reassigned.length} waiting passengers on route ${routeId}`);
      return { success: true, reassigned };
    } catch (error) {
      logger.error('Error reassigning passengers:', error);
      return { success: false, error: error.message };
    }
  }

  static async autoAllocateUpcomingRequests(windowMinutes = 30) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      const timeCol = schema.requestTimeColumn || 'created_at';
      const routesResult = await pool.request()
        .input('window_minutes', sql.Int, windowMinutes)
        .query(`
          SELECT DISTINCT route_id
          FROM cab_requests
          WHERE route_id IS NOT NULL
            AND status = 'PENDING'
            ${schema.requestTypeColumn ? `AND ${schema.requestTypeColumn} = 'RECURRING'` : ''}
            AND ${timeCol} IS NOT NULL
            AND ${timeCol} >= GETDATE()
            AND ${timeCol} <= DATEADD(MINUTE, @window_minutes, GETDATE())
        `);

      let totalAllocations = 0;
      const routeResults = [];

      for (const row of routesResult.recordset) {
        const allocation = await this.allocateCabsForRoute(
          row.route_id,
          new Date().toISOString().slice(0, 10),
          { onlyUpcomingWithinMinutes: windowMinutes }
        );
        totalAllocations += allocation.allocations?.length || 0;
        routeResults.push({ route_id: row.route_id, ...allocation });
      }

      return {
        success: true,
        processedRoutes: routeResults.length,
        totalAllocations,
        routeResults
      };
    } catch (error) {
      logger.error('Error in autoAllocateUpcomingRequests:', error);
      return { success: false, error: error.message, processedRoutes: 0, totalAllocations: 0, routeResults: [] };
    }
  }
}

module.exports = SmartAllocationService;
