// src/models/Notification.js
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class Notification {
  static schemaCache = null;

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

  static async getSchema() {
    if (this.schemaCache) return this.schemaCache;

    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        c.name AS column_name,
        CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END AS is_identity
      FROM sys.columns c
      LEFT JOIN sys.identity_columns ic
        ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE c.object_id = OBJECT_ID('notifications')
    `);

    const columns = new Set(result.recordset.map((row) => String(row.column_name).toLowerCase()));
    const hasColumn = (name) => columns.has(name);
    const pickColumn = (names) => names.find((name) => hasColumn(name)) || null;
    const idMeta = result.recordset.find((row) => String(row.column_name).toLowerCase() === 'id');

    this.schemaCache = {
      hasColumn,
      idIsIdentity: Boolean(idMeta && idMeta.is_identity === 1),
      userColumn: pickColumn(['user_id', 'recipient_id']),
      messageColumn: pickColumn(['message', 'body'])
    };

    return this.schemaCache;
  }

  static async findById(id) {
    try {
      const pool = getPool();
      const request = pool.request();
      this.bindFlexibleId(request, 'id', id);
      const result = await request
        .query(`SELECT * FROM notifications WHERE id = @id`);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error fetching notification by id:', error);
      return null;
    }
  }

  static async findByUserId(userId, limit = 50) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      if (!schema.userColumn) return [];

      const request = pool.request();
      this.bindFlexibleId(request, 'user_id', userId);
      const result = await request
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit) *
          FROM notifications
          WHERE ${schema.userColumn} = @user_id
          ORDER BY created_at DESC
        `);
      return result.recordset;
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      return [];
    }
  }

  static async create(notificationData) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      if (!schema.userColumn) return null;
      const newId = uuidv4().toUpperCase();
      const request = pool.request()
        .input('type', sql.NVarChar(50), notificationData.type || 'GENERAL')
        .input('title', sql.NVarChar(255), notificationData.title || 'Notification')
        .input('msg', sql.NVarChar(sql.MAX), notificationData.message || notificationData.body || '')
        .input('is_read', sql.Bit, false);

      this.bindFlexibleId(request, 'user_id', notificationData.user_id ?? notificationData.recipient_id ?? null);

      const columns = [schema.userColumn, 'type', 'title', schema.messageColumn || 'message', 'is_read', 'created_at'];
      const values = ['@user_id', '@type', '@title', '@msg', '@is_read', 'GETDATE()'];

      if (schema.hasColumn('id') && !schema.idIsIdentity) {
        request.input('id', sql.NVarChar(255), newId);
        columns.unshift('id');
        values.unshift('@id');
      }
      if (schema.hasColumn('language') && notificationData.language !== undefined) {
        request.input('language', sql.NVarChar(10), notificationData.language);
        columns.push('language');
        values.push('@language');
      }
      if (schema.hasColumn('data') && notificationData.data !== undefined) {
        request.input('data', sql.NVarChar(sql.MAX), typeof notificationData.data === 'string' ? notificationData.data : JSON.stringify(notificationData.data));
        columns.push('data');
        values.push('@data');
      }
      if (schema.hasColumn('email_sent')) {
        request.input('email_sent', sql.Bit, false);
        columns.push('email_sent');
        values.push('@email_sent');
      }

      const result = await request
        .query(`
          INSERT INTO notifications (${columns.join(', ')})
          OUTPUT INSERTED.*
          VALUES (${values.join(', ')})
        `);
      
      logger.info(`Notification created: ${newId}`);
      return result.recordset[0];
    } catch (error) {
      logger.warn('Error creating notification (table may have different schema):', error.message);
      return null;
    }
  }

  static async markAsRead(id, userId = null) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      const request = pool.request();
      this.bindFlexibleId(request, 'id', id);
      
      let query = `
        UPDATE notifications 
        SET is_read = 1
        OUTPUT INSERTED.*
        WHERE id = @id
      `;
      
      if (userId) {
        query = `
          UPDATE notifications 
          SET is_read = 1
          OUTPUT INSERTED.*
          WHERE id = @id AND ${schema.userColumn || 'user_id'} = @user_id
        `;
        this.bindFlexibleId(request, 'user_id', userId);
      }
      
      const result = await request.query(query);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      return null;
    }
  }

  static async markAllAsRead(userId) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      if (!schema.userColumn) return { success: true };
      
      const request = pool.request();
      this.bindFlexibleId(request, 'user_id', userId);
      await request
        .query(`
          UPDATE notifications 
          SET is_read = 1
          WHERE ${schema.userColumn} = @user_id AND is_read = 0
        `);
      
      return { success: true };
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      return { success: false };
    }
  }

  static async getUnreadCount(userId) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      if (!schema.userColumn) return 0;

      const request = pool.request();
      this.bindFlexibleId(request, 'user_id', userId);
      const result = await request
        .query(`
          SELECT COUNT(*) as count
          FROM notifications
          WHERE ${schema.userColumn} = @user_id AND is_read = 0
        `);
      return result.recordset[0].count;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }

  static async delete(id, userId = null) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      const request = pool.request();
      this.bindFlexibleId(request, 'id', id);
      
      let query = `DELETE FROM notifications OUTPUT DELETED.id WHERE id = @id`;
      
      if (userId) {
        query = `DELETE FROM notifications OUTPUT DELETED.id WHERE id = @id AND ${schema.userColumn || 'user_id'} = @user_id`;
        this.bindFlexibleId(request, 'user_id', userId);
      }
      
      const result = await request.query(query);
      return { success: result.recordset.length > 0 };
    } catch (error) {
      logger.error('Error deleting notification:', error);
      return { success: false };
    }
  }

  static async deleteRead(userId) {
    try {
      const pool = getPool();
      const schema = await this.getSchema();
      if (!schema.userColumn) return { success: true };

      const request = pool.request();
      this.bindFlexibleId(request, 'user_id', userId);
      await request.query(`DELETE FROM notifications WHERE ${schema.userColumn} = @user_id AND is_read = 1`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting read notifications:', error);
      return { success: false };
    }
  }

  static async getPendingEmailNotifications(limit = 100) {
    // Gracefully return empty array - email notifications disabled
    return [];
  }
}

module.exports = Notification;
