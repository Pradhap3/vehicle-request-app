// src/models/User.js
const { sql, getPool } = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Helper to determine SQL type for ID
const getIdInput = (request, paramName, id) => {
  request.input(paramName, sql.NVarChar(255), id);
};

class User {
  static async findAll() {
    try {
      const pool = getPool();
      const result = await pool.request()
        .query(`
          SELECT id, employee_id, name, email, phone, department, role, 
                 is_active, created_at, updated_at
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
      const request = pool.request();
      getIdInput(request, 'id', id);
      
      const result = await request.query(`
          SELECT id, employee_id, name, email, phone, department, role, 
                 is_active, created_at, updated_at
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
      const result = await pool.request()
        .input('email', sql.NVarChar(255), email)
        .query(`
          SELECT id, employee_id, name, email, phone, department, role, 
                 password_hash, is_active
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
      const result = await pool.request()
        .input('employeeId', sql.NVarChar(50), employeeId)
        .query(`
          SELECT id, employee_id, name, email, phone, department, role, is_active
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
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const newId = uuidv4().toUpperCase();
      
      const result = await pool.request()
        .input('id', sql.NVarChar(255), newId)
        .input('employee_id', sql.NVarChar(50), userData.employee_id)
        .input('name', sql.NVarChar(255), userData.name)
        .input('email', sql.NVarChar(255), userData.email)
        .input('phone', sql.NVarChar(20), userData.phone || null)
        .input('department', sql.NVarChar(100), userData.department)
        .input('role', sql.NVarChar(50), userData.role || 'EMPLOYEE')
        .input('password_hash', sql.NVarChar(255), hashedPassword)
        .input('is_active', sql.Bit, 1)
        .query(`
          INSERT INTO users (id, employee_id, name, email, phone, department, role, password_hash, is_active, created_at, updated_at)
          OUTPUT INSERTED.id, INSERTED.employee_id, INSERTED.name, INSERTED.email, INSERTED.department, INSERTED.role, INSERTED.is_active
          VALUES (@id, @employee_id, @name, @email, @phone, @department, @role, @password_hash, @is_active, GETDATE(), GETDATE())
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
      
      updates.push('updated_at = GETDATE()');
      
      const result = await request.query(`
        UPDATE users 
        SET ${updates.join(', ')}
        OUTPUT INSERTED.id, INSERTED.employee_id, INSERTED.name, INSERTED.email, 
               INSERTED.department, INSERTED.role, INSERTED.is_active, INSERTED.updated_at
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