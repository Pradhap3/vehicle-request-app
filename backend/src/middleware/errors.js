/**
 * src/utils/errors.js
 * Centralized error handling system
 * All errors in the system should extend from AppError
 */

class AppError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.name = this.constructor.name;
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super('VALIDATION_ERROR', message, 400, { errors });
  }
}

class NotFoundError extends AppError {
  constructor(resource, id = null) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super('NOT_FOUND', message, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(code, message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access denied', resource = null) {
    super('FORBIDDEN', message, 403, { resource });
  }
}

class ConflictError extends AppError {
  constructor(message, code = 'CONFLICT') {
    super(code, message, 409);
  }
}

class DatabaseError extends AppError {
  constructor(message, originalError = null, operation = 'UNKNOWN') {
    super('DATABASE_ERROR', `Database error during ${operation}: ${message}`, 500, {
      originalMessage: originalError?.message,
      operation
    });
  }
}

class ExternalAPIError extends AppError {
  constructor(service, message, originalError = null) {
    super('EXTERNAL_API_ERROR',
      `${service} request failed: ${message}`, 500, {
      service,
      originalMessage: originalError?.message
    });
  }
}

class RaceConditionError extends AppError {
  constructor(resource = 'Resource') {
    super('RACE_CONDITION', `${resource} was modified by another request. Please retry.`, 409);
  }
}

class AllocationError extends AppError {
  constructor(message, code = 'ALLOCATION_FAILED') {
    super(code, message, 400);
  }
}

class TimeoutError extends AppError {
  constructor(operation = 'Operation', timeout = 5000) {
    super('TIMEOUT', `${operation} timed out after ${timeout}ms`, 504);
  }
}

class GeoFenceError extends AppError {
  constructor(message, code = 'GEOFENCE_ERROR') {
    super(code, message, 400);
  }
}

class ShiftError extends AppError {
  constructor(message, code = 'SHIFT_ERROR') {
    super(code, message, 400);
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  ExternalAPIError,
  RaceConditionError,
  AllocationError,
  TimeoutError,
  GeoFenceError,
  ShiftError
};
