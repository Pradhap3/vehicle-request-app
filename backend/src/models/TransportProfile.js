const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

const bindId = (request, paramName, id) => {
  if (id === null || id === undefined) {
    request.input(paramName, sql.NVarChar(255), null);
    return;
  }
  if (/^\d+$/.test(String(id))) {
    request.input(paramName, sql.Int, parseInt(String(id), 10));
    return;
  }
  request.input(paramName, sql.NVarChar(255), String(id));
};

class TransportProfile {
  static normalize(record) {
    if (!record) return record;
    return {
      ...record,
      auto_generate: Boolean(record.auto_generate),
      is_active: Boolean(record.is_active)
    };
  }

  static async findByEmployeeId(employeeId) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindId(request, 'employee_id', employeeId);
      const result = await request.query(`
        SELECT TOP 1 p.*, r.name AS route_name, r.start_point, r.end_point, r.standard_pickup_time
        FROM employee_transport_profiles p
        LEFT JOIN routes r ON r.id = p.route_id
        WHERE p.employee_id = @employee_id AND p.is_active = 1
        ORDER BY p.updated_at DESC, p.id DESC
      `);
      return this.normalize(result.recordset[0]);
    } catch (error) {
      logger.error('Error fetching transport profile:', error);
      return null;
    }
  }

  static async getActiveProfilesForDate(targetDate) {
    try {
      const pool = getPool();
      const request = pool.request().input('target_date', sql.Date, targetDate);
      const result = await request.query(`
        SELECT p.*, u.name AS employee_name, u.phone AS employee_phone, u.email AS employee_email,
               r.name AS route_name, r.standard_pickup_time
        FROM employee_transport_profiles p
        INNER JOIN users u ON u.id = p.employee_id
        LEFT JOIN routes r ON r.id = p.route_id
        WHERE p.is_active = 1
          AND p.auto_generate = 1
          AND u.is_active = 1
          AND (p.effective_from IS NULL OR p.effective_from <= @target_date)
          AND (p.effective_to IS NULL OR p.effective_to >= @target_date)
      `);
      return result.recordset.map((row) => this.normalize(row));
    } catch (error) {
      logger.error('Error fetching active transport profiles:', error);
      return [];
    }
  }

  static async upsert(employeeId, profileData) {
    try {
      const existing = await this.findByEmployeeId(employeeId);
      const pool = getPool();
      const request = pool.request();
      bindId(request, 'employee_id', employeeId);
      bindId(request, 'route_id', profileData.route_id || null);
      request
        .input('shift_code', sql.NVarChar(40), profileData.shift_code || null)
        .input('pickup_location', sql.NVarChar(500), profileData.pickup_location || null)
        .input('drop_location', sql.NVarChar(500), profileData.drop_location || null)
        .input('pickup_latitude', sql.Float, profileData.pickup_latitude ?? null)
        .input('pickup_longitude', sql.Float, profileData.pickup_longitude ?? null)
        .input('drop_latitude', sql.Float, profileData.drop_latitude ?? null)
        .input('drop_longitude', sql.Float, profileData.drop_longitude ?? null)
        .input('stop_name', sql.NVarChar(255), profileData.stop_name || null)
        .input('stop_sequence', sql.Int, profileData.stop_sequence ?? null)
        .input('auto_generate', sql.Bit, profileData.auto_generate !== false)
        .input('is_active', sql.Bit, profileData.is_active !== false)
        .input('effective_from', sql.Date, profileData.effective_from || null)
        .input('effective_to', sql.Date, profileData.effective_to || null);

      let result;
      if (existing) {
        bindId(request, 'id', existing.id);
        result = await request.query(`
          UPDATE employee_transport_profiles
          SET route_id = @route_id,
              shift_code = @shift_code,
              pickup_location = @pickup_location,
              drop_location = @drop_location,
              pickup_latitude = @pickup_latitude,
              pickup_longitude = @pickup_longitude,
              drop_latitude = @drop_latitude,
              drop_longitude = @drop_longitude,
              stop_name = @stop_name,
              stop_sequence = @stop_sequence,
              auto_generate = @auto_generate,
              is_active = @is_active,
              effective_from = @effective_from,
              effective_to = @effective_to,
              updated_at = GETDATE()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      } else {
        result = await request.query(`
          INSERT INTO employee_transport_profiles (
            employee_id, route_id, shift_code, pickup_location, drop_location,
            pickup_latitude, pickup_longitude, drop_latitude, drop_longitude,
            stop_name, stop_sequence, auto_generate, is_active, effective_from, effective_to,
            created_at, updated_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @employee_id, @route_id, @shift_code, @pickup_location, @drop_location,
            @pickup_latitude, @pickup_longitude, @drop_latitude, @drop_longitude,
            @stop_name, @stop_sequence, @auto_generate, @is_active, @effective_from, @effective_to,
            GETDATE(), GETDATE()
          )
        `);
      }
      return this.normalize(result.recordset[0]);
    } catch (error) {
      logger.error('Error upserting transport profile:', error);
      throw error;
    }
  }

  static async markGenerated(profileId, targetDate) {
    try {
      const pool = getPool();
      const request = pool.request()
        .input('target_date', sql.Date, targetDate);
      bindId(request, 'id', profileId);
      await request.query(`
        UPDATE employee_transport_profiles
        SET last_generated_for = @target_date,
            updated_at = GETDATE()
        WHERE id = @id
      `);
    } catch (error) {
      logger.error('Error marking transport profile generated:', error);
    }
  }
}

module.exports = TransportProfile;
