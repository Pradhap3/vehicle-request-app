// src/models/User.js
const { sql, getPool } = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper to determine SQL type for ID across DB variants (INT or UNIQUEIDENTIFIER)
const getIdInput = (request, paramName, id) => {
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

class User {
  static usersSchemaCache = null;

  static getUserSelectList(schema, { includePassword = false, includeTimestamps = false } = {}) {
    const columns = [
      'id',
      'employee_id',
      'name',
      'email',
      'phone',
      'department',
      'role'
    ];

    if (schema?.hasColumn('preferred_language')) columns.push('preferred_language');
    if (includePassword) columns.push('password_hash');
    if (schema?.hasColumn('auth_provider')) columns.push('auth_provider');
    if (schema?.hasColumn('external_subject')) columns.push('external_subject');
    columns.push('is_active');
    if (schema?.hasColumn('last_login')) columns.push('last_login');
    if (includeTimestamps) {
      columns.push('created_at');
      columns.push('updated_at');
    }

    return columns.join(', ');
  }

  static async getUsersSchema() {
    if (this.usersSchemaCache) return this.usersSchemaCache;

    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        c.name AS column_name,
        CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
      FROM sys.columns c
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('users')
    `);

    const columns = new Set(result.recordset.map((row) => String(row.column_name).toLowerCase()));
    const hasColumn = (name) => columns.has(name);
    const idMeta = result.recordset.find((row) => String(row.column_name).toLowerCase() === 'id');
    this.usersSchemaCache = {
      hasColumn,
      idIsIdentity: Boolean(idMeta && idMeta.is_identity === 1)
    };

    return this.usersSchemaCache;
  }

  static async findAll() {
    try {
      const pool = getPool();
      const schema = await this.getUsersSchema();
      const result = await pool.request()
        .query(`
          SELECT ${this.getUserSelectList(schema, { includeTimestamps: true })}
          FROM users 
          WHERE is_active = 1
          ORDER BY created_at DESC
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching users:', error);
      // Return empty array instead of throwing
      return [];
    }
  }

  static async findById(id) {
    try {
      const pool = getPool();
      const schema = await this.getUsersSchema();
      const request = pool.request();
      getIdInput(request, 'id', id);
      
      const result = await request.query(`
          SELECT ${this.getUserSelectList(schema, { includeTimestamps: true })}
          FROM users 
          WHERE id = @id
        `);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const pool = getPool();
      const schema = await this.getUsersSchema();
      const result = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`
          SELECT ${this.getUserSelectList(schema, { includePassword: true })}
          FROM users 
          WHERE email = @email
        `);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  static async findByEmployeeId(employeeId) {
    try {
      const pool = getPool();
      const schema = await this.getUsersSchema();
      const result = await pool.request()
        .input('employeeId', sql.NVarChar(50), employeeId)
        .query(`
          SELECT ${this.getUserSelectList(schema)}
          FROM users 
          WHERE employee_id = @employeeId
        `);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error finding user by employee ID:', error);
      throw error;
    }
  }

  static async create(userData) {
    try {
      const pool = getPool();
      const schema = await this.getUsersSchema();
      const passwordSeed = userData.password || uuidv4();
      const hashedPassword = await bcrypt.hash(passwordSeed, 12);
      const newId = uuidv4().toUpperCase();
      const request = pool.request()
        .input('employee_id', sql.NVarChar(50), userData.employee_id)
        .input('name', sql.NVarChar(255), userData.name)
        .input('email', sql.NVarChar(255), userData.email)
        .input('phone', sql.NVarChar(20), userData.phone || null)
        .input('department', sql.NVarChar(100), userData.department)
        .input('role', sql.NVarChar(50), userData.role || 'EMPLOYEE')
        .input('password_hash', sql.NVarChar(255), hashedPassword)
        .input('is_active', sql.Bit, 1);

      const columns = ['employee_id', 'name', 'email', 'phone', 'department', 'role', 'password_hash', 'is_active', 'created_at', 'updated_at'];
      const values = ['@employee_id', '@name', '@email', '@phone', '@department', '@role', '@password_hash', '@is_active', 'GETDATE()', 'GETDATE()'];

      if (schema.hasColumn('auth_provider')) {
        request.input('auth_provider', sql.NVarChar(50), userData.auth_provider || 'LOCAL');
        columns.push('auth_provider');
        values.push('@auth_provider');
      }
      if (schema.hasColumn('external_subject') && userData.external_subject !== undefined) {
        request.input('external_subject', sql.NVarChar(255), userData.external_subject || null);
        columns.push('external_subject');
        values.push('@external_subject');
      }

      if (!schema.idIsIdentity) {
        request.input('id', sql.NVarChar(255), newId);
        columns.unshift('id');
        values.unshift('@id');
      }

      const result = await request.query(`
          INSERT INTO users (${columns.join(', ')})
          OUTPUT INSERTED.id, INSERTED.employee_id, INSERTED.name, INSERTED.email, INSERTED.department, INSERTED.role, INSERTED.is_active
          VALUES (${values.join(', ')})
        `);
      
      logger.info(`User created: ${userData.email}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  static async update(id, userData) {
    try {
      const pool = getPool();
      const schema = await this.getUsersSchema();
      const request = pool.request();
      getIdInput(request, 'id', id);
      
      const updates = [];
      
      if (userData.name) {
        request.input('name', sql.NVarChar(255), userData.name);
        updates.push('name = @name');
      }
      if (userData.email) {
        request.input('email', sql.NVarChar(255), userData.email);
        updates.push('email = @email');
      }
      if (userData.phone !== undefined) {
        request.input('phone', sql.NVarChar(20), userData.phone);
        updates.push('phone = @phone');
      }
      if (userData.department) {
        request.input('department', sql.NVarChar(100), userData.department);
        updates.push('department = @department');
      }
      if (userData.role) {
        request.input('role', sql.NVarChar(50), userData.role);
        updates.push('role = @role');
      }
      if (userData.password) {
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        request.input('password_hash', sql.NVarChar(255), hashedPassword);
        updates.push('password_hash = @password_hash');
      }
      if (userData.preferred_language) {
        request.input('preferred_language', sql.NVarChar(10), userData.preferred_language);
        updates.push('preferred_language = @preferred_language');
      }
      if (userData.is_active !== undefined) {
        request.input('is_active', sql.Bit, userData.is_active);
        updates.push('is_active = @is_active');
      }
      if (schema.hasColumn('auth_provider') && userData.auth_provider !== undefined) {
        request.input('auth_provider', sql.NVarChar(50), userData.auth_provider);
        updates.push('auth_provider = @auth_provider');
      }
      if (schema.hasColumn('external_subject') && userData.external_subject !== undefined) {
        request.input('external_subject', sql.NVarChar(255), userData.external_subject);
        updates.push('external_subject = @external_subject');
      }
      
      updates.push('updated_at = GETDATE()');

      const outputColumns = [
        'INSERTED.id',
        'INSERTED.employee_id',
        'INSERTED.name',
        'INSERTED.email',
        'INSERTED.department',
        'INSERTED.role'
      ];
      if (schema.hasColumn('auth_provider')) outputColumns.push('INSERTED.auth_provider');
      if (schema.hasColumn('external_subject')) outputColumns.push('INSERTED.external_subject');
      outputColumns.push('INSERTED.is_active', 'INSERTED.updated_at');
      
      const result = await request.query(`
        UPDATE users 
        SET ${updates.join(', ')}
        OUTPUT ${outputColumns.join(', ')}
        WHERE id = @id
      `);
      
      logger.info(`User updated: ${id}`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      getIdInput(request, 'id', id);
      
      const result = await request.query(`
          UPDATE users 
          SET is_active = 0, updated_at = GETDATE()
          OUTPUT INSERTED.id
          WHERE id = @id
        `);
      
      if (result.recordset.length === 0) {
        throw new Error('User not found');
      }
      
      logger.info(`User deactivated: ${id}`);
      return { success: true, id };
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  static async hardDelete(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      getIdInput(request, 'id', id);
      
      const result = await request.query('DELETE FROM users WHERE id = @id');
      
      if (result.rowsAffected[0] === 0) {
        throw new Error('User not found');
      }
      
      logger.info(`User permanently deleted: ${id}`);
      return { success: true, id };
    } catch (error) {
      logger.error('Error hard deleting user:', error);
      throw error;
    }
  }

  static async updateLastLogin(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      getIdInput(request, 'id', id);
      await request.query('UPDATE users SET last_login = GETDATE() WHERE id = @id');
    } catch (error) {
      logger.error('Error updating last login:', error);
    }
  }

  static async findByExternalIdentity(authProvider, externalSubject) {
    try {
      const schema = await this.getUsersSchema();
      if (!schema.hasColumn('auth_provider') || !schema.hasColumn('external_subject')) {
        return null;
      }

      const pool = getPool();
      const result = await pool.request()
        .input('auth_provider', sql.NVarChar(50), authProvider)
        .input('external_subject', sql.NVarChar(255), externalSubject)
        .query(`
          SELECT ${this.getUserSelectList(schema, { includePassword: true })}
          FROM users
          WHERE auth_provider = @auth_provider AND external_subject = @external_subject
        `);
      return result.recordset[0] || null;
    } catch (error) {
      logger.error('Error finding user by external identity:', error);
      throw error;
    }
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async findDrivers() {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT u.id, u.employee_id, u.name, u.email, u.phone, 
                 c.id as cab_id, c.cab_number
          FROM users u
          LEFT JOIN cabs c ON c.driver_id = u.id AND c.is_active = 1
          WHERE u.role IN ('CAB_DRIVER', 'DRIVER') AND u.is_active = 1
          ORDER BY u.name
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error finding drivers:', error);
      throw error;
    }
  }

  static async findEmployees() {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT id, employee_id, name, email, phone, department
          FROM users 
          WHERE role IN ('EMPLOYEE', 'USER') AND is_active = 1
          ORDER BY name
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error finding employees:', error);
      throw error;
    }
  }
}

module.exports = User;
