const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class AuditService {
  static async log(data) {
    try {
      const pool = getPool();
      await pool.request()
        .input('userId', sql.Int, data.user_id || null)
        .input('action', sql.NVarChar(100), data.action)
        .input('entityType', sql.NVarChar(50), data.entity_type)
        .input('entityId', sql.NVarChar(50), data.entity_id ? String(data.entity_id) : null)
        .input('oldValues', sql.NVarChar(sql.MAX), data.old_values ? JSON.stringify(data.old_values) : null)
        .input('newValues', sql.NVarChar(sql.MAX), data.new_values ? JSON.stringify(data.new_values) : null)
        .input('ipAddress', sql.NVarChar(45), data.ip_address || null)
        .input('userAgent', sql.NVarChar(500), data.user_agent || null)
        .query(`
          INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
          VALUES (@userId, @action, @entityType, @entityId, @oldValues, @newValues, @ipAddress, @userAgent)
        `);
    } catch (error) {
      logger.error('Failed to write audit log:', error);
    }
  }

  static async findAll(filters = {}, limit = 50, offset = 0) {
    const pool = getPool();
    const request = pool.request().input('limit', sql.Int, limit).input('offset', sql.Int, offset);
    let where = 'WHERE 1=1';

    if (filters.user_id) { where += ' AND al.user_id = @userId'; request.input('userId', sql.Int, filters.user_id); }
    if (filters.entity_type) { where += ' AND al.entity_type = @entityType'; request.input('entityType', sql.NVarChar(50), filters.entity_type); }
    if (filters.action) { where += ' AND al.action LIKE @action'; request.input('action', sql.NVarChar(100), `%${filters.action}%`); }
    if (filters.from_date) { where += ' AND al.created_at >= @fromDate'; request.input('fromDate', sql.DateTime, new Date(filters.from_date)); }
    if (filters.to_date) { where += ' AND al.created_at <= @toDate'; request.input('toDate', sql.DateTime, new Date(filters.to_date)); }

    const result = await request.query(`
      SELECT al.*, u.name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ${where}
      ORDER BY al.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    return result.recordset;
  }
}

module.exports = AuditService;
