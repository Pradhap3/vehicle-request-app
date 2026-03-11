const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class SecurityGateLog {
  static async create(data) {
    try {
      const result = await getPool().request()
        .input('cab_id', sql.Int, data.cab_id || null)
        .input('trip_id', sql.Int, data.trip_id || null)
        .input('plate_number', sql.NVarChar(50), data.plate_number || null)
        .input('gate_code', sql.NVarChar(50), data.gate_code)
        .input('event_type', sql.NVarChar(20), data.event_type || 'ENTRY')
        .input('decision', sql.NVarChar(20), data.decision || 'MANUAL_REVIEW')
        .input('reason', sql.NVarChar(500), data.reason || null)
        .input('scanned_by_user_id', sql.Int, data.scanned_by_user_id || null)
        .query(`
          INSERT INTO security_gate_logs (
            cab_id, trip_id, plate_number, gate_code, event_type, decision, reason, scanned_by_user_id, scanned_at, created_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @cab_id, @trip_id, @plate_number, @gate_code, @event_type, @decision, @reason, @scanned_by_user_id, GETDATE(), GETDATE()
          )
        `);
      return result.recordset[0] || null;
    } catch (error) {
      logger.error('Error creating security gate log:', error);
      throw error;
    }
  }

  static async findRecent(limit = 100) {
    const result = await getPool().request()
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) sgl.*, c.cab_number
        FROM security_gate_logs sgl
        LEFT JOIN cabs c ON c.id = sgl.cab_id
        ORDER BY sgl.scanned_at DESC
      `);
    return result.recordset || [];
  }
}

module.exports = SecurityGateLog;
