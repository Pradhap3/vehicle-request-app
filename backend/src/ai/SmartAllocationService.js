// src/ai/SmartAllocationService.js
// Simplified to work with actual database schema
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const RouteOptimizationService = require('../services/RouteOptimizationService');

class SmartAllocationService {
  static schemaCache = null;
  static driverRoutesAvailable = null;
  static recurringRequestTypes = ['RECURRING', 'RECURRING_INBOUND', 'RECURRING_OUTBOUND'];

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
      requestTypeColumn: pick(['request_type']),
      plannedAssignmentColumn: pick(['assigned_at'])
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

  static buildRecurringTypeClause(columnName) {
    const values = this.recurringRequestTypes.map((type) => `'${type}'`).join(', ');
    return `${columnName} IN (${values})`;
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
      const assignmentWindowColumn = schema.plannedAssignmentColumn || schema.requestTimeColumn || 'created_at';
      const requestsResult = await requestsReq.query(`
          SELECT
            cr.*,
            e.name as employee_name,
            ep.pickup_latitude,
            ep.pickup_longitude,
            ep.drop_latitude,
            ep.drop_longitude,
            ep.stop_sequence,
            ep.stop_name,
            selected_stop.latitude AS stop_latitude,
            selected_stop.longitude AS stop_longitude
          FROM cab_requests cr
          INNER JOIN users e ON cr.employee_id = e.id
          LEFT JOIN employee_transport_profiles ep
            ON ep.employee_id = cr.employee_id
           AND ep.is_active = 1
          OUTER APPLY (
            SELECT TOP 1 rs.latitude, rs.longitude
            FROM route_stops rs
            WHERE rs.route_id = cr.route_id
              AND rs.is_active = 1
              AND (
                (ep.stop_sequence IS NOT NULL AND rs.stop_sequence = ep.stop_sequence)
                OR (ep.stop_name IS NOT NULL AND LOWER(LTRIM(RTRIM(rs.stop_name))) = LOWER(LTRIM(RTRIM(ep.stop_name))))
              )
            ORDER BY CASE WHEN ep.stop_sequence IS NOT NULL AND rs.stop_sequence = ep.stop_sequence THEN 0 ELSE 1 END, rs.stop_sequence
          ) selected_stop
          WHERE cr.route_id = @route_id AND cr.status = 'PENDING'
            ${schema.requestTypeColumn ? `AND ${this.buildRecurringTypeClause(`cr.${schema.requestTypeColumn}`)}` : ''}
            ${
              options.onlyUpcomingWithinMinutes
                ? `AND ${assignmentWindowColumn} IS NOT NULL
                   AND ${assignmentWindowColumn} <= DATEADD(MINUTE, @window_minutes, GETDATE())`
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
      
      const optimizedAssignments = RouteOptimizationService.planAssignments(
        pendingRequests,
        availableCabs,
        { baseTime: new Date() }
      );
      const allocations = [];

      for (const assignment of optimizedAssignments) {
        for (const request of assignment.cluster.requests) {
          const approveReq = pool.request();
          this.bindFlexibleId(approveReq, 'id', request.id);
          if (schema.assignmentColumn) {
            this.bindFlexibleId(approveReq, 'cab_id', assignment.cab.id);
          }
          if (schema.plannedAssignmentColumn) {
            approveReq.input('assigned_at', sql.DateTime, new Date());
          }

          await approveReq.query(`
            UPDATE cab_requests
            SET status = 'APPROVED'
                ${schema.assignmentColumn ? `, ${schema.assignmentColumn} = @cab_id` : ''}
                ${schema.plannedAssignmentColumn ? `, ${schema.plannedAssignmentColumn} = @assigned_at` : ''}
            WHERE id = @id
          `);

          allocations.push({
            requestId: request.id,
            employeeName: request.employee_name,
            cabNumber: assignment.cab.cab_number,
            cabId: assignment.cab.id,
            plannedSequence: assignment.cluster.requests.findIndex((row) => row.id === request.id) + 1,
            clusterSize: assignment.cluster.passengerCount,
            routeDistanceKm: Number(assignment.cluster.routeMetrics.distanceKm.toFixed(2)),
            routeDurationMinutes: assignment.cluster.routeMetrics.durationMinutes,
            utilizationPct: assignment.utilizationPct
          });
        }
      }
      
      logger.info(`Auto-allocated ${allocations.length} requests for route ${routeId}`);
      
      return {
        success: true,
        message: `Allocated ${allocations.length} requests to ${optimizedAssignments.length} cab(s)`,
        allocations,
        routePlans: optimizedAssignments.map((assignment) => ({
          cabId: assignment.cab.id,
          cabNumber: assignment.cab.cab_number,
          driverId: assignment.cab.driver_id,
          passengerCount: assignment.cluster.passengerCount,
          utilizationPct: assignment.utilizationPct,
          remainingSeats: assignment.remainingSeats,
          stopPlan: assignment.cluster.routeMetrics.stopPlan,
          routeDistanceKm: assignment.cluster.routeMetrics.distanceKm,
          routeDurationMinutes: assignment.cluster.routeMetrics.durationMinutes
        }))
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
      
      const hour = new Date().getHours();
      const baseDistance = Number(route.distance_km || 0);
      const estimatedTime = Number(route.estimated_time_minutes || 30);
      const rushFactor = (hour >= 6 && hour < 10) || (hour >= 16 && hour < 21) ? 1.28 : hour >= 10 && hour < 16 ? 1.12 : 1.0;
      const routeComplexity = baseDistance > 25 ? 1.12 : baseDistance > 12 ? 1.06 : 1.0;
      const adjustedTime = Math.max(estimatedTime, Math.round(estimatedTime * rushFactor * routeComplexity));
      const delayMinutes = Math.max(0, adjustedTime - estimatedTime);
      const trafficCondition = delayMinutes >= 20 ? 'heavy' : delayMinutes >= 8 ? 'moderate' : 'clear';
      
      return {
        routeId,
        routeName: route.name,
        startPoint: route.start_point,
        endPoint: route.end_point,
        estimatedTime,
        trafficCondition,
        delayMinutes,
        adjustedTime,
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
          ${schema.requestTypeColumn ? `AND ${this.buildRecurringTypeClause(schema.requestTypeColumn)}` : ''}
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

      const optimizedAssignments = RouteOptimizationService.planAssignments(waiting, cabState);
      const reassigned = [];

      for (const assignment of optimizedAssignments) {
        for (const req of assignment.cluster.requests) {
          const updateReq = pool.request();
          this.bindFlexibleId(updateReq, 'id', req.id);
          this.bindFlexibleId(updateReq, 'cab_id', assignment.cab.id);
          await updateReq.query(`
            UPDATE cab_requests
            SET ${schema.assignmentColumn} = @cab_id,
                status = 'APPROVED'
            WHERE id = @id
          `);

          reassigned.push({
            requestId: req.id,
            cabId: assignment.cab.id,
            cabNumber: assignment.cab.cab_number,
            plannedSequence: assignment.cluster.requests.findIndex((row) => row.id === req.id) + 1
          });
        }
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
      const timeCol = schema.plannedAssignmentColumn || schema.requestTimeColumn || 'created_at';
      const routesResult = await pool.request()
        .input('window_minutes', sql.Int, windowMinutes)
        .query(`
          SELECT DISTINCT route_id
          FROM cab_requests
          WHERE route_id IS NOT NULL
            AND status = 'PENDING'
            ${schema.requestTypeColumn ? `AND ${this.buildRecurringTypeClause(schema.requestTypeColumn)}` : ''}
            AND ${timeCol} IS NOT NULL
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
