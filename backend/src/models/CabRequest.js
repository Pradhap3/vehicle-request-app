// src/models/CabRequest.js
// Supports multiple cab_requests schema variants across environments.
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class CabRequest {
  static schemaCache = null;

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
      dropColumn: pickColumn(['destination_location', 'dropping_area', 'drop_location', 'dropoff_location'])
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
        request.input('employee_id', sql.NVarChar(255), filters.employee_id);
        whereConditions.push('cr.employee_id = @employee_id');
      }
      if (filters.route_id) {
        request.input('route_id', sql.NVarChar(255), filters.route_id);
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
      const result = await pool.request()
        .input('id', sql.NVarChar(255), id)
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
        request.input('employee_id', sql.NVarChar(255), requestData.employee_id);
        insertColumns.push('employee_id');
        insertValues.push('@employee_id');
      }

      if (schema.hasColumn('route_id')) {
        request.input('route_id', sql.NVarChar(255), requestData.route_id || null);
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
      const request = pool.request().input('id', sql.NVarChar(255), id);
      
      const updates = [];
      
      if (schema.hasColumn('route_id') && requestData.route_id !== undefined) {
        request.input('route_id', sql.NVarChar(255), requestData.route_id);
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
        .input('id', sql.NVarChar(255), id)
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
      const result = await pool.request()
        .input('id', sql.NVarChar(255), requestId)
        .input('status', sql.NVarChar(50), 'APPROVED')
        .query(`
          UPDATE cab_requests 
          SET status = @status
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
      const result = await pool.request()
        .input('id', sql.NVarChar(255), requestId)
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
        .input('route_id', sql.NVarChar(255), routeId)
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
        .input('employee_id', sql.NVarChar(255), employeeId)
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
}

module.exports = CabRequest;
