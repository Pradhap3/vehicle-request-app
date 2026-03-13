const { sql, getPool } = require('../config/database');

class LiveLocation {
  static async record(data) {
    const pool = getPool();
    await pool.request()
      .input('driverId', sql.Int, data.driver_id)
      .input('tripId', sql.Int, data.trip_id || null)
      .input('lat', sql.Float, data.latitude)
      .input('lng', sql.Float, data.longitude)
      .input('speed', sql.Float, data.speed || null)
      .input('heading', sql.Float, data.heading || null)
      .input('accuracy', sql.Float, data.accuracy || null)
      .input('altitude', sql.Float, data.altitude || null)
      .query(`
        INSERT INTO live_locations (driver_id, trip_id, latitude, longitude, speed, heading, accuracy, altitude)
        VALUES (@driverId, @tripId, @lat, @lng, @speed, @heading, @accuracy, @altitude)
      `);
    return true;
  }

  static async getLatest(driverId) {
    const pool = getPool();
    const result = await pool.request().input('driverId', sql.Int, driverId).query(`
      SELECT TOP 1 * FROM live_locations
      WHERE driver_id = @driverId ORDER BY recorded_at DESC
    `);
    return result.recordset[0] || null;
  }

  static async getTripTrail(tripId) {
    const pool = getPool();
    const result = await pool.request().input('tripId', sql.Int, tripId).query(`
      SELECT latitude, longitude, speed, heading, recorded_at
      FROM live_locations WHERE trip_id = @tripId ORDER BY recorded_at ASC
    `);
    return result.recordset;
  }

  static async getDriverHistory(driverId, hours = 8) {
    const pool = getPool();
    const result = await pool.request()
      .input('driverId', sql.Int, driverId)
      .input('hours', sql.Int, hours)
      .query(`
        SELECT latitude, longitude, speed, recorded_at
        FROM live_locations
        WHERE driver_id = @driverId AND recorded_at >= DATEADD(HOUR, -@hours, GETDATE())
        ORDER BY recorded_at ASC
      `);
    return result.recordset;
  }

  static async getAllDriverLocations() {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT d.id AS driver_id, u.name AS driver_name,
             d.current_latitude AS latitude, d.current_longitude AS longitude,
             d.availability_status, d.last_location_update,
             v.vehicle_number, v.vehicle_type
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN vehicles v ON v.id = d.vehicle_id
      WHERE d.is_active = 1 AND d.current_latitude IS NOT NULL
    `);
    return result.recordset;
  }

  static async cleanup(daysToKeep = 7) {
    const pool = getPool();
    const result = await pool.request().input('days', sql.Int, daysToKeep).query(`
      DELETE FROM live_locations WHERE recorded_at < DATEADD(DAY, -@days, GETDATE())
      SELECT @@ROWCOUNT AS deleted
    `);
    return result.recordset[0]?.deleted || 0;
  }
}

module.exports = LiveLocation;
