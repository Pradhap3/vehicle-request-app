const { sql, getPool } = require('../config/database');

class GateLog {
  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('tripId', sql.Int, data.trip_id || null)
      .input('bookingId', sql.Int, data.booking_id || null)
      .input('vehicleId', sql.Int, data.vehicle_id || null)
      .input('driverId', sql.Int, data.driver_id || null)
      .input('employeeId', sql.Int, data.employee_id || null)
      .input('gateCode', sql.NVarChar(20), data.gate_code)
      .input('actionType', sql.NVarChar(20), data.action_type || 'CHECK_IN')
      .input('vehicleNumber', sql.NVarChar(20), data.vehicle_number || null)
      .input('verificationStatus', sql.NVarChar(20), data.verification_status || 'VERIFIED')
      .input('notes', sql.NVarChar(500), data.notes || null)
      .input('loggedBy', sql.Int, data.logged_by)
      .query(`
        INSERT INTO gate_logs (trip_id, booking_id, vehicle_id, driver_id, employee_id, gate_code, action_type, vehicle_number, verification_status, notes, logged_by)
        OUTPUT INSERTED.* VALUES (@tripId, @bookingId, @vehicleId, @driverId, @employeeId, @gateCode, @actionType, @vehicleNumber, @verificationStatus, @notes, @loggedBy)
      `);
    return result.recordset[0];
  }

  static async findAll(filters = {}, limit = 50, offset = 0) {
    const pool = getPool();
    const request = pool.request().input('limit', sql.Int, limit).input('offset', sql.Int, offset);
    let where = 'WHERE 1=1';
    if (filters.gate_code) { where += ' AND gl.gate_code = @gateCode'; request.input('gateCode', sql.NVarChar(20), filters.gate_code); }
    if (filters.vehicle_number) { where += ' AND gl.vehicle_number LIKE @vn'; request.input('vn', sql.NVarChar(20), `%${filters.vehicle_number}%`); }
    if (filters.date) { where += ' AND CAST(gl.created_at AS DATE) = @date'; request.input('date', sql.Date, filters.date); }
    if (filters.action_type) { where += ' AND gl.action_type = @actionType'; request.input('actionType', sql.NVarChar(20), filters.action_type); }

    const result = await request.query(`
      SELECT gl.*, u.name AS employee_name, lu.name AS logged_by_name
      FROM gate_logs gl
      LEFT JOIN users u ON u.id = gl.employee_id
      LEFT JOIN users lu ON lu.id = gl.logged_by
      ${where}
      ORDER BY gl.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    return result.recordset;
  }

  static async searchTrips(query) {
    const pool = getPool();
    const result = await pool.request()
      .input('q', sql.NVarChar(100), `%${query}%`)
      .query(`
        SELECT TOP 20 b.id AS booking_id, b.booking_ref, b.status, b.pickup_time,
               u.name AS employee_name, u.employee_id,
               t.id AS trip_id, t.trip_ref,
               v.vehicle_number, du.name AS driver_name
        FROM bookings b
        LEFT JOIN users u ON u.id = b.employee_id
        LEFT JOIN trips t ON t.booking_id = b.id
        LEFT JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN drivers d ON d.id = t.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        WHERE b.is_active = 1 AND (
          b.booking_ref LIKE @q OR u.name LIKE @q OR u.employee_id LIKE @q
          OR v.vehicle_number LIKE @q OR t.trip_ref LIKE @q
        )
        ORDER BY b.pickup_time DESC
      `);
    return result.recordset;
  }
}

module.exports = GateLog;
