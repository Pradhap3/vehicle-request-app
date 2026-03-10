/**
 * src/middleware/requestContext.js
 * Adds request ID and structured logging context
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Generate and attach request ID
 * Also log structured request/response data
 */
const requestContextMiddleware = (req, res, next) => {
  // Generate unique request ID
  req.id = req.get('x-request-id') || uuidv4();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id);

  // Create request-scoped logger
  const createLogger = (level) => (msg, data = {}) => {
    logger[level](msg, {
      requestId: req.id,
      method: req.method,
      path: req.path,
      userId: req.user?.id,
      ...data
    });
  };

  req.logger = {
    info: createLogger('info'),
    warn: createLogger('warn'),
    error: createLogger('error'),
    debug: createLogger('debug')
  };

  // Log incoming request
  req.logger.info('Request received', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')?.substring(0, 100),
    contentLength: req.get('content-length')
  });

  // Intercept response.send to log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - req.startTime;

    // Parse response body if JSON
    let responseData = null;
    try {
      if (typeof data === 'string' && data.startsWith('{')) {
        responseData = JSON.parse(data);
      }
    } catch {
      // Not JSON, skip
    }

    req.logger.info('Response sent', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: Buffer.byteLength(data || ''),
      success: responseData?.success
    });

    // Log slow requests
    if (duration > 5000) {
      req.logger.warn('Slow request detected', {
        duration: `${duration}ms`,
        threshold: '5000ms'
      });
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Correlation ID from parent service
 * For distributed tracing
 */
const correlationIdMiddleware = (req, res, next) => {
  req.correlationId = req.get('x-correlation-id') || req.id;
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};

module.exports = {
  requestContextMiddleware,
  correlationIdMiddleware
};
