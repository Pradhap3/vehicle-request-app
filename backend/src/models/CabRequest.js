// src/models/CabRequest.js
// Supports multiple cab_requests schema variants across environments.
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bindFlexibleId = (request, paramName, id) => {
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
  if (UUID_REGEX.test(normalized)) {
    request.input(paramName, sql.UniqueIdentifier, normalized);
    return;
  }
  request.input(paramName, sql.NVarChar(255), normalized);
};

class CabRequest {
  static schemaCache = null;
  static recurringTypes = ['RECURRING', 'RECURRING_INBOUND', 'RECURRING_OUTBOUND'];

  static parseDateOrNull(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  static normalizeRecord(record) {
    if (!record) return record;

    const normalized = { ...record };

    if (normalized.boarding_area == null) {
      normalized.boarding_area = normalized.departure_location ?? normalized.pickup_location ?? null;
    }
    if (normalized.dropping_area == null) {
      normalized.dropping_area =
        normalized.destination_location ?? normalized.drop_location ?? normalized.dropoff_location ?? null;
    }
    if (normalized.pickup_location == null) {
      normalized.pickup_location = normalized.departure_location ?? normalized.boarding_area ?? null;
    }
    if (normalized.drop_location == null) {
      normalized.drop_location =
        normalized.destination_location ?? normalized.dropping_area ?? normalized.dropoff_location ?? null;
    }
    if (normalized.departure_location == null) {
      normalized.departure_location = normalized.pickup_location ?? normalized.boarding_area ?? null;
    }
    if (normalized.destination_location == null) {
      normalized.destination_location = normalized.drop_location ?? normalized.dropping_area ?? null;
    }
    if (normalized.requested_time == null) {
      normalized.requested_time = normalized.pickup_time ?? null;
    }
    if (normalized.pickup_time == null) {
      normalized.pickup_time = normalized.requested_time ?? null;
    }

    return normalized;
  }

  static async getCabRequestSchema() {
    if (this.schemaCache) {
      return this.schemaCache;
    }

    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        c.name AS column_name,
        CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
      FROM sys.columns c
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('cab_requests')
    `);

    const columns = new Set(result.recordset.map((row) => row.column_name.toLowerCase()));
    const hasColumn = (name) => columns.has(name);
    const pickColumn = (names) => names.find((name) => hasColumn(name)) || null;
    const idMeta = result.recordset.find((row) => row.column_name.toLowerCase() === 'id');

    this.schemaCache = {
      hasColumn,
      idIsIdentity: Boolean(idMeta && idMeta.is_identity === 1),
      pickupColumn: pickColumn(['departure_location', 'boarding_area', 'pickup_location']),
      dropColumn: pickColumn(['destination_location', 'dropping_area', 'drop_location', 'dropoff_location']),
      requestTimeColumn: pickColumn(['requested_time', 'pickup_time', 'created_at']),
      assignmentColumn: pickColumn(['assigned_cab_id', 'cab_id']),
      plannedAssignmentColumn: pickColumn(['assigned_at'])
    };

    return this.schemaCache;
  }

  static async findAll(filters = {}) {
    try {
      const pool = getPool();
      const request = pool.request();
      
      let whereConditions = ['1=1'];
      
      if (filters.status) {
        request.input('status', sql.NVarChar(50), filters.status);
        whereConditions.push('cr.status = @status');
      }
      if (filters.employee_id) {
        bindFlexibleId(request, 'employee_id', filters.employee_id);
        whereConditions.push('cr.employee_id = @employee_id');
      }
      if (filters.route_id) {
        bindFlexibleId(request, 'route_id', filters.route_id);
        whereConditions.push('cr.route_id = @route_id');
      }
      
      const result = await request.query(`
        SELECT cr.*, 
               e.name as employee_name, e.email as employee_email, e.phone as employee_phone, e.department,
               r.name as route_name, r.start_point, r.end_point
        FROM cab_requests cr
        LEFT JOIN users e ON cr.employee_id = e.id
        LEFT JOIN routes r ON cr.route_id = r.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY cr.created_at DESC
      `);
      
      return result.recordset.map((row) => this.normalizeRecord(row));
    } catch (error) {
      logger.error('Error fetching cab requests:', error);
      return [];
    }
  }

  static async findById(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'id', id);
      const result = await request
        .query(`
          SELECT cr.*, 
                 e.name as employee_name, e.email as employee_email, e.phone as employee_phone, e.department,
                 r.name as route_name, r.start_point, r.end_point
          FROM cab_requests cr
          LEFT JOIN users e ON cr.employee_id = e.id
          LEFT JOIN routes r ON cr.route_id = r.id
          WHERE cr.id = @id
        `);
      return this.normalizeRecord(result.recordset[0]);
    } catch (error) {
      logger.error('Error finding cab request by ID:', error);
      throw error;
    }
  }

  // CREATE - only uses columns that exist in actual DB
  static async create(requestData) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      const newId = uuidv4().toUpperCase();
      const request = pool.request();

      const insertColumns = [];
      const insertValues = [];

      if (schema.hasColumn('id') && !schema.idIsIdentity) {
        request.input('id', sql.NVarChar(255), newId);
        insertColumns.push('id');
        insertValues.push('@id');
      }

      if (schema.hasColumn('employee_id')) {
        bindFlexibleId(request, 'employee_id', requestData.employee_id);
        insertColumns.push('employee_id');
        insertValues.push('@employee_id');
      }

      if (schema.hasColumn('route_id')) {
        bindFlexibleId(request, 'route_id', requestData.route_id || null);
        insertColumns.push('route_id');
        insertValues.push('@route_id');
      }

      if (schema.pickupColumn) {
        const pickupValue =
          requestData.departure_location ||
          requestData.boarding_area ||
          requestData.pickup_location ||
          'Unknown';
        request.input(
          'pickup_value',
          sql.NVarChar(500),
          pickupValue
        );
        insertColumns.push(schema.pickupColumn);
        insertValues.push('@pickup_value');
      }

      if (schema.dropColumn) {
        const dropValue =
          requestData.destination_location ||
          requestData.dropping_area ||
          requestData.drop_location ||
          requestData.dropoff_location ||
          'Unknown';
        request.input(
          'drop_value',
          sql.NVarChar(500),
          dropValue
        );
        insertColumns.push(schema.dropColumn);
        insertValues.push('@drop_value');
      }

      if (schema.hasColumn('requested_time')) {
        const requestedTime =
          this.parseDateOrNull(requestData.requested_time) ||
          this.parseDateOrNull(requestData.pickup_time) ||
          new Date();
        request.input('requested_time', sql.DateTime, requestedTime);
        insertColumns.push('requested_time');
        insertValues.push('@requested_time');
      }

      if (schema.hasColumn('pickup_time')) {
        request.input(
          'pickup_time',
          sql.DateTime,
          this.parseDateOrNull(requestData.pickup_time) || this.parseDateOrNull(requestData.requested_time) || new Date()
        );
        insertColumns.push('pickup_time');
        insertValues.push('@pickup_time');
      }

      if (schema.hasColumn('travel_time')) {
        const travelTime =
          this.parseDateOrNull(requestData.travel_time) ||
          this.parseDateOrNull(requestData.requested_time) ||
          this.parseDateOrNull(requestData.pickup_time) ||
          new Date();
        request.input('travel_time', sql.DateTime, travelTime);
        insertColumns.push('travel_time');
        insertValues.push('@travel_time');
      }

      if (schema.plannedAssignmentColumn && requestData.assigned_at !== undefined) {
        request.input('assigned_at', sql.DateTime, this.parseDateOrNull(requestData.assigned_at));
        insertColumns.push(schema.plannedAssignmentColumn);
        insertValues.push('@assigned_at');
      }

      if (schema.hasColumn('status')) {
        request.input('status', sql.NVarChar(50), requestData.status || 'PENDING');
        insertColumns.push('status');
        insertValues.push('@status');
      }

      if (schema.hasColumn('priority') && requestData.priority !== undefined) {
        request.input('priority', sql.NVarChar(40), requestData.priority);
        insertColumns.push('priority');
        insertValues.push('@priority');
      }
      if (schema.hasColumn('request_type') && requestData.request_type !== undefined) {
        request.input('request_type', sql.NVarChar(40), requestData.request_type);
        insertColumns.push('request_type');
        insertValues.push('@request_type');
      }

      if (schema.hasColumn('number_of_people') && requestData.number_of_people !== undefined) {
        request.input('number_of_people', sql.Int, requestData.number_of_people);
        insertColumns.push('number_of_people');
        insertValues.push('@number_of_people');
      }

      if (schema.hasColumn('created_at')) {
        insertColumns.push('created_at');
        insertValues.push('GETDATE()');
      }

      const result = await request.query(`
          INSERT INTO cab_requests (${insertColumns.join(', ')})
          OUTPUT INSERTED.*
          VALUES (${insertValues.join(', ')})
        `);
      
      logger.info(`Cab request created: ${newId} for employee ${requestData.employee_id}`);
      return this.normalizeRecord(result.recordset[0]);
    } catch (error) {
      logger.error('Error creating cab request:', error);
      throw error;
    }
  }

  static async update(id, requestData) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      const request = pool.request();
      bindFlexibleId(request, 'id', id);
      
      const updates = [];
      
      if (schema.hasColumn('route_id') && requestData.route_id !== undefined) {
        bindFlexibleId(request, 'route_id', requestData.route_id);
        updates.push('route_id = @route_id');
      }
      if (schema.hasColumn('status') && requestData.status) {
        request.input('status', sql.NVarChar(50), requestData.status);
        updates.push('status = @status');
      }
      if (
        schema.pickupColumn &&
        (requestData.departure_location !== undefined ||
          requestData.boarding_area !== undefined ||
          requestData.pickup_location !== undefined)
      ) {
        request.input(
          'pickup_value',
          sql.NVarChar(500),
          requestData.departure_location ?? requestData.boarding_area ?? requestData.pickup_location ?? null
        );
        updates.push(`${schema.pickupColumn} = @pickup_value`);
      }
      if (
        schema.dropColumn &&
        (requestData.destination_location !== undefined ||
          requestData.dropping_area !== undefined ||
          requestData.drop_location !== undefined ||
          requestData.dropoff_location !== undefined)
      ) {
        request.input(
          'drop_value',
          sql.NVarChar(500),
          requestData.destination_location ??
            requestData.dropping_area ??
            requestData.drop_location ??
            requestData.dropoff_location ??
            null
        );
        updates.push(`${schema.dropColumn} = @drop_value`);
      }
      if (schema.hasColumn('requested_time') && requestData.requested_time !== undefined) {
        request.input('requested_time', sql.DateTime, this.parseDateOrNull(requestData.requested_time));
        updates.push('requested_time = @requested_time');
      }
      if (schema.hasColumn('travel_time') && requestData.travel_time !== undefined) {
        request.input('travel_time', sql.DateTime, this.parseDateOrNull(requestData.travel_time));
        updates.push('travel_time = @travel_time');
      }
      if (schema.hasColumn('priority') && requestData.priority !== undefined) {
        request.input('priority', sql.NVarChar(40), requestData.priority);
        updates.push('priority = @priority');
      }
      if (schema.hasColumn('request_type') && requestData.request_type !== undefined) {
        request.input('request_type', sql.NVarChar(40), requestData.request_type);
        updates.push('request_type = @request_type');
      }
      if (schema.assignmentColumn && (requestData.cab_id !== undefined || requestData.assigned_cab_id !== undefined)) {
        bindFlexibleId(request, 'assigned_cab_id', requestData.assigned_cab_id ?? requestData.cab_id ?? null);
        updates.push(`${schema.assignmentColumn} = @assigned_cab_id`);
      }
      if (schema.plannedAssignmentColumn && requestData.assigned_at !== undefined) {
        request.input('assigned_at', sql.DateTime, this.parseDateOrNull(requestData.assigned_at));
        updates.push(`${schema.plannedAssignmentColumn} = @assigned_at`);
      }
      if (schema.hasColumn('number_of_people') && requestData.number_of_people !== undefined) {
        request.input('number_of_people', sql.Int, requestData.number_of_people);
        updates.push('number_of_people = @number_of_people');
      }
      if (schema.hasColumn('updated_at')) {
        updates.push('updated_at = GETDATE()');
      }
      
      if (updates.length === 0) {
        return await this.findById(id);
      }
      
      const result = await request.query(`
        UPDATE cab_requests 
        SET ${updates.join(', ')}
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
      
      return this.normalizeRecord(result.recordset[0]);
    } catch (error) {
      logger.error('Error updating cab request:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('id', /^\d+$/.test(String(id)) ? sql.Int : sql.NVarChar(255), /^\d+$/.test(String(id)) ? parseInt(String(id), 10) : id)
        .query(`DELETE FROM cab_requests OUTPUT DELETED.id WHERE id = @id`);
      
      if (result.recordset.length === 0) {
        throw new Error('Request not found');
      }
      
      return { success: true, id };
    } catch (error) {
      logger.error('Error deleting cab request:', error);
      throw error;
    }
  }

  static async assignCab(requestId, cabId) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      const request = pool.request();
      bindFlexibleId(request, 'id', requestId);
      request.input('status', sql.NVarChar(50), 'APPROVED');
      if (schema.plannedAssignmentColumn) {
        request.input('assigned_at', sql.DateTime, new Date());
      }
      if (schema.assignmentColumn) {
        bindFlexibleId(request, 'cab_id', cabId);
      }
      const result = await request.query(`
          UPDATE cab_requests
          SET status = @status
              ${schema.plannedAssignmentColumn ? `, ${schema.plannedAssignmentColumn} = @assigned_at` : ''}
              ${schema.assignmentColumn ? `, ${schema.assignmentColumn} = @cab_id` : ''}
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      
      logger.info(`Request ${requestId} approved`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error assigning cab:', error);
      throw error;
    }
  }

  static async cancel(requestId, reason) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'id', requestId);
      const result = await request
        .query(`
          UPDATE cab_requests 
          SET status = 'CANCELLED'
          OUTPUT INSERTED.*
          WHERE id = @id AND status IN ('PENDING', 'APPROVED')
        `);
      
      if (result.recordset.length === 0) {
        throw new Error('Cannot cancel this request');
      }
      
      return result.recordset[0];
    } catch (error) {
      logger.error('Error cancelling request:', error);
      throw error;
    }
  }

  static async getTodayStats() {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
          FROM cab_requests
          WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)
        `);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error getting today stats:', error);
      return { total: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 };
    }
  }

  static async getPendingRequestsForRoute(routeId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('route_id', /^\d+$/.test(String(routeId)) ? sql.Int : sql.NVarChar(255), /^\d+$/.test(String(routeId)) ? parseInt(String(routeId), 10) : routeId)
        .query(`
          SELECT cr.*, e.name as employee_name, e.phone as employee_phone
          FROM cab_requests cr
          INNER JOIN users e ON cr.employee_id = e.id
          WHERE cr.route_id = @route_id 
            AND cr.status = 'PENDING'
          ORDER BY cr.created_at
        `);
      return result.recordset.map((row) => this.normalizeRecord(row));
    } catch (error) {
      logger.error('Error getting pending requests for route:', error);
      return [];
    }
  }

  static async getByEmployeeId(employeeId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('employee_id', /^\d+$/.test(String(employeeId)) ? sql.Int : sql.NVarChar(255), /^\d+$/.test(String(employeeId)) ? parseInt(String(employeeId), 10) : employeeId)
        .query(`
          SELECT cr.*, 
                 r.name as route_name, r.start_point, r.end_point
          FROM cab_requests cr
          LEFT JOIN routes r ON cr.route_id = r.id
          WHERE cr.employee_id = @employee_id
          ORDER BY cr.created_at DESC
        `);
      return result.recordset.map((row) => this.normalizeRecord(row));
    } catch (error) {
      logger.error('Error getting requests by employee:', error);
      return [];
    }
  }

  static async getAssignedRequestsForCab(cabId, date = null) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      if (!schema.assignmentColumn) return [];

      const request = pool.request();
      bindFlexibleId(request, 'cab_id', cabId);
      let dateFilter = '';
      const timeCol = schema.requestTimeColumn || 'created_at';
      if (date) {
        request.input('trip_date', sql.Date, date);
        dateFilter = `AND CAST(cr.${timeCol} AS DATE) = @trip_date`;
      }

      const result = await request.query(`
        SELECT
          cr.*,
          e.name as employee_name,
          e.phone as employee_phone,
          ep.stop_sequence AS profile_stop_sequence
        FROM cab_requests cr
        LEFT JOIN users e ON cr.employee_id = e.id
        LEFT JOIN employee_transport_profiles ep
          ON ep.employee_id = cr.employee_id
         AND ep.is_active = 1
        WHERE cr.${schema.assignmentColumn} = @cab_id
          AND cr.status IN ('APPROVED', 'ASSIGNED', 'IN_PROGRESS')
          ${dateFilter}
        ORDER BY
          CASE
            WHEN ep.stop_sequence IS NULL THEN 1
            WHEN LOWER(COALESCE(cr.request_type, '')) = 'recurring_outbound' THEN -ep.stop_sequence
            ELSE ep.stop_sequence
          END ASC,
          cr.${timeCol} ASC
      `);

      return result.recordset.map((row) => this.normalizeRecord(row));
    } catch (error) {
      logger.error('Error getting assigned requests for cab:', error);
      return [];
    }
  }

  static async getUpcomingRoutesForAutoAssign(windowMinutes = 30) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      const timeCol = schema.requestTimeColumn || 'created_at';
      const result = await pool.request()
        .input('window_minutes', sql.Int, windowMinutes)
        .query(`
          SELECT DISTINCT route_id
          FROM cab_requests
          WHERE route_id IS NOT NULL
            AND status = 'PENDING'
            AND ${timeCol} IS NOT NULL
            AND ${timeCol} >= GETDATE()
            AND ${timeCol} <= DATEADD(MINUTE, @window_minutes, GETDATE())
        `);
      return result.recordset.map((row) => row.route_id);
    } catch (error) {
      logger.error('Error fetching upcoming routes for auto-assignment:', error);
      return [];
    }
  }

  static async cancelUpcomingForNoShow(employeeId, sourceRequestId, daysAhead = 1) {
    try {
      const pool = getPool();
      const schema = await this.getCabRequestSchema();
      const timeCol = schema.requestTimeColumn || 'created_at';
      const request = pool.request();

      bindFlexibleId(request, 'employee_id', employeeId);
      bindFlexibleId(request, 'source_id', sourceRequestId);
      request.input('days_ahead', sql.Int, daysAhead);

      const result = await request.query(`
        UPDATE cab_requests
        SET status = 'CANCELLED'
            ${schema.hasColumn('updated_at') ? ', updated_at = GETDATE()' : ''}
        OUTPUT INSERTED.id
        WHERE employee_id = @employee_id
          AND id <> @source_id
          AND status IN ('PENDING', 'APPROVED')
          AND ${timeCol} IS NOT NULL
          AND ${timeCol} >= GETDATE()
          AND ${timeCol} < DATEADD(DAY, @days_ahead + 1, CAST(GETDATE() AS DATE))
      `);

      return result.recordset.map((row) => row.id);
    } catch (error) {
      logger.error('Error cancelling upcoming requests after no-show:', error);
      return [];
    }
  }

  static async hasActiveTripsForCab(cabId) {
    try {
      const schema = await this.getCabRequestSchema();
      if (!schema.assignmentColumn) return false;

      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'cab_id', cabId);
      const result = await request.query(`
        SELECT COUNT(*) AS active_count
        FROM cab_requests
        WHERE ${schema.assignmentColumn} = @cab_id
          AND status IN ('APPROVED', 'ASSIGNED', 'IN_PROGRESS')
      `);
      return (result.recordset[0]?.active_count || 0) > 0;
    } catch (error) {
      logger.error('Error checking active trips for cab:', error);
      return false;
    }
  }

  static async findConflictingRequest(employeeId, requestedTime, excludeRequestId = null, windowMinutes = 180) {
    try {
      const parsed = this.parseDateOrNull(requestedTime);
      if (!parsed) return null;

      const schema = await this.getCabRequestSchema();
      const timeCol = schema.requestTimeColumn || 'created_at';
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'employee_id', employeeId);
      request.input('requested_time', sql.DateTime, parsed);
      request.input('window_minutes', sql.Int, windowMinutes);

      let excludeClause = '';
      if (excludeRequestId !== null && excludeRequestId !== undefined) {
        bindFlexibleId(request, 'exclude_id', excludeRequestId);
        excludeClause = 'AND id <> @exclude_id';
      }

      const result = await request.query(`
        SELECT TOP 1 *
        FROM cab_requests
        WHERE employee_id = @employee_id
          ${excludeClause}
          AND status IN ('PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS')
          AND ${timeCol} IS NOT NULL
          AND ABS(DATEDIFF(MINUTE, ${timeCol}, @requested_time)) < @window_minutes
        ORDER BY ABS(DATEDIFF(MINUTE, ${timeCol}, @requested_time))
      `);

      return result.recordset[0] || null;
    } catch (error) {
      logger.error('Error checking conflicting request:', error);
      return null;
    }
  }

  static async findActiveTripForEmployeeOnDate(employeeId, targetDate, requestTypes = null) {
    try {
      const schema = await this.getCabRequestSchema();
      const timeCol = schema.requestTimeColumn || 'created_at';
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'employee_id', employeeId);
      request.input('target_date', sql.Date, targetDate);
      let requestTypeClause = '';

      if (schema.hasColumn('request_type')) {
        const types = Array.isArray(requestTypes) && requestTypes.length > 0 ? requestTypes : null;
        if (types) {
          const placeholders = types.map((_, index) => `@request_type_${index}`);
          types.forEach((type, index) => {
            request.input(`request_type_${index}`, sql.NVarChar(40), type);
          });
          requestTypeClause = `AND request_type IN (${placeholders.join(', ')})`;
        }
      }

      const result = await request.query(`
        SELECT *
        FROM cab_requests
        WHERE employee_id = @employee_id
          ${requestTypeClause}
          AND status IN ('PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED')
          AND ${timeCol} IS NOT NULL
          AND CAST(${timeCol} AS DATE) = @target_date
        ORDER BY created_at DESC
      `);

      return result.recordset[0] || null;
    } catch (error) {
      logger.error('Error finding active trip for employee/date:', error);
      return null;
    }
  }

  static async findRecurringTripsForEmployeeOnDate(employeeId, targetDate, requestTypes = null) {
    try {
      const schema = await this.getCabRequestSchema();
      const timeCol = schema.requestTimeColumn || 'created_at';
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'employee_id', employeeId);
      request.input('target_date', sql.Date, targetDate);

      let requestTypeClause = '';
      if (schema.hasColumn('request_type')) {
        const types = Array.isArray(requestTypes) && requestTypes.length > 0
          ? requestTypes
          : this.recurringTypes;
        const placeholders = types.map((_, index) => `@request_type_${index}`);
        types.forEach((type, index) => {
          request.input(`request_type_${index}`, sql.NVarChar(40), type);
        });
        requestTypeClause = `AND request_type IN (${placeholders.join(', ')})`;
      }

      const result = await request.query(`
        SELECT *
        FROM cab_requests
        WHERE employee_id = @employee_id
          ${requestTypeClause}
          AND status IN ('PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED')
          AND ${timeCol} IS NOT NULL
          AND CAST(${timeCol} AS DATE) = @target_date
        ORDER BY created_at DESC
      `);

      return result.recordset || [];
    } catch (error) {
      logger.error('Error finding recurring trips for employee/date:', error);
      return [];
    }
  }
}

module.exports = CabRequest;
