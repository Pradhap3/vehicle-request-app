// src/models/BoardingStatus.js
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

class BoardingStatus {
  static schemaCache = null;

  static async getSchema() {
    if (this.schemaCache) return this.schemaCache;

    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        c.name AS column_name,
        CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
      FROM sys.columns c
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('boarding_status')
    `);

    const columns = new Set(result.recordset.map((row) => String(row.column_name).toLowerCase()));
    const hasColumn = (name) => columns.has(name);
    const idMeta = result.recordset.find((row) => String(row.column_name).toLowerCase() === 'id');

    this.schemaCache = {
      hasColumn,
      idIsIdentity: Boolean(idMeta && idMeta.is_identity === 1)
    };

    return this.schemaCache;
  }

  static async findByRequestId(requestId) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'request_id', requestId);
      const result = await request
        .query(`
          SELECT bs.*, e.name as employee_name, e.phone as employee_phone
          FROM boarding_status bs
          LEFT JOIN users e ON bs.employee_id = e.id
          WHERE bs.request_id = @request_id
          ORDER BY bs.created_at
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching boarding status:', error);
      return [];
    }
  }

  static async createOrUpdate(data) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      
      // Check if record exists
      const existingRequest = pool.request();
      bindFlexibleId(existingRequest, 'request_id', data.request_id);
      bindFlexibleId(existingRequest, 'employee_id', data.employee_id);
      const existing = await existingRequest
        .query(`
          SELECT id FROM boarding_status 
          WHERE request_id = @request_id AND employee_id = @employee_id
        `);
      
      if (existing.recordset.length > 0) {
        // Update existing record
        const updateRequest = pool.request()
          .input('boarding_area', sql.NVarChar(500), data.boarding_area || null)
          .input('dropping_area', sql.NVarChar(500), data.dropping_area || null)
          .input('is_boarded', sql.Bit, Boolean(data.is_boarded))
          .input('is_dropped', sql.Bit, Boolean(data.is_dropped));
        bindFlexibleId(updateRequest, 'id', existing.recordset[0].id);

        const result = await updateRequest
          .query(`
            UPDATE boarding_status 
            SET boarding_area = @boarding_area,
                dropping_area = @dropping_area,
                is_boarded = @is_boarded,
                is_dropped = @is_dropped,
                updated_at = GETDATE()
            OUTPUT INSERTED.*
            WHERE id = @id
          `);
        return result.recordset[0];
      } else {
        // Create new record
        const newId = uuidv4().toUpperCase();
        const createRequest = pool.request()
          .input('boarding_area', sql.NVarChar(500), data.boarding_area || null)
          .input('dropping_area', sql.NVarChar(500), data.dropping_area || null)
          .input('is_boarded', sql.Bit, Boolean(data.is_boarded))
          .input('is_dropped', sql.Bit, Boolean(data.is_dropped));
        bindFlexibleId(createRequest, 'request_id', data.request_id);
        bindFlexibleId(createRequest, 'employee_id', data.employee_id);

        const insertColumns = ['request_id', 'employee_id', 'boarding_area', 'dropping_area', 'is_boarded', 'is_dropped', 'created_at'];
        const insertValues = ['@request_id', '@employee_id', '@boarding_area', '@dropping_area', '@is_boarded', '@is_dropped', 'GETDATE()'];

        if (schema.hasColumn('id') && !schema.idIsIdentity) {
          createRequest.input('id', sql.NVarChar(255), newId);
          insertColumns.unshift('id');
          insertValues.unshift('@id');
        }

        const result = await createRequest
          .query(`
            INSERT INTO boarding_status (${insertColumns.join(', ')})
            OUTPUT INSERTED.*
            VALUES (${insertValues.join(', ')})
          `);
        return result.recordset[0];
      }
    } catch (error) {
      logger.error('Error creating/updating boarding status:', error);
      throw error;
    }
  }

  static async markBoarded(requestId, employeeId, boardingArea) {
    try {
      const pool = getPool();
      const request = pool.request()
        .input('boarding_area', sql.NVarChar(500), boardingArea);
      bindFlexibleId(request, 'request_id', requestId);
      bindFlexibleId(request, 'employee_id', employeeId);

      const result = await request
        .query(`
          UPDATE boarding_status 
          SET is_boarded = 1, 
              boarded_at = GETDATE(),
              boarding_area = @boarding_area,
              updated_at = GETDATE()
          OUTPUT INSERTED.*
          WHERE request_id = @request_id AND employee_id = @employee_id
        `);
      
      if (result.recordset.length === 0) {
        return this.createOrUpdate({
          request_id: requestId,
          employee_id: employeeId,
          boarding_area: boardingArea,
          is_boarded: true
        });
      }
      
      logger.info(`Employee ${employeeId} marked as boarded for request ${requestId}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error marking employee as boarded:', error);
      throw error;
    }
  }

  static async markDropped(requestId, employeeId, droppingArea) {
    try {
      const pool = getPool();
      const request = pool.request()
        .input('dropping_area', sql.NVarChar(500), droppingArea);
      bindFlexibleId(request, 'request_id', requestId);
      bindFlexibleId(request, 'employee_id', employeeId);

      const result = await request
        .query(`
          UPDATE boarding_status 
          SET is_dropped = 1, 
              dropped_at = GETDATE(),
              dropping_area = @dropping_area,
              updated_at = GETDATE()
          OUTPUT INSERTED.*
          WHERE request_id = @request_id AND employee_id = @employee_id
        `);

      if (result.recordset.length === 0) {
        return this.createOrUpdate({
          request_id: requestId,
          employee_id: employeeId,
          dropping_area: droppingArea,
          is_dropped: true
        });
      }
      
      logger.info(`Employee ${employeeId} marked as dropped for request ${requestId}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error marking employee as dropped:', error);
      throw error;
    }
  }

  static async markNoShow(requestId, employeeId, reason) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'request_id', requestId);
      bindFlexibleId(request, 'employee_id', employeeId);
      request.input('reason', sql.NVarChar(500), reason || null);

      await request
        .query(`
          UPDATE boarding_status 
          SET is_boarded = 0,
              is_dropped = 0,
              no_show = 1,
              no_show_reason = COALESCE(@reason, no_show_reason),
              updated_at = GETDATE()
          WHERE request_id = @request_id AND employee_id = @employee_id
        `);
      
      logger.info(`Employee ${employeeId} marked as no-show for request ${requestId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error marking employee as no-show:', error);
      throw error;
    }
  }

  static async getNoShowsForRoute(routeId, date) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'route_id', routeId);
      request.input('date', sql.Date, String(date).slice(0, 10));
      const result = await request.query(`
        SELECT
          bs.*,
          u.name AS employee_name,
          u.phone AS employee_phone,
          cr.pickup_time,
          cr.pickup_location,
          cr.drop_location
        FROM boarding_status bs
        INNER JOIN cab_requests cr ON cr.id = bs.request_id
        LEFT JOIN users u ON u.id = bs.employee_id
        WHERE cr.route_id = @route_id
          AND CAST(cr.pickup_time AS DATE) = @date
          AND bs.no_show = 1
        ORDER BY cr.pickup_time ASC, bs.updated_at DESC
      `);
      return result.recordset || [];
    } catch (error) {
      logger.error('Error fetching no-shows for route:', error);
      return [];
    }
  }

  static async getWaitingPassengers(routeId, date) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'route_id', routeId);
      request.input('date', sql.Date, String(date).slice(0, 10));
      const result = await request.query(`
        SELECT
          cr.id AS request_id,
          cr.employee_id,
          cr.pickup_location,
          cr.drop_location,
          cr.pickup_time,
          cr.status,
          u.name AS employee_name,
          u.phone AS employee_phone,
          bs.is_boarded,
          bs.is_dropped,
          bs.no_show
        FROM cab_requests cr
        LEFT JOIN users u ON u.id = cr.employee_id
        LEFT JOIN boarding_status bs
          ON bs.request_id = cr.id
         AND bs.employee_id = cr.employee_id
        WHERE cr.route_id = @route_id
          AND CAST(cr.pickup_time AS DATE) = @date
          AND cr.status IN ('APPROVED', 'ASSIGNED', 'IN_PROGRESS')
          AND ISNULL(bs.is_boarded, 0) = 0
          AND ISNULL(bs.no_show, 0) = 0
        ORDER BY cr.pickup_time ASC, cr.id ASC
      `);
      return result.recordset || [];
    } catch (error) {
      logger.error('Error fetching waiting passengers:', error);
      return [];
    }
  }
}

module.exports = BoardingStatus;
