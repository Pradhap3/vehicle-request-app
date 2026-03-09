// src/models/Route.js
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bindFlexibleId = (request, paramName, id) => {
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
  if (UUID_REGEX.test(normalized)) {
    request.input(paramName, sql.UniqueIdentifier, normalized);
    return;
  }
  request.input(paramName, sql.NVarChar(255), normalized);
};

class Route {
  static routesSchemaCache = null;

  static async getRoutesSchema() {
    if (this.routesSchemaCache) return this.routesSchemaCache;

    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        c.name AS column_name,
        CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
      FROM sys.columns c
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('routes')
    `);

    const columns = new Set(result.recordset.map((row) => String(row.column_name).toLowerCase()));
    const hasColumn = (name) => columns.has(name);
    const idMeta = result.recordset.find((row) => String(row.column_name).toLowerCase() === 'id');
    this.routesSchemaCache = {
      idIsIdentity: Boolean(idMeta && idMeta.is_identity === 1),
      hasColumn
    };

    return this.routesSchemaCache;
  }

  static async findAll() {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT * FROM routes
          WHERE is_active = 1
          ORDER BY name
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching routes:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'id', id);
      const result = await request
        .query(`SELECT * FROM routes WHERE id = @id`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error finding route by ID:', error);
      throw error;
    }
  }

  static async create(routeData) {
    try {
      const pool = getPool();
      const schema = await this.getRoutesSchema();
      const newId = uuidv4().toUpperCase();
      const request = pool.request()
        .input('name', sql.NVarChar(255), routeData.name)
        .input('start_point', sql.NVarChar(500), routeData.start_point)
        .input('end_point', sql.NVarChar(500), routeData.end_point)
        .input('distance_km', sql.Float, routeData.distance_km || 0)
        .input('estimated_time_minutes', sql.Int, routeData.estimated_time_minutes || 0)
        .input('is_active', sql.Bit, routeData.is_active !== false ? 1 : 0);

      const columns = ['name', 'start_point', 'end_point', 'distance_km', 'estimated_time_minutes', 'is_active', 'created_at', 'updated_at'];
      const values = ['@name', '@start_point', '@end_point', '@distance_km', '@estimated_time_minutes', '@is_active', 'GETDATE()', 'GETDATE()'];

      if (!schema.idIsIdentity) {
        request.input('id', sql.NVarChar(255), newId);
        columns.unshift('id');
        values.unshift('@id');
      }
      if (schema.hasColumn('trip_type') && routeData.trip_type !== undefined) {
        request.input('trip_type', sql.NVarChar(40), routeData.trip_type);
        columns.push('trip_type');
        values.push('@trip_type');
      }
      if (schema.hasColumn('standard_pickup_time') && routeData.standard_pickup_time !== undefined) {
        request.input('standard_pickup_time', sql.NVarChar(20), routeData.standard_pickup_time);
        columns.push('standard_pickup_time');
        values.push('@standard_pickup_time');
      }

      const result = await request
        .query(`
          INSERT INTO routes (${columns.join(', ')})
          OUTPUT INSERTED.*
          VALUES (${values.join(', ')})
        `);
      
      logger.info(`Route created: ${routeData.name}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error creating route:', error);
      throw error;
    }
  }

  static async update(id, routeData) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'id', id);
      
      const updates = [];
      
      if (routeData.name) {
        request.input('name', sql.NVarChar(255), routeData.name);
        updates.push('name = @name');
      }
      if (routeData.start_point) {
        request.input('start_point', sql.NVarChar(500), routeData.start_point);
        updates.push('start_point = @start_point');
      }
      if (routeData.end_point) {
        request.input('end_point', sql.NVarChar(500), routeData.end_point);
        updates.push('end_point = @end_point');
      }
      if (routeData.distance_km !== undefined) {
        request.input('distance_km', sql.Float, routeData.distance_km);
        updates.push('distance_km = @distance_km');
      }
      if (routeData.estimated_time_minutes !== undefined) {
        request.input('estimated_time_minutes', sql.Int, routeData.estimated_time_minutes);
        updates.push('estimated_time_minutes = @estimated_time_minutes');
      }
      if (routeData.is_active !== undefined) {
        request.input('is_active', sql.Bit, routeData.is_active);
        updates.push('is_active = @is_active');
      }
      if (schema.hasColumn('trip_type') && routeData.trip_type !== undefined) {
        request.input('trip_type', sql.NVarChar(40), routeData.trip_type);
        updates.push('trip_type = @trip_type');
      }
      if (schema.hasColumn('standard_pickup_time') && routeData.standard_pickup_time !== undefined) {
        request.input('standard_pickup_time', sql.NVarChar(20), routeData.standard_pickup_time);
        updates.push('standard_pickup_time = @standard_pickup_time');
      }
      
      updates.push('updated_at = GETDATE()');
      
      const result = await request.query(`
        UPDATE routes 
        SET ${updates.join(', ')}
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
      
      logger.info(`Route updated: ${id}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error updating route:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      bindFlexibleId(request, 'id', id);
      const result = await request
        .query(`
          UPDATE routes 
          SET is_active = 0, updated_at = GETDATE()
          OUTPUT INSERTED.id
          WHERE id = @id
        `);
      
      if (result.recordset.length === 0) {
        throw new Error('Route not found');
      }
      
      logger.info(`Route deactivated: ${id}`);
      return { success: true, id };
    } catch (error) {
      logger.error('Error deleting route:', error);
      throw error;
    }
  }

  static async getRouteWithAssignments(id) {
    try {
      const route = await this.findById(id);
      if (!route) return null;
      return route;
    } catch (error) {
      logger.error('Error getting route with assignments:', error);
      throw error;
    }
  }

  static async getOptimalRoute(startLat, startLng, endLat, endLng) {
    const R = 6371;
    const dLat = (endLat - startLat) * Math.PI / 180;
    const dLng = (endLng - startLng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    const estimatedMinutes = Math.round((distance / 30) * 60);
    
    return {
      distance_km: Math.round(distance * 10) / 10,
      estimated_time_minutes: estimatedMinutes
    };
  }
}

module.exports = Route;
