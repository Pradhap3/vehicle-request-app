// src/models/Cab.js
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class Cab {
  static async findAll() {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT c.*, 
                 u.name as driver_name, u.email as driver_email, u.phone as driver_phone
          FROM cabs c
          LEFT JOIN users u ON c.driver_id = u.id
          WHERE c.is_active = 1
          ORDER BY c.cab_number
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching cabs:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('id', sql.NVarChar(255), id)
        .query(`
          SELECT c.*, 
                 u.name as driver_name, u.email as driver_email, u.phone as driver_phone
          FROM cabs c
          LEFT JOIN users u ON c.driver_id = u.id
          WHERE c.id = @id
        `);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error finding cab by ID:', error);
      throw error;
    }
  }

  static async findByDriverId(driverId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('driver_id', sql.NVarChar(255), driverId)
        .query(`
          SELECT * FROM cabs WHERE driver_id = @driver_id AND is_active = 1
        `);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error finding cab by driver ID:', error);
      throw error;
    }
  }

  static async create(cabData) {
    try {
      const pool = getPool();
      const newId = uuidv4().toUpperCase();
      
      const result = await pool.request()
        .input('id', sql.NVarChar(255), newId)
        .input('cab_number', sql.NVarChar(50), cabData.cab_number)
        .input('capacity', sql.Int, cabData.capacity || 4)
        .input('driver_id', sql.NVarChar(255), cabData.driver_id || null)
        .input('status', sql.NVarChar(20), cabData.status || 'AVAILABLE')
        .input('current_latitude', sql.Float, cabData.current_latitude || null)
        .input('current_longitude', sql.Float, cabData.current_longitude || null)
        .input('is_active', sql.Bit, 1)
        .query(`
          INSERT INTO cabs (id, cab_number, capacity, driver_id, status, 
                           current_latitude, current_longitude, is_active, created_at, updated_at)
          OUTPUT INSERTED.*
          VALUES (@id, @cab_number, @capacity, @driver_id, @status,
                  @current_latitude, @current_longitude, @is_active, GETDATE(), GETDATE())
        `);
      
      logger.info(`Cab created: ${cabData.cab_number}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error creating cab:', error);
      throw error;
    }
  }

  static async update(id, cabData) {
    try {
      const pool = getPool();
      const request = pool.request().input('id', sql.NVarChar(255), id);
      
      const updates = [];
      
      if (cabData.cab_number) {
        request.input('cab_number', sql.NVarChar(50), cabData.cab_number);
        updates.push('cab_number = @cab_number');
      }
      if (cabData.capacity !== undefined) {
        request.input('capacity', sql.Int, cabData.capacity);
        updates.push('capacity = @capacity');
      }
      if (cabData.driver_id !== undefined) {
        request.input('driver_id', sql.NVarChar(255), cabData.driver_id);
        updates.push('driver_id = @driver_id');
      }
      if (cabData.status) {
        request.input('status', sql.NVarChar(20), cabData.status);
        updates.push('status = @status');
      }
      if (cabData.current_latitude !== undefined) {
        request.input('current_latitude', sql.Float, cabData.current_latitude);
        updates.push('current_latitude = @current_latitude');
      }
      if (cabData.current_longitude !== undefined) {
        request.input('current_longitude', sql.Float, cabData.current_longitude);
        updates.push('current_longitude = @current_longitude');
      }
      if (cabData.is_active !== undefined) {
        request.input('is_active', sql.Bit, cabData.is_active);
        updates.push('is_active = @is_active');
      }
      
      updates.push('updated_at = GETDATE()');
      
      const result = await request.query(`
        UPDATE cabs 
        SET ${updates.join(', ')}
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
      
      logger.info(`Cab updated: ${id}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error updating cab:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const pool = getPool();
      
      const result = await pool.request()
        .input('id', sql.NVarChar(255), id)
        .query(`
          UPDATE cabs 
          SET is_active = 0, updated_at = GETDATE()
          OUTPUT INSERTED.id
          WHERE id = @id
        `);
      
      if (result.recordset.length === 0) {
        throw new Error('Cab not found');
      }
      
      logger.info(`Cab deactivated: ${id}`);
      return { success: true, id };
    } catch (error) {
      logger.error('Error deleting cab:', error);
      throw error;
    }
  }

  static async updateLocation(cabId, latitude, longitude) {
    try {
      const pool = getPool();
      
      // Update cab's current location
      await pool.request()
        .input('id', sql.NVarChar(255), cabId)
        .input('latitude', sql.Float, latitude)
        .input('longitude', sql.Float, longitude)
        .query(`
          UPDATE cabs 
          SET current_latitude = @latitude, 
              current_longitude = @longitude,
              last_location_update = GETDATE(),
              updated_at = GETDATE()
          WHERE id = @id
        `);
      
      // Also insert into tracking history
      const trackingId = uuidv4().toUpperCase();
      await pool.request()
        .input('id', sql.NVarChar(255), trackingId)
        .input('cab_id', sql.NVarChar(255), cabId)
        .input('latitude', sql.Float, latitude)
        .input('longitude', sql.Float, longitude)
        .query(`
          INSERT INTO cab_tracking (id, cab_id, latitude, longitude, recorded_at)
          VALUES (@id, @cab_id, @latitude, @longitude, GETDATE())
        `);
      
      return { success: true };
    } catch (error) {
      logger.error('Error updating cab location:', error);
      throw error;
    }
  }

  static async findAvailable(routeId = null) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT c.*, u.name as driver_name, u.phone as driver_phone
          FROM cabs c
          LEFT JOIN users u ON c.driver_id = u.id
          WHERE c.is_active = 1 AND c.status = 'AVAILABLE'
          ORDER BY c.capacity DESC
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error finding available cabs:', error);
      throw error;
    }
  }

  static async getAvailableSeats(cabId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('cab_id', sql.NVarChar(255), cabId)
        .query(`
          SELECT c.capacity - COALESCE(
            (SELECT COUNT(*) FROM cab_requests cr 
             WHERE cr.cab_id = @cab_id 
             AND cr.status IN ('ASSIGNED', 'IN_PROGRESS')
             AND CAST(cr.pickup_time AS DATE) = CAST(GETDATE() AS DATE)
            ), 0
          ) as available_seats
          FROM cabs c
          WHERE c.id = @cab_id
        `);
      return result.recordset[0]?.available_seats || 0;
    } catch (error) {
      logger.error('Error getting available seats:', error);
      throw error;
    }
  }

  static async getLocationHistory(cabId, startDate, endDate) {
    try {
      const pool = getPool();
      const request = pool.request()
        .input('cab_id', sql.NVarChar(255), cabId);
      
      let dateFilter = '';
      if (startDate && endDate) {
        request.input('start_date', sql.DateTime, startDate);
        request.input('end_date', sql.DateTime, endDate);
        dateFilter = 'AND recorded_at BETWEEN @start_date AND @end_date';
      }
      
      const result = await request.query(`
        SELECT TOP 1000 latitude, longitude, speed, heading, recorded_at
        FROM cab_tracking
        WHERE cab_id = @cab_id ${dateFilter}
        ORDER BY recorded_at DESC
      `);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting location history:', error);
      throw error;
    }
  }
}

module.exports = Cab;