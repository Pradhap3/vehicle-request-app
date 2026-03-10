const { sql, getPool, withTransaction } = require('../config/database');
const { istToUTC, utcToIST } = require('../utils/timezone');
const { DatabaseError, NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

class CabRequest {
  static normalizeInt(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  static mapRecord(record) {
    return {
      ...this._formatResponse(record),
      employee_name: record.employee_name,
      route_name: record.route_name,
      cab_number: record.cab_number,
      driver_id: record.driver_id
    };
  }

  static async create(data) {
    const pool = getPool();

    try {
      const pickupLocation = data.pickup_location || data.departure_location || data.boarding_area || null;
      const dropLocation = data.drop_location || data.destination_location || data.dropping_area || null;
      const pickupTime = data.pickup_time || data.requested_time || data.travel_time || new Date();

      const result = await pool.request()
        .input('employeeId', sql.Int, this.normalizeInt(data.employee_id))
        .input('routeId', sql.Int, this.normalizeInt(data.route_id))
        .input('pickupLocation', sql.NVarChar(500), pickupLocation)
        .input('dropLocation', sql.NVarChar(500), dropLocation)
        .input('pickupLatitude', sql.Float, data.pickup_latitude || null)
        .input('pickupLongitude', sql.Float, data.pickup_longitude || null)
        .input('dropLatitude', sql.Float, data.drop_latitude || null)
        .input('dropLongitude', sql.Float, data.drop_longitude || null)
        .input('pickupTime', sql.DateTime, istToUTC(pickupTime))
        .input('passengers', sql.Int, this.normalizeInt(data.passengers || data.number_of_people) || 1)
        .input('purpose', sql.NVarChar(500), data.purpose || null)
        .input('requestType', sql.NVarChar(50), data.request_type || 'ADHOC')
        .input('priority', sql.NVarChar(20), data.priority || 'NORMAL')
        .input('status', sql.NVarChar(50), data.status || 'PENDING')
        .input('assignedAt', sql.DateTime, data.assigned_at ? new Date(data.assigned_at) : null)
        .input('boardingArea', sql.NVarChar(500), data.boarding_area || pickupLocation)
        .input('droppingArea', sql.NVarChar(500), data.dropping_area || dropLocation)
        .input('createdAt', sql.DateTime, new Date())
        .query(`
          INSERT INTO cab_requests (
            employee_id, route_id, pickup_location, drop_location,
            pickup_latitude, pickup_longitude, drop_latitude, drop_longitude,
            pickup_time, passengers, purpose, request_type, priority, status,
            assigned_at, boarding_area, dropping_area, created_at, updated_at, is_active
          )
          VALUES (
            @employeeId, @routeId, @pickupLocation, @dropLocation,
            @pickupLatitude, @pickupLongitude, @dropLatitude, @dropLongitude,
            @pickupTime, @passengers, @purpose, @requestType, @priority, @status,
            @assignedAt, @boardingArea, @droppingArea, @createdAt, @createdAt, 1
          );

          SELECT CAST(SCOPE_IDENTITY() as int) as id;
        `);

      const id = result.recordset[0].id;
      logger.info(`Request created: ${id}`, { employeeId: data.employee_id });
      return this.findById(id);
    } catch (error) {
      logger.error('Failed to create request:', error);
      throw new DatabaseError('Failed to create request', error, 'CREATE');
    }
  }

  static async findById(id) {
    const pool = getPool();

    try {
      const result = await pool.request()
        .input('id', sql.Int, this.normalizeInt(id))
        .query(`
          SELECT
            cr.*,
            u.name AS employee_name,
            r.name AS route_name,
            c.cab_number,
            c.driver_id
          FROM cab_requests cr
          LEFT JOIN users u ON u.id = cr.employee_id
          LEFT JOIN routes r ON r.id = cr.route_id
          LEFT JOIN cabs c ON c.id = cr.cab_id
          WHERE cr.id = @id AND cr.is_active = 1
        `);

      if (result.recordset.length === 0) {
        return null;
      }

      return this.mapRecord(result.recordset[0]);
    } catch (error) {
      logger.error('Failed to fetch request:', error);
      throw new DatabaseError('Failed to fetch request', error, 'READ');
    }
  }

  static async findAll(filters = {}, limit = 20, offset = 0) {
    const pool = getPool();

    try {
      let whereClause = 'WHERE cr.is_active = 1';
      const request = pool.request();

      if (filters.employeeId) {
        whereClause += ' AND cr.employee_id = @employeeId';
        request.input('employeeId', sql.Int, this.normalizeInt(filters.employeeId));
      }

      if (filters.status) {
        whereClause += ' AND cr.status = @status';
        request.input('status', sql.NVarChar(50), filters.status);
      }

      if (filters.cabId) {
        whereClause += ' AND cr.cab_id = @cabId';
        request.input('cabId', sql.Int, this.normalizeInt(filters.cabId));
      }

      if (filters.fromDate && filters.toDate) {
        whereClause += ' AND cr.pickup_time BETWEEN @fromDate AND @toDate';
        request.input('fromDate', sql.DateTime, istToUTC(filters.fromDate));
        request.input('toDate', sql.DateTime, istToUTC(filters.toDate));
      }

      if (filters.date) {
        whereClause += ' AND CAST(cr.pickup_time AS DATE) = @date';
        request.input('date', sql.Date, String(filters.date).slice(0, 10));
      }

      request
        .input('limit', sql.Int, Number.parseInt(limit, 10))
        .input('offset', sql.Int, Number.parseInt(offset, 10));

      const result = await request.query(`
        SELECT
          cr.*,
          u.name AS employee_name,
          r.name AS route_name,
          c.cab_number,
          c.driver_id
        FROM cab_requests cr
        LEFT JOIN users u ON u.id = cr.employee_id
        LEFT JOIN routes r ON r.id = cr.route_id
        LEFT JOIN cabs c ON c.id = cr.cab_id
        ${whereClause}
        ORDER BY cr.pickup_time DESC, cr.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

      return result.recordset.map((row) => this.mapRecord(row));
    } catch (error) {
      logger.error('Failed to fetch requests:', error);
      throw new DatabaseError('Failed to fetch requests', error, 'READ');
    }
  }

  static async findForEmployeeOnDate(employeeId, date) {
    const pool = getPool();

    try {
      const result = await pool.request()
        .input('employeeId', sql.Int, this.normalizeInt(employeeId))
        .input('date', sql.Date, String(date).slice(0, 10))
        .query(`
          SELECT
            cr.*,
            u.name AS employee_name,
            r.name AS route_name,
            c.cab_number,
            c.driver_id
          FROM cab_requests cr
          LEFT JOIN users u ON u.id = cr.employee_id
          LEFT JOIN routes r ON r.id = cr.route_id
          LEFT JOIN cabs c ON c.id = cr.cab_id
          WHERE cr.employee_id = @employeeId
            AND CAST(cr.pickup_time AS DATE) = @date
            AND cr.is_active = 1
          ORDER BY cr.pickup_time ASC
        `);

      return result.recordset.map((row) => this.mapRecord(row));
    } catch (error) {
      throw new DatabaseError('Failed to fetch employee requests', error, 'READ');
    }
  }

  static async getByEmployeeId(employeeId) {
    return this.findAll({ employeeId }, 500, 0);
  }

  static async getAssignedRequestsForCab(cabId, date) {
    const pool = getPool();

    try {
      const result = await pool.request()
        .input('cabId', sql.Int, this.normalizeInt(cabId))
        .input('date', sql.Date, String(date).slice(0, 10))
        .query(`
          SELECT
            cr.*,
            u.name AS employee_name,
            r.name AS route_name,
            c.cab_number,
            c.driver_id
          FROM cab_requests cr
          LEFT JOIN users u ON u.id = cr.employee_id
          LEFT JOIN routes r ON r.id = cr.route_id
          LEFT JOIN cabs c ON c.id = cr.cab_id
          WHERE cr.cab_id = @cabId
            AND CAST(cr.pickup_time AS DATE) = @date
            AND cr.is_active = 1
            AND cr.status IN ('APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED')
          ORDER BY cr.pickup_time ASC
        `);

      return result.recordset.map((row) => this.mapRecord(row));
    } catch (error) {
      throw new DatabaseError('Failed to fetch assigned requests', error, 'READ');
    }
  }

  static async findRecurringTripsForEmployeeOnDate(employeeId, date, requestTypes = []) {
    const pool = getPool();

    try {
      const types = Array.isArray(requestTypes) && requestTypes.length > 0
        ? requestTypes
        : ['RECURRING', 'RECURRING_INBOUND', 'RECURRING_OUTBOUND'];
      const request = pool.request()
        .input('employeeId', sql.Int, this.normalizeInt(employeeId))
        .input('date', sql.Date, String(date).slice(0, 10));

      const placeholders = types.map((type, index) => {
        request.input(`type${index}`, sql.NVarChar(50), type);
        return `@type${index}`;
      });

      const result = await request.query(`
        SELECT *
        FROM cab_requests
        WHERE employee_id = @employeeId
          AND CAST(pickup_time AS DATE) = @date
          AND is_active = 1
          AND request_type IN (${placeholders.join(', ')})
        ORDER BY created_at DESC
      `);

      return result.recordset.map((row) => this.mapRecord(row));
    } catch (error) {
      throw new DatabaseError('Failed to fetch recurring trips', error, 'READ');
    }
  }

  static async findActiveTripForEmployeeOnDate(employeeId, date, requestTypes = []) {
    const trips = await this.findRecurringTripsForEmployeeOnDate(employeeId, date, requestTypes);
    return trips.find((trip) => ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status)) || null;
  }

  static async update(id, updates = {}) {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError('Request', id);
    }

    const payload = {
      route_id: updates.route_id ?? existing.route_id,
      pickup_location: updates.pickup_location ?? updates.departure_location ?? updates.boarding_area ?? existing.pickup_location,
      drop_location: updates.drop_location ?? updates.destination_location ?? updates.dropping_area ?? existing.drop_location,
      pickup_time: updates.pickup_time ?? updates.requested_time ?? updates.travel_time ?? existing.pickup_time,
      assigned_at: updates.assigned_at ?? existing.assigned_at,
      boarding_area: updates.boarding_area ?? existing.boarding_area,
      dropping_area: updates.dropping_area ?? existing.dropping_area,
      purpose: updates.purpose ?? existing.purpose,
      priority: updates.priority ?? existing.priority,
      passengers: updates.passengers ?? updates.number_of_people ?? existing.passengers,
      request_type: updates.request_type ?? existing.request_type,
      status: updates.status ?? existing.status
    };

    try {
      await getPool().request()
        .input('id', sql.Int, this.normalizeInt(id))
        .input('routeId', sql.Int, this.normalizeInt(payload.route_id))
        .input('pickupLocation', sql.NVarChar(500), payload.pickup_location)
        .input('dropLocation', sql.NVarChar(500), payload.drop_location)
        .input('pickupTime', sql.DateTime, istToUTC(payload.pickup_time))
        .input('assignedAt', sql.DateTime, payload.assigned_at ? new Date(payload.assigned_at) : null)
        .input('boardingArea', sql.NVarChar(500), payload.boarding_area || null)
        .input('droppingArea', sql.NVarChar(500), payload.dropping_area || null)
        .input('purpose', sql.NVarChar(500), payload.purpose || null)
        .input('priority', sql.NVarChar(20), payload.priority || 'NORMAL')
        .input('passengers', sql.Int, this.normalizeInt(payload.passengers) || 1)
        .input('requestType', sql.NVarChar(50), payload.request_type || 'ADHOC')
        .input('status', sql.NVarChar(50), payload.status || existing.status)
        .query(`
          UPDATE cab_requests
          SET route_id = @routeId,
              pickup_location = @pickupLocation,
              drop_location = @dropLocation,
              pickup_time = @pickupTime,
              assigned_at = @assignedAt,
              boarding_area = @boardingArea,
              dropping_area = @droppingArea,
              purpose = @purpose,
              priority = @priority,
              passengers = @passengers,
              request_type = @requestType,
              status = @status,
              updated_at = GETDATE()
          WHERE id = @id AND is_active = 1
        `);

      return this.findById(id);
    } catch (error) {
      throw new DatabaseError('Failed to update request', error, 'UPDATE');
    }
  }

  static async updateStatus(id, status, updatedBy) {
    try {
      const result = await getPool().request()
        .input('id', sql.Int, this.normalizeInt(id))
        .input('status', sql.NVarChar(50), status)
        .input('updatedAt', sql.DateTime, new Date())
        .query(`
          UPDATE cab_requests
          SET status = @status, updated_at = @updatedAt
          WHERE id = @id AND is_active = 1

          SELECT @@ROWCOUNT as affected
        `);

      if (result.recordset[0].affected === 0) {
        throw new NotFoundError('Request', id);
      }

      logger.info(`Request ${id} status updated to ${status}`, { updatedBy });
      return this.findById(id);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to update request', error, 'UPDATE');
    }
  }

  static async assignCab(id, cabId, assignedBy) {
    try {
      return await withTransaction(async (tx) => {
        const requestLock = await tx.request()
          .input('id', sql.Int, this.normalizeInt(id))
          .query(`
            SELECT TOP 1 id, status FROM cab_requests WITH (UPDLOCK)
            WHERE id = @id AND is_active = 1
          `);

        if (requestLock.recordset.length === 0) {
          throw new NotFoundError('Request', id);
        }

        if (!['PENDING', 'APPROVED'].includes(requestLock.recordset[0].status)) {
          throw new ConflictError('Request not in valid state for assignment');
        }

        const cabLock = await tx.request()
          .input('cabId', sql.Int, this.normalizeInt(cabId))
          .query(`
            SELECT TOP 1 id, status FROM cabs WITH (UPDLOCK)
            WHERE id = @cabId AND is_active = 1
          `);

        if (cabLock.recordset.length === 0) {
          throw new NotFoundError('Cab', cabId);
        }

        await tx.request()
          .input('id', sql.Int, this.normalizeInt(id))
          .input('cabId', sql.Int, this.normalizeInt(cabId))
          .input('assignedAt', sql.DateTime, new Date())
          .query(`
            UPDATE cab_requests
            SET cab_id = @cabId,
                assigned_at = @assignedAt,
                status = 'ASSIGNED',
                updated_at = GETDATE()
            WHERE id = @id
          `);

        logger.info(`Request ${id} assigned to cab ${cabId}`, { assignedBy });
        return this.findById(id);
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ConflictError) throw error;
      throw new DatabaseError('Failed to assign cab', error, 'UPDATE');
    }
  }

  static async markBoarded(id, boardedAt, location, boardedBy) {
    try {
      const result = await getPool().request()
        .input('id', sql.Int, this.normalizeInt(id))
        .input('boardedAt', sql.DateTime, boardedAt || new Date())
        .input('location', sql.NVarChar(500), location)
        .input('status', sql.NVarChar(50), 'IN_PROGRESS')
        .query(`
          UPDATE cab_requests
          SET actual_pickup_time = @boardedAt,
              boarding_area = @location,
              status = @status,
              updated_at = GETDATE()
          WHERE id = @id AND is_active = 1

          SELECT @@ROWCOUNT as affected
        `);

      if (result.recordset[0].affected === 0) {
        throw new NotFoundError('Request', id);
      }

      logger.info(`Request ${id} marked as boarded`, { boardedBy, location });
      return this.findById(id);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to mark as boarded', error, 'UPDATE');
    }
  }

  static async markDropped(id, droppedAt, location, droppedBy) {
    try {
      const result = await getPool().request()
        .input('id', sql.Int, this.normalizeInt(id))
        .input('droppedAt', sql.DateTime, droppedAt || new Date())
        .input('location', sql.NVarChar(500), location)
        .input('status', sql.NVarChar(50), 'COMPLETED')
        .query(`
          UPDATE cab_requests
          SET actual_dropoff_time = @droppedAt,
              dropping_area = @location,
              status = @status,
              updated_at = GETDATE()
          WHERE id = @id AND is_active = 1

          SELECT @@ROWCOUNT as affected
        `);

      if (result.recordset[0].affected === 0) {
        throw new NotFoundError('Request', id);
      }

      logger.info(`Request ${id} marked as dropped`, { droppedBy, location });
      return this.findById(id);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to mark as dropped', error, 'UPDATE');
    }
  }

  static async cancel(id, reason = 'Cancelled', cancelledBy) {
    try {
      const result = await getPool().request()
        .input('id', sql.Int, this.normalizeInt(id))
        .input('reason', sql.NVarChar(500), reason)
        .input('status', sql.NVarChar(50), 'CANCELLED')
        .query(`
          UPDATE cab_requests
          SET status = @status,
              notes = ISNULL(notes, '') + '; CANCELLED: ' + @reason,
              updated_at = GETDATE()
          WHERE id = @id AND is_active = 1 AND status IN ('PENDING', 'APPROVED', 'ASSIGNED')

          SELECT @@ROWCOUNT as affected
        `);

      if (result.recordset[0].affected === 0) {
        throw new ConflictError('Request cannot be cancelled in current state');
      }

      logger.info(`Request ${id} cancelled`, { reason, cancelledBy });
      return this.findById(id);
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      throw new DatabaseError('Failed to cancel request', error, 'UPDATE');
    }
  }

  static async softDelete(id, deletedBy) {
    try {
      const result = await getPool().request()
        .input('id', sql.Int, this.normalizeInt(id))
        .input('deletedBy', sql.Int, this.normalizeInt(deletedBy))
        .input('deletedAt', sql.DateTime, new Date())
        .query(`
          UPDATE cab_requests
          SET is_active = 0, deleted_at = @deletedAt, deleted_by = @deletedBy
          WHERE id = @id

          SELECT @@ROWCOUNT as affected
        `);

      if (result.recordset[0].affected === 0) {
        throw new NotFoundError('Request', id);
      }

      logger.info(`Request ${id} soft deleted`, { deletedBy });
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to delete request', error, 'DELETE');
    }
  }

  static _formatResponse(dbRecord) {
    return {
      id: dbRecord.id,
      employee_id: dbRecord.employee_id,
      cab_id: dbRecord.cab_id,
      route_id: dbRecord.route_id,
      pickup_location: dbRecord.pickup_location,
      drop_location: dbRecord.drop_location,
      pickup_latitude: dbRecord.pickup_latitude,
      pickup_longitude: dbRecord.pickup_longitude,
      drop_latitude: dbRecord.drop_latitude,
      drop_longitude: dbRecord.drop_longitude,
      pickup_time: utcToIST(dbRecord.pickup_time),
      passengers: dbRecord.passengers,
      purpose: dbRecord.purpose,
      request_type: dbRecord.request_type,
      priority: dbRecord.priority,
      status: dbRecord.status,
      assigned_at: utcToIST(dbRecord.assigned_at),
      actual_pickup_time: utcToIST(dbRecord.actual_pickup_time),
      actual_dropoff_time: utcToIST(dbRecord.actual_dropoff_time),
      boarding_area: dbRecord.boarding_area,
      dropping_area: dbRecord.dropping_area,
      delay_reason: dbRecord.delay_reason,
      notes: dbRecord.notes,
      created_at: utcToIST(dbRecord.created_at),
      updated_at: utcToIST(dbRecord.updated_at),
      deleted_at: utcToIST(dbRecord.deleted_at),
      deleted_by: dbRecord.deleted_by
    };
  }
}

module.exports = CabRequest;
