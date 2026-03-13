const { sql, getPool } = require('../config/database');

class TripEvent {
  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('tripId', sql.Int, data.trip_id)
      .input('eventType', sql.NVarChar(50), data.event_type)
      .input('fromStatus', sql.NVarChar(50), data.from_status || null)
      .input('toStatus', sql.NVarChar(50), data.to_status || null)
      .input('lat', sql.Float, data.latitude || null)
      .input('lng', sql.Float, data.longitude || null)
      .input('metadata', sql.NVarChar(sql.MAX), data.metadata ? JSON.stringify(data.metadata) : null)
      .input('performedBy', sql.Int, data.performed_by || null)
      .query(`
        INSERT INTO trip_events (trip_id, event_type, from_status, to_status, latitude, longitude, metadata, performed_by)
        OUTPUT INSERTED.* VALUES (@tripId, @eventType, @fromStatus, @toStatus, @lat, @lng, @metadata, @performedBy)
      `);
    return result.recordset[0];
  }

  static async findByTripId(tripId) {
    const pool = getPool();
    const result = await pool.request().input('tripId', sql.Int, tripId).query(`
      SELECT te.*, u.name AS performed_by_name
      FROM trip_events te
      LEFT JOIN users u ON u.id = te.performed_by
      WHERE te.trip_id = @tripId ORDER BY te.created_at ASC
    `);
    return result.recordset;
  }
}

module.exports = TripEvent;
