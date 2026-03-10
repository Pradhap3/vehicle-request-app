/**
 * src/middleware/validation.js
 * Centralized validation rules for all endpoints
 */

const { body, query, param, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

/**
 * Validation error handler middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value,
      location: err.location
    }));

    throw new ValidationError('Validation failed', validationErrors);
  }
  next();
};

/**
 * Custom validators
 */
const customValidators = {
  isValidTimeFormat: (value) => {
    if (!value) return true; // Optional field
    const time = new Date(value);
    if (isNaN(time.getTime())) {
      throw new Error('Invalid date/time format');
    }
    return true;
  },

  isFutureTime: (value) => {
    if (!value) return true;
    const time = new Date(value);
    const now = new Date();
    if (time < now) {
      throw new Error('Time must be in the future');
    }
    return true;
  },

  isWithin30Days: (value) => {
    if (!value) return true;
    const time = new Date(value);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    if (time > maxDate) {
      throw new Error('Cannot book more than 30 days in advance');
    }
    return true;
  },

  isValidEmail: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new Error('Invalid email format');
    }
    return true;
  },

  isValidPassword: (value) => {
    if (value.length < 12) {
      throw new Error('Password must be at least 12 characters');
    }
    if (!/[A-Z]/.test(value)) {
      throw new Error('Password must contain uppercase letter');
    }
    if (!/[a-z]/.test(value)) {
      throw new Error('Password must contain lowercase letter');
    }
    if (!/[0-9]/.test(value)) {
      throw new Error('Password must contain number');
    }
    if (!/[!@#$%^&*]/.test(value)) {
      throw new Error('Password must contain special character (!@#$%^&*)');
    }
    return true;
  },

  isValidPhoneNumber: (value) => {
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    if (!phoneRegex.test(value)) {
      throw new Error('Invalid phone number format');
    }
    return true;
  },

  isValidGeolocation: (lat, lng) => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      throw new Error('Invalid latitude/longitude');
    }
    if (latNum < -90 || latNum > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    if (lngNum < -180 || lngNum > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }
    return true;
  }
};

/**
 * Validation rules for Users
 */
const userValidators = {
  createUser: [
    body('employee_id')
      .trim()
      .notEmpty().withMessage('Employee ID required')
      .isLength({ min: 3, max: 50 }).withMessage('Employee ID must be 3-50 characters')
      .matches(/^[A-Z0-9_-]+$/i).withMessage('Invalid employee ID format'),

    body('email')
      .trim()
      .toLowerCase()
      .notEmpty().withMessage('Email required')
      .custom(customValidators.isValidEmail),

    body('name')
      .trim()
      .notEmpty().withMessage('Name required')
      .isLength({ min: 2, max: 255 }).withMessage('Name must be 2-255 characters')
      .matches(/^[a-z\s'-]+$/i).withMessage('Name contains invalid characters'),

    body('phone')
      .optional()
      .trim()
      .custom(customValidators.isValidPhoneNumber),

    body('department')
      .trim()
      .notEmpty().withMessage('Department required')
      .isLength({ max: 100 }).withMessage('Department too long'),

    body('role')
      .notEmpty().withMessage('Role required')
      .isIn(['HR_ADMIN', 'ADMIN', 'EMPLOYEE', 'CAB_DRIVER', 'DRIVER'])
      .withMessage('Invalid role'),

    body('password')
      .custom(customValidators.isValidPassword)
  ],

  updateUser: [
    body('email')
      .optional()
      .trim()
      .toLowerCase()
      .custom(customValidators.isValidEmail),

    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 255 }).withMessage('Name must be 2-255 characters'),

    body('phone')
      .optional()
      .trim()
      .custom(customValidators.isValidPhoneNumber),

    body('password')
      .optional()
      .custom(customValidators.isValidPassword),

    body('role')
      .optional()
      .isIn(['HR_ADMIN', 'ADMIN', 'EMPLOYEE', 'CAB_DRIVER', 'DRIVER'])
  ]
};

/**
 * Validation rules for Cab Requests
 */
const requestValidators = {
  createRequest: [
    body('pickup_location')
      .trim()
      .notEmpty().withMessage('Pickup location required')
      .isLength({ max: 500 }).withMessage('Pickup location too long'),

    body('drop_location')
      .trim()
      .notEmpty().withMessage('Drop location required')
      .isLength({ max: 500 }).withMessage('Drop location too long'),

    body('pickup_time')
      .custom(customValidators.isValidTimeFormat)
      .custom(customValidators.isFutureTime)
      .custom(customValidators.isWithin30Days),

    body('requested_time')
      .optional()
      .custom(customValidators.isValidTimeFormat),

    body('passengers')
      .optional()
      .isInt({ min: 1, max: 10 }).withMessage('Passengers must be 1-10'),

    body('purpose')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Purpose too long'),

    body('route_id')
      .optional()
      .custom((value) => {
        if (!/^\d+$/.test(String(value))) {
          throw new Error('Invalid route ID');
        }
        return true;
      })
  ],

  assignCab: [
    body('cab_id')
      .notEmpty().withMessage('Cab ID required')
      .custom((value) => {
        if (!/^\d+$/.test(String(value))) {
          throw new Error('Invalid cab ID format');
        }
        return true;
      })
  ]
};

/**
 * Validation rules for Cabs
 */
const cabValidators = {
  createCab: [
    body('cab_number')
      .trim()
      .notEmpty().withMessage('Cab number required')
      .matches(/^[A-Z0-9-]+$/i).withMessage('Invalid cab number format'),

    body('capacity')
      .notEmpty().withMessage('Capacity required')
      .isInt({ min: 1, max: 50 }).withMessage('Capacity must be 1-50')
  ],

  updateLocation: [
    body('latitude')
      .notEmpty().withMessage('Latitude required')
      .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),

    body('longitude')
      .notEmpty().withMessage('Longitude required')
      .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude')
  ]
};

/**
 * Pagination validation
 */
const paginationValidators = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100')
    .toInt(),

  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('Offset must be >= 0')
    .toInt(),

  query('sortBy')
    .optional()
    .isIn(['created_at', 'updated_at', 'id', 'name'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC']).withMessage('Sort order must be ASC or DESC')
];

/**
 * ID validation
 */
const idValidators = {
  userId: param('id')
    .custom((value) => {
      if (!/^\d+$/.test(String(value))) {
        throw new Error('Invalid user ID format');
      }
      return true;
    }),

  cabId: param('id')
    .custom((value) => {
      if (!/^\d+$/.test(String(value))) {
        throw new Error('Invalid cab ID format');
      }
      return true;
    }),

  requestId: param('id')
    .custom((value) => {
      if (!/^\d+$/.test(String(value))) {
        throw new Error('Invalid request ID format');
      }
      return true;
    })
};

module.exports = {
  handleValidationErrors,
  customValidators,
  userValidators,
  requestValidators,
  cabValidators,
  paginationValidators,
  idValidators
};
