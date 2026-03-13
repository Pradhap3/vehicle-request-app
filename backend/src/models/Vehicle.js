const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class Vehicle {
  static async findAll(filters = {}) {
    const pool = getPool();
    const request = pool.request();
    let where = 'WHERE v.is_active = 1';

    if (filters.vendor_id) {
      where += ' AND v.vendor_id = @vendorId';
      request.input('vendorId', sql.Int, filters.vendor_id);
    }
    if (filters.vehicle_type) {
      where += ' AND v.vehicle_type = @type';
      request.input('type', sql.NVarChar(50), filters.vehicle_type);
    }

    const result = await request.query(`
      SELECT v.*, vn.name AS vendor_name,
             d.id AS driver_id, u.name AS driver_name
      FROM vehicles v
      LEFT JOIN vendors vn ON vn.id = v.vendor_id
      LEFT JOIN drivers d ON d.vehicle_id = v.id AND d.is_active = 1
      LEFT JOIN users u ON u.id = d.user_id
      ${where}
      ORDER BY v.vehicle_number
    `);
    return result.recordset;
  }

  static async findById(id) {
    const pool = getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT v.*, vn.name AS vendor_name,
               d.id AS driver_id, u.name AS driver_name
        FROM vehicles v
        LEFT JOIN vendors vn ON vn.id = v.vendor_id
        LEFT JOIN drivers d ON d.vehicle_id = v.id AND d.is_active = 1
        LEFT JOIN users u ON u.id = d.user_id
        WHERE v.id = @id
      `);
    return result.recordset[0] || null;
  }

  static async findByNumber(vehicleNumber) {
    const pool = getPool();
    const result = await pool.request()
      .input('num', sql.NVarChar(20), vehicleNumber)
      .query(`
        SELECT v.*, d.id AS driver_id, u.name AS driver_name
        FROM vehicles v
        LEFT JOIN drivers d ON d.vehicle_id = v.id AND d.is_active = 1
        LEFT JOIN users u ON u.id = d.user_id
        WHERE v.vehicle_number = @num
      `);
    return result.recordset[0] || null;
  }

  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('vehicleNumber', sql.NVarChar(20), data.vehicle_number)
      .input('vehicleType', sql.NVarChar(50), data.vehicle_type || 'SEDAN')
      .input('make', sql.NVarChar(100), data.make || null)
      .input('model', sql.NVarChar(100), data.model || null)
      .input('year', sql.Int, data.year || null)
      .input('color', sql.NVarChar(50), data.color || null)
      .input('capacity', sql.Int, data.capacity || 4)
      .input('fuelType', sql.NVarChar(20), data.fuel_type || 'PETROL')
      .input('insuranceExpiry', sql.Date, data.insurance_expiry || null)
      .input('fitnessExpiry', sql.Date, data.fitness_expiry || null)
      .input('permitExpiry', sql.Date, data.permit_expiry || null)
      .input('vendorId', sql.Int, data.vendor_id || null)
      .query(`
        INSERT INTO vehicles (
          vehicle_number, vehicle_type, make, model, year, color, capacity,
          fuel_type, insurance_expiry, fitness_expiry, permit_expiry, vendor_id
        ) OUTPUT INSERTED.*
        VALUES (
          @vehicleNumber, @vehicleType, @make, @model, @year, @color, @capacity,
          @fuelType, @insuranceExpiry, @fitnessExpiry, @permitExpiry, @vendorId
        )
      `);
    return result.recordset[0];
  }

  static async update(id, data) {
    const pool = getPool();
    const request = pool.request().input('id', sql.Int, id);
    const sets = ['updated_at = GETDATE()'];

    const fields = {
      vehicle_number: sql.NVarChar(20),
      vehicle_type: sql.NVarChar(50),
      make: sql.NVarChar(100),
      model: sql.NVarChar(100),
      year: sql.Int,
      color: sql.NVarChar(50),
      capacity: sql.Int,
      fuel_type: sql.NVarChar(20),
      vendor_id: sql.Int
    };
    const dateFields = ['insurance_expiry', 'fitness_expiry', 'permit_expiry'];

    for (const [key, type] of Object.entries(fields)) {
      if (data[key] !== undefined) {
        request.input(key, type, data[key]);
        sets.push(`${key} = @${key}`);
      }
    }
    for (const key of dateFields) {
      if (data[key] !== undefined) {
        request.input(key, sql.Date, data[key]);
        sets.push(`${key} = @${key}`);
      }
    }

    const result = await request.query(`
      UPDATE vehicles SET ${sets.join(', ')}
      OUTPUT INSERTED.*
      WHERE id = @id
    `);
    return result.recordset[0] || null;
  }

  static async delete(id) {
    const pool = getPool();
    await pool.request().input('id', sql.Int, id).query(`
      UPDATE vehicles SET is_active = 0, updated_at = GETDATE() WHERE id = @id
    `);
    return true;
  }

  static async getAvailable() {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT v.*, d.availability_status, u.name AS driver_name
      FROM vehicles v
      LEFT JOIN drivers d ON d.vehicle_id = v.id AND d.is_active = 1
      LEFT JOIN users u ON u.id = d.user_id
      WHERE v.is_active = 1
        AND d.availability_status = 'ONLINE'
      ORDER BY v.capacity
    `);
    return result.recordset;
  }
}

module.exports = Vehicle;
