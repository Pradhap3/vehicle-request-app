// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const User = require('../models/User');
const { connectDB } = require('../config/database');

const isDatabaseUnavailableError = (error) => {
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('database not connected') ||
    msg.includes('cannot open server') ||
    msg.includes('econn') ||
    msg.includes('elogin') ||
    msg.includes('esocket')
  );
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      await connectDB();
      
      // Get fresh user data
      const user = await User.findById(decoded.id);
      
      if (!user || !user.is_active) {
        return res.status(401).json({
          success: false,
          error: 'User not found or inactive'
        });
      }

      req.user = user;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      throw jwtError;
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database temporarily unavailable. Please retry in a few minutes.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      await connectDB();
      const user = await User.findById(decoded.id);
      if (user && user.is_active) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth
};
