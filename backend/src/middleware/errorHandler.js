/**
 * src/middleware/errorHandler.js
 * Global error handler middleware
 * MUST be last middleware in the app.js
 */

const logger = require('../utils/logger');
const { AppError, DatabaseError } = require('../utils/errors');

/**
 * Sanitize error response for production
 */
const sanitizeError = (err, isProduction = true) => {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      ...(err.details && Object.keys(err.details).length > 0 && { details: err.details })
    };
  }

  if (isProduction) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: err.message,
    stack: err.stack
  };
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const requestId = req.id || 'unknown';
  const timestamp = new Date().toISOString();

  // Base error data
  const errorData = {
    requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    timestamp,
    code: err.code || 'UNKNOWN'
  };

  // Log the error
  if (err instanceof AppError) {
    // Expected errors - log at warn level
    logger.warn(`${err.code} - ${err.message}`, {
      ...errorData,
      statusCode: err.statusCode,
      details: err.details
    });

    return res.status(err.statusCode).json({
      success: false,
      error: sanitizeError(err, isProduction),
      requestId,
      timestamp
    });
  }

  // Database errors - log at error level
  if (err.code && ['EREQUEST', 'ELOGIN', 'ESOCKET', 'ETIMEOUT'].includes(err.code)) {
    const dbErr = new DatabaseError(
      err.message,
      err,
      req.method === 'GET' ? 'READ' : 'WRITE'
    );

    logger.error('Database error', {
      ...errorData,
      originalError: err.message,
      code: err.code,
      severity: err.code === 'ELOGIN' ? 'CRITICAL' : 'HIGH'
    });

    return res.status(503).json({
      success: false,
      error: sanitizeError(dbErr, isProduction),
      requestId,
      timestamp
    });
  }

  // Unexpected errors - log at error level
  logger.error('Unhandled error', {
    ...errorData,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    }
  });

  res.status(500).json({
    success: false,
    error: sanitizeError(err, isProduction),
    requestId,
    timestamp
  });
};

/**
 * 404 handler (should be before error handler)
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    },
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
};

/**
 * Async wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(controller.action))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  sanitizeError
};
