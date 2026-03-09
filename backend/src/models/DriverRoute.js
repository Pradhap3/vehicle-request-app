const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class DriverRoute {
  static checked = false;
  static available = false;

  static async ensureTable() {
    if (this.checked) return this.available;
    try {
      const pool = getPool();
      const result = await pool.request().query(`SELECT OBJECT_ID('driver_routes') AS table_id`);
      this.available = !!result.recordset[0]?.table_id;
      this.checked = true;
      return this.available;
    } catch (error) {
      logger.warn(`DriverRoute table check failed: ${error.message}`);
      this.checked = true;
      this.available = false;
      return false;
    }
  }

  static bindFlexibleId(request, paramName, id) {
    if (id === null || id === undefined) {
      request.input(paramName, sql.NVarChar(255), null);
      return;
    }
    if (typeof id === 'number' && Number.isInteger(id)) {
      request.input(paramName, sql.Int, id);
      return;
    }
    const normalized = String(id).trim();
    if (/^\d+$/.test(normalized)) {
      request.input(paramName, sql.Int, parseInt(normalized, 10));
      return;
    }
    request.input(paramName, sql.NVarChar(255), normalized);
  }

  static async setRoutesForDriver(driverId, routeIds = []) {
    try {
      const exists = await this.ensureTable();
      if (!exists) return { success: false, reason: 'table_missing' };

      const pool = getPool();
      const clearReq = pool.request();
      this.bindFlexibleId(clearReq, 'driver_id', driverId);
      await clearReq.query(`DELETE FROM driver_routes WHERE driver_id = @driver_id`);

      for (const routeId of routeIds) {
        const insReq = pool.request();
        this.bindFlexibleId(insReq, 'driver_id', driverId);
        this.bindFlexibleId(insReq, 'route_id', routeId);
        await insReq.query(`
          INSERT INTO driver_routes (driver_id, route_id, is_active, created_at, updated_at)
          VALUES (@driver_id, @route_id, 1, GETDATE(), GETDATE())
        `);
      }
      return { success: true };
    } catch (error) {
      logger.error('Error setting routes for driver:', error);
      return { success: false, error: error.message };
    }
  }

  static async getRouteIdsForDriver(driverId) {
    try {
      const exists = await this.ensureTable();
      if (!exists) return [];
      const pool = getPool();
      const req = pool.request();
      this.bindFlexibleId(req, 'driver_id', driverId);
      const result = await req.query(`
        SELECT route_id
        FROM driver_routes
        WHERE driver_id = @driver_id AND is_active = 1
      `);
      return result.recordset.map((r) => r.route_id);
    } catch (error) {
      logger.error('Error getting driver route IDs:', error);
      return [];
    }
  }
}

module.exports = DriverRoute;

