const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class Driver {
  static async findAll(filters = {}) {
    const pool = getPool();
    const request = pool.request();
    let where = 'WHERE d.is_active = 1';

    if (filters.availability_status) {
      where += ' AND d.availability_status = @status';
      request.input('status', sql.NVarChar(20), filters.availability_status);
    }
    if (filters.vendor_id) {
      where += ' AND d.vendor_id = @vendorId';
      request.input('vendorId', sql.Int, filters.vendor_id);
    }

    const result = await request.query(`
      SELECT d.*, u.name, u.email, u.phone, u.employee_id,
             v.vehicle_number, v.vehicle_type, v.capacity, v.make, v.model, v.color,
             vn.name AS vendor_name
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN vehicles v ON v.id = d.vehicle_id
      LEFT JOIN vendors vn ON vn.id = d.vendor_id
      ${where}
      ORDER BY u.name
    `);
    return result.recordset;
  }

  static async findById(id) {
    const pool = getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT d.*, u.name, u.email, u.phone, u.employee_id,
               v.vehicle_number, v.vehicle_type, v.capacity,
               vn.name AS vendor_name
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN vehicles v ON v.id = d.vehicle_id
        LEFT JOIN vendors vn ON vn.id = d.vendor_id
        WHERE d.id = @id
      `);
    return result.recordset[0] || null;
  }

  static async findByUserId(userId) {
    const pool = getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT d.*, u.name, u.email, u.phone,
               v.vehicle_number, v.vehicle_type, v.capacity
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN vehicles v ON v.id = d.vehicle_id
        WHERE d.user_id = @userId
      `);
    return result.recordset[0] || null;
  }

  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('userId', sql.Int, data.user_id)
      .input('vehicleId', sql.Int, data.vehicle_id || null)
      .input('vendorId', sql.Int, data.vendor_id || null)
      .input('licenseNumber', sql.NVarChar(50), data.license_number || null)
      .input('licenseExpiry', sql.Date, data.license_expiry || null)
      .input('badgeNumber', sql.NVarChar(50), data.badge_number || null)
      .query(`
        INSERT INTO drivers (user_id, vehicle_id, vendor_id, license_number, license_expiry, badge_number)
        OUTPUT INSERTED.*
        VALUES (@userId, @vehicleId, @vendorId, @licenseNumber, @licenseExpiry, @badgeNumber)
      `);
    return result.recordset[0];
  }

  static async update(id, data) {
    const pool = getPool();
    const request = pool.request().input('id', sql.Int, id);
    const sets = ['updated_at = GETDATE()'];

    if (data.vehicle_id !== undefined) {
      request.input('vehicleId', sql.Int, data.vehicle_id);
      sets.push('vehicle_id = @vehicleId');
    }
    if (data.vendor_id !== undefined) {
      request.input('vendorId', sql.Int, data.vendor_id);
      sets.push('vendor_id = @vendorId');
    }
    if (data.license_number !== undefined) {
      request.input('licenseNumber', sql.NVarChar(50), data.license_number);
      sets.push('license_number = @licenseNumber');
    }
    if (data.license_expiry !== undefined) {
      request.input('licenseExpiry', sql.Date, data.license_expiry);
      sets.push('license_expiry = @licenseExpiry');
    }
    if (data.badge_number !== undefined) {
      request.input('badgeNumber', sql.NVarChar(50), data.badge_number);
      sets.push('badge_number = @badgeNumber');
    }

    const result = await request.query(`
      UPDATE drivers SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE id = @id
    `);
    return result.recordset[0] || null;
  }

  static async updateAvailability(id, status) {
    const pool = getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar(20), status)
      .query(`
        UPDATE drivers SET availability_status = @status, updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    return result.recordset[0] || null;
  }

  static async updateLocation(id, latitude, longitude) {
    const pool = getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('lat', sql.Float, latitude)
      .input('lng', sql.Float, longitude)
      .query(`
        UPDATE drivers
        SET current_latitude = @lat, current_longitude = @lng,
            last_location_update = GETDATE(), updated_at = GETDATE()
        WHERE id = @id
      `);
    return true;
  }

  static async getOnlineDrivers() {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT d.*, u.name, u.phone,
             v.vehicle_number, v.vehicle_type, v.capacity
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN vehicles v ON v.id = d.vehicle_id
      WHERE d.is_active = 1 AND d.availability_status = 'ONLINE'
    `);
    return result.recordset;
  }

  static async delete(id) {
    const pool = getPool();
    await pool.request().input('id', sql.Int, id).query(`
      UPDATE drivers SET is_active = 0, updated_at = GETDATE() WHERE id = @id
    `);
    return true;
  }
}

module.exports = Driver;
