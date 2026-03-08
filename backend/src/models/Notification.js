// src/models/Notification.js
const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class Notification {
  static async findById(id) {
    try {
      const pool = getPool();
      const result = await pool.request()
        .input('id', sql.NVarChar(255), id)
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
      const result = await pool.request()
        .input('user_id', sql.NVarChar(255), userId)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit) *
          FROM notifications
          WHERE user_id = @user_id
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
      const newId = uuidv4().toUpperCase();
      
      const result = await pool.request()
        .input('id', sql.NVarChar(255), newId)
        .input('user_id', sql.NVarChar(255), notificationData.user_id)
        .input('type', sql.NVarChar(50), notificationData.type || 'GENERAL')
        .input('title', sql.NVarChar(255), notificationData.title || 'Notification')
        .input('message', sql.NVarChar(1000), notificationData.message || '')
        .input('is_read', sql.Bit, false)
        .query(`
          INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
          OUTPUT INSERTED.*
          VALUES (@id, @user_id, @type, @title, @message, @is_read, GETDATE())
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
      const request = pool.request().input('id', sql.NVarChar(255), id);
      
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
          WHERE id = @id AND user_id = @user_id
        `;
        request.input('user_id', sql.NVarChar(255), userId);
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
      
      await pool.request()
        .input('user_id', sql.NVarChar(255), userId)
        .query(`
          UPDATE notifications 
          SET is_read = 1
          WHERE user_id = @user_id AND is_read = 0
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
      const result = await pool.request()
        .input('user_id', sql.NVarChar(255), userId)
        .query(`
          SELECT COUNT(*) as count
          FROM notifications
          WHERE user_id = @user_id AND is_read = 0
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
      const request = pool.request().input('id', sql.NVarChar(255), id);
      
      let query = `DELETE FROM notifications OUTPUT DELETED.id WHERE id = @id`;
      
      if (userId) {
        query = `DELETE FROM notifications OUTPUT DELETED.id WHERE id = @id AND user_id = @user_id`;
        request.input('user_id', sql.NVarChar(255), userId);
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
      await pool.request()
        .input('user_id', sql.NVarChar(255), userId)
        .query(`DELETE FROM notifications WHERE user_id = @user_id AND is_read = 1`);
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
