const { sql, getPool, withTransaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class Booking {
  static generateRef() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BK${ts}${rand}`.slice(0, 12);
  }

  static async create(data) {
    const pool = getPool();
    const ref = this.generateRef();
    const result = await pool.request()
      .input('ref', sql.NVarChar(20), ref)
      .input('employeeId', sql.Int, data.employee_id)
      .input('routeId', sql.Int, data.route_id || null)
      .input('shiftId', sql.Int, data.shift_id || null)
      .input('pickupLocation', sql.NVarChar(500), data.pickup_location)
      .input('dropLocation', sql.NVarChar(500), data.drop_location)
      .input('pickupLat', sql.Float, data.pickup_latitude || null)
      .input('pickupLng', sql.Float, data.pickup_longitude || null)
      .input('dropLat', sql.Float, data.drop_latitude || null)
      .input('dropLng', sql.Float, data.drop_longitude || null)
      .input('pickupTime', sql.DateTime, new Date(data.pickup_time))
      .input('passengers', sql.Int, data.passengers || 1)
      .input('purpose', sql.NVarChar(500), data.purpose || null)
      .input('bookingType', sql.NVarChar(50), data.booking_type || 'ADHOC')
      .input('priority', sql.NVarChar(20), data.priority || 'NORMAL')
      .input('status', sql.NVarChar(50), data.status || 'REQUESTED')
      .input('approvalRequired', sql.Bit, data.approval_required ? 1 : 0)
      .input('notes', sql.NVarChar(sql.MAX), data.notes || null)
      .query(`
        INSERT INTO bookings (
          booking_ref, employee_id, route_id, shift_id,
          pickup_location, drop_location, pickup_latitude, pickup_longitude,
          drop_latitude, drop_longitude, pickup_time, passengers, purpose,
          booking_type, priority, status, approval_required, notes,
          created_at, updated_at
        ) OUTPUT INSERTED.*
        VALUES (
          @ref, @employeeId, @routeId, @shiftId,
          @pickupLocation, @dropLocation, @pickupLat, @pickupLng,
          @dropLat, @dropLng, @pickupTime, @passengers, @purpose,
          @bookingType, @priority, @status, @approvalRequired, @notes,
          GETDATE(), GETDATE()
        )
      `);
    return result.recordset[0];
  }

  static async findById(id) {
    const pool = getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT b.*, u.name AS employee_name, u.email AS employee_email,
               u.phone AS employee_phone, u.department,
               r.name AS route_name, s.name AS shift_name
        FROM bookings b
        LEFT JOIN users u ON u.id = b.employee_id
        LEFT JOIN routes r ON r.id = b.route_id
        LEFT JOIN shifts s ON s.id = b.shift_id
        WHERE b.id = @id AND b.is_active = 1
      `);
    return result.recordset[0] || null;
  }

  static async findByRef(ref) {
    const pool = getPool();
    const result = await pool.request()
      .input('ref', sql.NVarChar(20), ref)
      .query(`
        SELECT b.*, u.name AS employee_name, r.name AS route_name
        FROM bookings b
        LEFT JOIN users u ON u.id = b.employee_id
        LEFT JOIN routes r ON r.id = b.route_id
        WHERE b.booking_ref = @ref AND b.is_active = 1
      `);
    return result.recordset[0] || null;
  }

  static async findAll(filters = {}, limit = 20, offset = 0) {
    const pool = getPool();
    const request = pool.request();
    let where = 'WHERE b.is_active = 1';

    if (filters.employee_id) {
      where += ' AND b.employee_id = @employeeId';
      request.input('employeeId', sql.Int, filters.employee_id);
    }
    if (filters.status) {
      where += ' AND b.status = @status';
      request.input('status', sql.NVarChar(50), filters.status);
    }
    if (filters.booking_type) {
      where += ' AND b.booking_type = @bookingType';
      request.input('bookingType', sql.NVarChar(50), filters.booking_type);
    }
    if (filters.date) {
      where += ' AND CAST(b.pickup_time AS DATE) = @date';
      request.input('date', sql.Date, filters.date);
    }
    if (filters.from_date && filters.to_date) {
      where += ' AND b.pickup_time BETWEEN @fromDate AND @toDate';
      request.input('fromDate', sql.DateTime, new Date(filters.from_date));
      request.input('toDate', sql.DateTime, new Date(filters.to_date));
    }
    if (filters.route_id) {
      where += ' AND b.route_id = @routeId';
      request.input('routeId', sql.Int, filters.route_id);
    }
    if (filters.shift_id) {
      where += ' AND b.shift_id = @shiftId';
      request.input('shiftId', sql.Int, filters.shift_id);
    }

    request.input('limit', sql.Int, limit);
    request.input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT b.*, u.name AS employee_name, u.department,
             r.name AS route_name, s.name AS shift_name
      FROM bookings b
      LEFT JOIN users u ON u.id = b.employee_id
      LEFT JOIN routes r ON r.id = b.route_id
      LEFT JOIN shifts s ON s.id = b.shift_id
      ${where}
      ORDER BY b.pickup_time DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const countResult = await pool.request()
      .query(`SELECT COUNT(*) as total FROM bookings b ${where.replace(/@\w+/g, 'NULL')}`);

    return {
      data: result.recordset,
      total: countResult.recordset[0]?.total || result.recordset.length
    };
  }

  static async updateStatus(id, status, userId, extra = {}) {
    const pool = getPool();
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar(50), status);

    let extraSql = '';
    if (status === 'APPROVED' && userId) {
      request.input('approvedBy', sql.Int, userId);
      extraSql += ', approved_by = @approvedBy, approved_at = GETDATE()';
    }
    if (status === 'CANCELLED') {
      request.input('cancelledBy', sql.Int, userId || null);
      request.input('reason', sql.NVarChar(500), extra.reason || null);
      extraSql += ', cancelled_by = @cancelledBy, cancelled_at = GETDATE(), cancellation_reason = @reason';
    }

    const result = await request.query(`
      UPDATE bookings SET status = @status, updated_at = GETDATE() ${extraSql}
      OUTPUT INSERTED.*
      WHERE id = @id AND is_active = 1
    `);
    return result.recordset[0] || null;
  }

  static async update(id, data) {
    const pool = getPool();
    const request = pool.request().input('id', sql.Int, id);
    const sets = ['updated_at = GETDATE()'];

    const fields = {
      pickup_location: sql.NVarChar(500),
      drop_location: sql.NVarChar(500),
      pickup_latitude: sql.Float,
      pickup_longitude: sql.Float,
      drop_latitude: sql.Float,
      drop_longitude: sql.Float,
      passengers: sql.Int,
      purpose: sql.NVarChar(500),
      priority: sql.NVarChar(20),
      notes: sql.NVarChar(sql.MAX)
    };

    for (const [key, type] of Object.entries(fields)) {
      if (data[key] !== undefined) {
        request.input(key, type, data[key]);
        sets.push(`${key} = @${key}`);
      }
    }
    if (data.pickup_time) {
      request.input('pickupTime', sql.DateTime, new Date(data.pickup_time));
      sets.push('pickup_time = @pickupTime');
    }

    const result = await request.query(`
      UPDATE bookings SET ${sets.join(', ')}
      OUTPUT INSERTED.*
      WHERE id = @id AND is_active = 1
    `);
    return result.recordset[0] || null;
  }

  static async softDelete(id) {
    const pool = getPool();
    await pool.request().input('id', sql.Int, id).query(`
      UPDATE bookings SET is_active = 0, updated_at = GETDATE() WHERE id = @id
    `);
    return true;
  }

  static async getEmployeeStats(employeeId, days = 30) {
    const pool = getPool();
    const result = await pool.request()
      .input('employeeId', sql.Int, employeeId)
      .input('days', sql.Int, days)
      .query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows,
          SUM(CASE WHEN status IN ('REQUESTED','APPROVED','ASSIGNED') THEN 1 ELSE 0 END) AS upcoming
        FROM bookings
        WHERE employee_id = @employeeId AND is_active = 1
          AND created_at >= DATEADD(DAY, -@days, GETDATE())
      `);
    return result.recordset[0];
  }
}

module.exports = Booking;
