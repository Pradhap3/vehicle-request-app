const { sql, getPool } = require('../config/database');

class Rating {
  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('tripId', sql.Int, data.trip_id)
      .input('bookingId', sql.Int, data.booking_id || null)
      .input('ratedBy', sql.Int, data.rated_by)
      .input('driverId', sql.Int, data.driver_id || null)
      .input('rating', sql.Int, data.rating)
      .input('feedback', sql.NVarChar(1000), data.feedback || null)
      .input('categories', sql.NVarChar(sql.MAX), data.categories ? JSON.stringify(data.categories) : null)
      .query(`
        INSERT INTO ratings (trip_id, booking_id, rated_by, driver_id, rating, feedback, categories)
        OUTPUT INSERTED.* VALUES (@tripId, @bookingId, @ratedBy, @driverId, @rating, @feedback, @categories)
      `);

    // Update driver average rating
    if (data.driver_id) {
      await pool.request().input('driverId', sql.Int, data.driver_id).query(`
        UPDATE drivers SET
          rating_average = (SELECT AVG(CAST(rating AS DECIMAL(3,2))) FROM ratings WHERE driver_id = @driverId AND is_active = 1),
          total_trips = (SELECT COUNT(*) FROM ratings WHERE driver_id = @driverId AND is_active = 1)
        WHERE id = @driverId
      `);
    }

    return result.recordset[0];
  }

  static async findByTripId(tripId) {
    const pool = getPool();
    const result = await pool.request().input('tripId', sql.Int, tripId).query(`
      SELECT r.*, u.name AS rater_name FROM ratings r
      LEFT JOIN users u ON u.id = r.rated_by
      WHERE r.trip_id = @tripId AND r.is_active = 1
    `);
    return result.recordset;
  }

  static async findByDriverId(driverId, limit = 20) {
    const pool = getPool();
    const result = await pool.request()
      .input('driverId', sql.Int, driverId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) r.*, u.name AS rater_name FROM ratings r
        LEFT JOIN users u ON u.id = r.rated_by
        WHERE r.driver_id = @driverId AND r.is_active = 1
        ORDER BY r.created_at DESC
      `);
    return result.recordset;
  }

  static async getDriverStats(driverId) {
    const pool = getPool();
    const result = await pool.request().input('driverId', sql.Int, driverId).query(`
      SELECT
        COUNT(*) AS total_ratings,
        AVG(CAST(rating AS DECIMAL(3,2))) AS average_rating,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS positive_ratings,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS negative_ratings
      FROM ratings WHERE driver_id = @driverId AND is_active = 1
    `);
    return result.recordset[0];
  }

  static async getAll(filters = {}, limit = 20, offset = 0) {
    const pool = getPool();
    const request = pool.request().input('limit', sql.Int, limit).input('offset', sql.Int, offset);
    let where = 'WHERE r.is_active = 1';
    if (filters.driver_id) { where += ' AND r.driver_id = @driverId'; request.input('driverId', sql.Int, filters.driver_id); }
    if (filters.min_rating) { where += ' AND r.rating >= @minRating'; request.input('minRating', sql.Int, filters.min_rating); }

    const result = await request.query(`
      SELECT r.*, u.name AS rater_name, du.name AS driver_name
      FROM ratings r
      LEFT JOIN users u ON u.id = r.rated_by
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN users du ON du.id = d.user_id
      ${where}
      ORDER BY r.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    return result.recordset;
  }
}

module.exports = Rating;
