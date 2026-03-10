const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class RouteStop {
  static async findByRouteId(routeId) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('route_id', /^\d+$/.test(String(routeId)) ? sql.Int : sql.NVarChar(255), /^\d+$/.test(String(routeId)) ? parseInt(String(routeId), 10) : routeId)
        .query(`
          SELECT *
          FROM route_stops
          WHERE route_id = @route_id AND is_active = 1
          ORDER BY stop_sequence ASC, id ASC
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching route stops:', error);
      return [];
    }
  }

  static async replaceForRoute(routeId, stops = []) {
    try {
      const pool = getPool();
      const tx = pool.transaction();
      await tx.begin();

      const deactivateReq = new sql.Request(tx);
      deactivateReq.input('route_id', /^\d+$/.test(String(routeId)) ? sql.Int : sql.NVarChar(255), /^\d+$/.test(String(routeId)) ? parseInt(String(routeId), 10) : routeId);
      await deactivateReq.query(`
        UPDATE route_stops
        SET is_active = 0, updated_at = GETDATE()
        WHERE route_id = @route_id
      `);

      for (let index = 0; index < stops.length; index += 1) {
        const stop = stops[index];
        const request = new sql.Request(tx);
        request
          .input('route_id', /^\d+$/.test(String(routeId)) ? sql.Int : sql.NVarChar(255), /^\d+$/.test(String(routeId)) ? parseInt(String(routeId), 10) : routeId)
          .input('stop_name', sql.NVarChar(255), stop.stop_name || stop.name || `Stop ${index + 1}`)
          .input('latitude', sql.Float, stop.latitude ?? null)
          .input('longitude', sql.Float, stop.longitude ?? null)
          .input('stop_sequence', sql.Int, stop.stop_sequence ?? index + 1)
          .input('eta_offset_minutes', sql.Int, stop.eta_offset_minutes ?? 0)
          .input('is_active', sql.Bit, 1);
        await request.query(`
          INSERT INTO route_stops (
            route_id, stop_name, latitude, longitude, stop_sequence, eta_offset_minutes, is_active, created_at, updated_at
          )
          VALUES (
            @route_id, @stop_name, @latitude, @longitude, @stop_sequence, @eta_offset_minutes, @is_active, GETDATE(), GETDATE()
          )
        `);
      }

      await tx.commit();
      return this.findByRouteId(routeId);
    } catch (error) {
      logger.error('Error replacing route stops:', error);
      throw error;
    }
  }
}

module.exports = RouteStop;
