const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AuditLog {
  static schemaCache = null;

  static resetSchemaCache() {
    this.schemaCache = null;
  }

  static bindFlexibleId(request, paramName, value) {
    if (value === null || value === undefined) {
      request.input(paramName, sql.NVarChar(255), null);
      return;
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
      request.input(paramName, sql.Int, value);
      return;
    }
    const normalized = String(value).trim();
    if (/^\d+$/.test(normalized)) {
      request.input(paramName, sql.Int, parseInt(normalized, 10));
      return;
    }
    if (UUID_REGEX.test(normalized)) {
      request.input(paramName, sql.UniqueIdentifier, normalized);
      return;
    }
    request.input(paramName, sql.NVarChar(255), normalized);
  }

  static async getSchema() {
    if (this.schemaCache) return this.schemaCache;
    try {
      const pool = getPool();
      const result = await pool.request().query(`
        SELECT
          c.name AS column_name,
          CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
        FROM sys.columns c
        LEFT JOIN sys.identity_columns ic
          ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE c.object_id = OBJECT_ID('dbo.audit_logs')
      `);

      const rows = result.recordset.length
        ? result.recordset
        : (
          await pool.request().query(`
            SELECT
              c.name AS column_name,
              CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
            FROM sys.columns c
            LEFT JOIN sys.identity_columns ic
              ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE c.object_id = OBJECT_ID('audit_logs')
          `)
        ).recordset;

      if (!rows.length) {
        this.schemaCache = { available: false };
        return this.schemaCache;
      }

      const columns = new Set(rows.map((r) => String(r.column_name).toLowerCase()));
      const hasColumn = (name) => columns.has(name);
      const pickColumn = (names) => names.find((n) => hasColumn(n)) || null;
      const idMeta = rows.find((r) => String(r.column_name).toLowerCase() === 'id');

      this.schemaCache = {
        available: true,
        hasColumn,
        idIsIdentity: Boolean(idMeta && idMeta.is_identity === 1),
        hasId: hasColumn('id'),
        payloadColumn: pickColumn(['changes', 'data', 'details', 'message']),
        oldValuesColumn: pickColumn(['old_values', 'before_values', 'previous_values']),
        newValuesColumn: pickColumn(['new_values', 'after_values', 'current_values']),
        createdAtColumn: pickColumn(['created_at', 'createdon', 'created_date']),
        ipColumn: pickColumn(['ip_address', 'ip']),
        userAgentColumn: pickColumn(['user_agent', 'ua'])
      };

      return this.schemaCache;
    } catch (error) {
      logger.warn(`AuditLog schema check failed: ${error.message}`);
      this.schemaCache = { available: false };
      return this.schemaCache;
    }
  }

  static isSchemaColumnError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('invalid column name') || msg.includes('unknown column');
  }

  static async create(entry = {}) {
    return this.createWithRetry(entry, true);
  }

  static async createWithRetry(entry = {}, allowRetry = false) {
    try {
      const schema = await this.getSchema();
      if (!schema.available) return null;

      const pool = getPool();
      const request = pool.request();
      const id = uuidv4().toUpperCase();
      const columns = [];
      const values = [];

      if (schema.hasColumn('id') && !schema.idIsIdentity) {
        request.input('id', sql.UniqueIdentifier, id);
        columns.push('id');
        values.push('@id');
      }

      if (schema.hasColumn('user_id')) {
        this.bindFlexibleId(request, 'user_id', entry.user_id ?? null);
        columns.push('user_id');
        values.push('@user_id');
      }
      if (schema.hasColumn('action')) {
        request.input('action', sql.VarChar(100), entry.action || 'SYSTEM_EVENT');
        columns.push('action');
        values.push('@action');
      }
      if (schema.hasColumn('entity_type')) {
        request.input('entity_type', sql.VarChar(50), entry.entity_type || 'system');
        columns.push('entity_type');
        values.push('@entity_type');
      }
      if (schema.hasColumn('entity_id')) {
        request.input('entity_id', sql.VarChar(50), entry.entity_id ? String(entry.entity_id) : null);
        columns.push('entity_id');
        values.push('@entity_id');
      }
      if (schema.payloadColumn) {
        request.input('payload', sql.NVarChar(sql.MAX), entry.changes ? JSON.stringify(entry.changes) : null);
        columns.push(schema.payloadColumn);
        values.push('@payload');
      }
      if (schema.newValuesColumn) {
        request.input('new_values', sql.NVarChar(sql.MAX), entry.changes ? JSON.stringify(entry.changes) : null);
        columns.push(schema.newValuesColumn);
        values.push('@new_values');
      }
      if (schema.oldValuesColumn) {
        request.input('old_values', sql.NVarChar(sql.MAX), entry.old_values ? JSON.stringify(entry.old_values) : null);
        columns.push(schema.oldValuesColumn);
        values.push('@old_values');
      }
      if (schema.ipColumn) {
        request.input('ip_address', sql.VarChar(50), entry.ip_address || null);
        columns.push(schema.ipColumn);
        values.push('@ip_address');
      }
      if (schema.userAgentColumn) {
        request.input('user_agent', sql.NVarChar(500), entry.user_agent || null);
        columns.push(schema.userAgentColumn);
        values.push('@user_agent');
      }
      if (schema.createdAtColumn) {
        columns.push(schema.createdAtColumn);
        values.push('GETDATE()');
      }
      if (!columns.length) return null;

      await request.query(`
        INSERT INTO audit_logs (${columns.join(', ')})
        VALUES (${values.join(', ')})
      `);
      return { id };
    } catch (error) {
      if (allowRetry && this.isSchemaColumnError(error)) {
        this.resetSchemaCache();
        return this.createWithRetry(entry, false);
      }
      logger.warn(`AuditLog create failed: ${error.message}`);
      return null;
    }
  }

  static async getRecentCallAttempt(entityId, withinMinutes = 15) {
    try {
      const schema = await this.getSchema();
      if (!schema.available) return null;
      if (!schema.hasColumn('action') || !schema.hasColumn('entity_type') || !schema.hasColumn('entity_id')) {
        return null;
      }

      const pool = getPool();
      const request = pool.request();
      request.input('entity_id', sql.VarChar(50), String(entityId));
      request.input('window_minutes', sql.Int, withinMinutes);
      const createdAtFilter = schema.createdAtColumn
        ? `AND ${schema.createdAtColumn} >= DATEADD(MINUTE, -@window_minutes, GETDATE())`
        : '';
      const orderBy = schema.createdAtColumn
        ? `${schema.createdAtColumn} DESC`
        : (schema.hasId ? 'id DESC' : '(SELECT NULL)');

      const result = await request.query(`
        SELECT TOP 1 *
        FROM audit_logs
        WHERE action = 'PASSENGER_CALL_ATTEMPT'
          AND entity_type = 'cab_request'
          AND entity_id = @entity_id
          ${createdAtFilter}
        ORDER BY ${orderBy}
      `);

      return result.recordset[0] || null;
    } catch (error) {
      logger.warn(`AuditLog getRecentCallAttempt failed: ${error.message}`);
      return null;
    }
  }
}

module.exports = AuditLog;
