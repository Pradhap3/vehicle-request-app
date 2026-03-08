// src/controllers/usersController.js
const { validationResult } = require('express-validator');
const User = require('../models/User');
const logger = require('../utils/logger');

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    
    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user'
    });
  }
};

// Create user
exports.createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { employee_id, name, email, phone, department, role, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    const existingEmployeeId = await User.findByEmployeeId(employee_id);
    if (existingEmployeeId) {
      return res.status(400).json({
        success: false,
        error: 'User with this employee ID already exists'
      });
    }

    const user = await User.create({
      employee_id,
      name,
      email,
      phone,
      department,
      role,
      password
    });

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully'
    });
  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user'
    });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const { name, email, phone, department, role, password, is_active } = req.body;

    // Check if email is being changed and if it's already taken
    if (email && email !== existingUser.email) {
      const emailExists = await User.findByEmail(email);
      if (emailExists) {
        return res.status(400).json({
          success: false,
          error: 'Email already in use'
        });
      }
    }

    const user = await User.update(req.params.id, {
      name,
      email,
      phone,
      department,
      role,
      password,
      is_active
    });

    res.json({
      success: true,
      data: user,
      message: 'User updated successfully'
    });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user'
    });
  }
};

// Delete user (soft delete - deactivate)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deleting yourself
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    // Soft delete
    await User.delete(req.params.id);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete user'
    });
  }
};

// Hard delete user (permanent)
exports.hardDeleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deleting yourself
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    await User.hardDelete(req.params.id);

    res.json({
      success: true,
      message: 'User permanently deleted'
    });
  } catch (error) {
    logger.error('Hard delete user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete user'
    });
  }
};

// Get drivers
exports.getDrivers = async (req, res) => {
  try {
    const drivers = await User.findDrivers();
    
    res.json({
      success: true,
      data: drivers,
      count: drivers.length
    });
  } catch (error) {
    logger.error('Get drivers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch drivers'
    });
  }
};

// Get employees
exports.getEmployees = async (req, res) => {
  try {
    const employees = await User.findEmployees();
    
    res.json({
      success: true,
      data: employees,
      count: employees.length
    });
  } catch (error) {
    logger.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employees'
    });
  }
};
