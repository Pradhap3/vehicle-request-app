// src/models/BoardingStatus.js
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class BoardingStatus {
  static async findByRequestId(requestId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('request_id', sql.NVarChar(255), requestId)
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
      
      // Check if record exists
      const existing = await pool.request()
        .input('request_id', sql.NVarChar(255), data.request_id)
        .input('employee_id', sql.NVarChar(255), data.employee_id)
        .query(`
          SELECT id FROM boarding_status 
          WHERE request_id = @request_id AND employee_id = @employee_id
        `);
      
      if (existing.recordset.length > 0) {
        // Update existing record
        const result = await pool.request()
          .input('id', sql.NVarChar(255), existing.recordset[0].id)
          .input('boarding_area', sql.NVarChar(500), data.boarding_area || null)
          .input('dropping_area', sql.NVarChar(500), data.dropping_area || null)
          .input('is_boarded', sql.Bit, data.is_boarded || false)
          .input('is_dropped', sql.Bit, data.is_dropped || false)
          .query(`
            UPDATE boarding_status 
            SET boarding_area = @boarding_area,
                dropping_area = @dropping_area,
                is_boarded = @is_boarded,
                is_dropped = @is_dropped
            OUTPUT INSERTED.*
            WHERE id = @id
          `);
        return result.recordset[0];
      } else {
        // Create new record
        const newId = uuidv4().toUpperCase();
        const result = await pool.request()
          .input('id', sql.NVarChar(255), newId)
          .input('request_id', sql.NVarChar(255), data.request_id)
          .input('employee_id', sql.NVarChar(255), data.employee_id)
          .input('boarding_area', sql.NVarChar(500), data.boarding_area || null)
          .input('dropping_area', sql.NVarChar(500), data.dropping_area || null)
          .input('is_boarded', sql.Bit, false)
          .input('is_dropped', sql.Bit, false)
          .query(`
            INSERT INTO boarding_status (id, request_id, employee_id, boarding_area, dropping_area,
                                        is_boarded, is_dropped, created_at)
            OUTPUT INSERTED.*
            VALUES (@id, @request_id, @employee_id, @boarding_area, @dropping_area,
                    @is_boarded, @is_dropped, GETDATE())
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
      
      const result = await pool.request()
        .input('request_id', sql.NVarChar(255), requestId)
        .input('employee_id', sql.NVarChar(255), employeeId)
        .input('boarding_area', sql.NVarChar(500), boardingArea)
        .query(`
          UPDATE boarding_status 
          SET is_boarded = 1, 
              boarded_at = GETDATE(),
              boarding_area = @boarding_area
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
      
      const result = await pool.request()
        .input('request_id', sql.NVarChar(255), requestId)
        .input('employee_id', sql.NVarChar(255), employeeId)
        .input('dropping_area', sql.NVarChar(500), droppingArea)
        .query(`
          UPDATE boarding_status 
          SET is_dropped = 1, 
              dropped_at = GETDATE(),
              dropping_area = @dropping_area
          OUTPUT INSERTED.*
          WHERE request_id = @request_id AND employee_id = @employee_id
        `);
      
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
      
      await pool.request()
        .input('request_id', sql.NVarChar(255), requestId)
        .input('employee_id', sql.NVarChar(255), employeeId)
        .query(`
          UPDATE boarding_status 
          SET is_boarded = 0, is_dropped = 0
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
      return [];
    } catch (error) {
      logger.error('Error fetching no-shows for route:', error);
      return [];
    }
  }

  static async getWaitingPassengers(routeId, date) {
    try {
      return [];
    } catch (error) {
      logger.error('Error fetching waiting passengers:', error);
      return [];
    }
  }
}

module.exports = BoardingStatus;