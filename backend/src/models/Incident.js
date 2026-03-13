const { sql, getPool } = require('../config/database');

class Incident {
  static generateRef() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `INC${ts}${rand}`.slice(0, 12);
  }

  static async findAll(filters = {}, limit = 20, offset = 0) {
    const pool = getPool();
    const request = pool.request();
    let where = 'WHERE i.is_active = 1';

    if (filters.status) { where += ' AND i.status = @status'; request.input('status', sql.NVarChar(50), filters.status); }
    if (filters.severity) { where += ' AND i.severity = @severity'; request.input('severity', sql.NVarChar(20), filters.severity); }
    if (filters.incident_type) { where += ' AND i.incident_type = @type'; request.input('type', sql.NVarChar(50), filters.incident_type); }
    if (filters.reported_by) { where += ' AND i.reported_by = @reportedBy'; request.input('reportedBy', sql.Int, filters.reported_by); }

    request.input('limit', sql.Int, limit).input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT i.*, u.name AS reporter_name, ru.name AS resolver_name
      FROM incidents i
      LEFT JOIN users u ON u.id = i.reported_by
      LEFT JOIN users ru ON ru.id = i.resolved_by
      ${where}
      ORDER BY
        CASE i.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
        i.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    return result.recordset;
  }

  static async findById(id) {
    const pool = getPool();
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT i.*, u.name AS reporter_name, ru.name AS resolver_name
      FROM incidents i
      LEFT JOIN users u ON u.id = i.reported_by
      LEFT JOIN users ru ON ru.id = i.resolved_by
      WHERE i.id = @id
    `);
    return result.recordset[0] || null;
  }

  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('ref', sql.NVarChar(20), this.generateRef())
      .input('tripId', sql.Int, data.trip_id || null)
      .input('bookingId', sql.Int, data.booking_id || null)
      .input('reportedBy', sql.Int, data.reported_by)
      .input('incidentType', sql.NVarChar(50), data.incident_type)
      .input('severity', sql.NVarChar(20), data.severity || 'MEDIUM')
      .input('title', sql.NVarChar(255), data.title)
      .input('description', sql.NVarChar(sql.MAX), data.description || null)
      .input('lat', sql.Float, data.latitude || null)
      .input('lng', sql.Float, data.longitude || null)
      .query(`
        INSERT INTO incidents (incident_ref, trip_id, booking_id, reported_by, incident_type, severity, title, description, latitude, longitude)
        OUTPUT INSERTED.* VALUES (@ref, @tripId, @bookingId, @reportedBy, @incidentType, @severity, @title, @description, @lat, @lng)
      `);
    return result.recordset[0];
  }

  static async updateStatus(id, status, userId, resolution) {
    const pool = getPool();
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar(50), status);

    let extra = '';
    if (status === 'RESOLVED' || status === 'CLOSED') {
      request.input('resolvedBy', sql.Int, userId);
      request.input('resolution', sql.NVarChar(sql.MAX), resolution || null);
      extra = ', resolved_by = @resolvedBy, resolved_at = GETDATE(), resolution = @resolution';
    }
    if (status === 'ACKNOWLEDGED') {
      request.input('escalatedTo', sql.Int, userId);
      extra = ', escalated_to = @escalatedTo, escalated_at = GETDATE()';
    }

    const result = await request.query(`
      UPDATE incidents SET status = @status, updated_at = GETDATE() ${extra}
      OUTPUT INSERTED.* WHERE id = @id
    `);
    return result.recordset[0] || null;
  }
}

module.exports = Incident;
