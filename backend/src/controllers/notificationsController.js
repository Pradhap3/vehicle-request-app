const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// Get all notifications for current user
exports.getAll = async (req, res) => {
  try {
    const notifications = await Notification.findByUserId(req.user.id);
    
    res.json({
      success: true,
      data: notifications || [],
      count: notifications?.length || 0
    });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.json({
      success: true,
      data: [],
      count: 0
    });
  }
};

// Get notification by ID
exports.getById = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error('Get notification by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification'
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    await Notification.markAsRead(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    logger.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification'
    });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.markAllAsRead(req.user.id);

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    logger.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notifications'
    });
  }
};

// Delete notification
exports.delete = async (req, res) => {
  try {
    await Notification.delete(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
};

// Delete all read notifications
exports.deleteRead = async (req, res) => {
  try {
    await Notification.deleteRead(req.user.id);

    res.json({
      success: true,
      message: 'Deleted read notifications'
    });
  } catch (error) {
    logger.error('Delete read notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notifications'
    });
  }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: { count: count || 0 }
    });
  } catch (error) {
    logger.error('Get unread count error:', error);
    res.json({
      success: true,
      data: { count: 0 }
    });
  }
};

// Send notification (Admin only)
exports.send = async (req, res) => {
  try {
    const { user_id, user_ids, title, message, type = 'INFO' } = req.body;

    if (!user_id && !user_ids) {
      return res.status(400).json({
        success: false,
        message: 'user_id or user_ids is required'
      });
    }

    const recipients = user_ids || [user_id];
    const notifications = [];

    for (const recipientId of recipients) {
      const notification = await Notification.create({
        user_id: recipientId,
        title,
        message,
        type
      });
      if (notification) {
        notifications.push(notification);
      }

      // Emit socket event
      if (req.io) {
        req.io.to(`user_${recipientId}`).emit('notification', {
          id: notification?.id,
          title,
          message,
          type,
          created_at: new Date()
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Sent ${notifications.length} notification(s)`,
      data: notifications
    });
  } catch (error) {
    logger.error('Send notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification'
    });
  }
};
