const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class Trip {
  static async create(data) {
    try {
      const result = await getPool().request()
        .input('request_id', sql.Int, data.request_id || null)
        .input('route_id', sql.Int, data.route_id || null)
        .input('cab_id', sql.Int, data.cab_id || null)
        .input('driver_id', sql.Int, data.driver_id || null)
        .input('trip_date', sql.Date, data.trip_date)
        .input('trip_direction', sql.NVarChar(30), data.trip_direction || 'INBOUND')
        .input('trip_category', sql.NVarChar(40), data.trip_category || 'DAILY')
        .input('shift_code', sql.NVarChar(40), data.shift_code || null)
        .input('planned_start_time', sql.DateTime, data.planned_start_time || null)
        .input('planned_end_time', sql.DateTime, data.planned_end_time || null)
        .input('status', sql.NVarChar(40), data.status || 'PLANNED')
        .input('planned_distance_km', sql.Float, data.planned_distance_km || null)
        .input('planned_duration_minutes', sql.Int, data.planned_duration_minutes || null)
        .input('optimization_score', sql.Float, data.optimization_score || null)
        .query(`
          INSERT INTO trips (
            request_id, route_id, cab_id, driver_id, trip_date, trip_direction, trip_category, shift_code,
            planned_start_time, planned_end_time, status, planned_distance_km, planned_duration_minutes,
            optimization_score, created_at, updated_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @request_id, @route_id, @cab_id, @driver_id, @trip_date, @trip_direction, @trip_category, @shift_code,
            @planned_start_time, @planned_end_time, @status, @planned_distance_km, @planned_duration_minutes,
            @optimization_score, GETDATE(), GETDATE()
          )
        `);
      return result.recordset[0] || null;
    } catch (error) {
      logger.error('Error creating trip:', error);
      throw error;
    }
  }

  static async upsertForRequest(data) {
    try {
      if (!data.request_id) return this.create(data);
      const existing = await getPool().request()
        .input('request_id', sql.Int, data.request_id)
        .query('SELECT TOP 1 * FROM trips WHERE request_id = @request_id ORDER BY id DESC');
      if (!existing.recordset[0]) {
        return this.create(data);
      }
      const result = await getPool().request()
        .input('id', sql.Int, existing.recordset[0].id)
        .input('route_id', sql.Int, data.route_id || null)
        .input('cab_id', sql.Int, data.cab_id || null)
        .input('driver_id', sql.Int, data.driver_id || null)
        .input('trip_date', sql.Date, data.trip_date)
        .input('trip_direction', sql.NVarChar(30), data.trip_direction || existing.recordset[0].trip_direction || 'INBOUND')
        .input('trip_category', sql.NVarChar(40), data.trip_category || existing.recordset[0].trip_category || 'DAILY')
        .input('shift_code', sql.NVarChar(40), data.shift_code || null)
        .input('planned_start_time', sql.DateTime, data.planned_start_time || null)
        .input('planned_end_time', sql.DateTime, data.planned_end_time || null)
        .input('status', sql.NVarChar(40), data.status || existing.recordset[0].status || 'PLANNED')
        .input('planned_distance_km', sql.Float, data.planned_distance_km || null)
        .input('planned_duration_minutes', sql.Int, data.planned_duration_minutes || null)
        .input('optimization_score', sql.Float, data.optimization_score || null)
        .query(`
          UPDATE trips
          SET route_id = @route_id,
              cab_id = @cab_id,
              driver_id = @driver_id,
              trip_date = @trip_date,
              trip_direction = @trip_direction,
              trip_category = @trip_category,
              shift_code = @shift_code,
              planned_start_time = @planned_start_time,
              planned_end_time = @planned_end_time,
              status = @status,
              planned_distance_km = @planned_distance_km,
              planned_duration_minutes = @planned_duration_minutes,
              optimization_score = @optimization_score,
              updated_at = GETDATE()
          OUTPUT INSERTED.*
          WHERE id = @id
        `);
      return result.recordset[0] || null;
    } catch (error) {
      logger.error('Error upserting trip:', error);
      throw error;
    }
  }

  static async syncPassengers(tripId, requests = []) {
    try {
      await getPool().request().input('trip_id', sql.Int, tripId).query('DELETE FROM trip_passengers WHERE trip_id = @trip_id');
      for (const [index, request] of requests.entries()) {
        await getPool().request()
          .input('trip_id', sql.Int, tripId)
          .input('request_id', sql.Int, request.id || null)
          .input('employee_id', sql.Int, request.employee_id)
          .input('stop_sequence', sql.Int, index + 1)
          .input('pickup_location', sql.NVarChar(500), request.pickup_location || null)
          .input('drop_location', sql.NVarChar(500), request.drop_location || null)
          .input('status', sql.NVarChar(40), request.status || 'ASSIGNED')
          .query(`
            INSERT INTO trip_passengers (
              trip_id, request_id, employee_id, stop_sequence, pickup_location, drop_location, status, created_at, updated_at
            )
            VALUES (
              @trip_id, @request_id, @employee_id, @stop_sequence, @pickup_location, @drop_location, @status, GETDATE(), GETDATE()
            )
          `);
      }
    } catch (error) {
      logger.error('Error syncing trip passengers:', error);
      throw error;
    }
  }

  static async findTodayByEmployee(employeeId) {
    const result = await getPool().request()
      .input('employee_id', sql.Int, employeeId)
      .query(`
        SELECT TOP 20 t.*, c.cab_number, u.name AS driver_name
        FROM trip_passengers tp
        INNER JOIN trips t ON t.id = tp.trip_id
        LEFT JOIN cabs c ON c.id = t.cab_id
        LEFT JOIN users u ON u.id = t.driver_id
        WHERE tp.employee_id = @employee_id
          AND t.trip_date = CAST(GETDATE() AS DATE)
        ORDER BY t.planned_start_time ASC, t.id DESC
      `);
    return result.recordset || [];
  }

  static async findTodayByDriver(driverId) {
    const result = await getPool().request()
      .input('driver_id', sql.Int, driverId)
      .query(`
        SELECT *
        FROM trips
        WHERE driver_id = @driver_id
          AND trip_date = CAST(GETDATE() AS DATE)
        ORDER BY planned_start_time ASC, id DESC
      `);
    return result.recordset || [];
  }

  static async findTodayByCab(cabId) {
    const result = await getPool().request()
      .input('cab_id', sql.Int, cabId)
      .query(`
        SELECT *
        FROM trips
        WHERE cab_id = @cab_id
          AND trip_date = CAST(GETDATE() AS DATE)
        ORDER BY planned_start_time ASC, id DESC
      `);
    return result.recordset || [];
  }

  static async findManifestByTripId(tripId) {
    const result = await getPool().request()
      .input('trip_id', sql.Int, tripId)
      .query(`
        SELECT
          tp.*,
          u.name AS employee_name,
          u.phone AS employee_phone,
          bs.is_boarded,
          bs.is_dropped,
          bs.no_show,
          bs.boarded_at,
          bs.dropped_at,
          bs.no_show_reason
        FROM trip_passengers tp
        LEFT JOIN users u ON u.id = tp.employee_id
        LEFT JOIN boarding_status bs
          ON bs.request_id = tp.request_id
         AND bs.employee_id = tp.employee_id
        WHERE tp.trip_id = @trip_id
        ORDER BY tp.stop_sequence ASC, tp.id ASC
      `);
    return result.recordset || [];
  }

  static async findActiveForCab(cabId) {
    const trips = await this.findTodayByCab(cabId);
    return trips.find((row) => ['PLANNED', 'ASSIGNED', 'IN_PROGRESS'].includes(String(row.status || '').toUpperCase())) || null;
  }
}

module.exports = Trip;
