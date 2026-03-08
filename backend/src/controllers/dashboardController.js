const logger = require('../utils/logger');
const { getPool } = require('../config/database');

// Get dashboard statistics
exports.getStats = async (req, res) => {
  try {
    const pool = getPool();

    // Get all stats with simple queries that work with any schema
    const usersResult = await pool.request().query(`SELECT COUNT(*) as total FROM users WHERE is_active = 1`);
    const cabsResult = await pool.request().query(`SELECT COUNT(*) as total FROM cabs WHERE is_active = 1`);
    const routesResult = await pool.request().query(`SELECT COUNT(*) as total FROM routes WHERE is_active = 1`);
    
    // Try to get requests stats, handle if table structure is different
    let requestsData = { total: 0, pending: 0, approved: 0, completed: 0 };
    try {
      const requestsResult = await pool.request().query(`SELECT COUNT(*) as total FROM cab_requests`);
      requestsData.total = requestsResult.recordset[0]?.total || 0;
    } catch (e) {
      // Table might not exist or have different structure
      logger.warn('Could not query cab_requests table:', e.message);
    }

    res.json({
      success: true,
      data: {
        users: { total: usersResult.recordset[0]?.total || 0 },
        cabs: { 
          total: cabsResult.recordset[0]?.total || 0,
          available: cabsResult.recordset[0]?.total || 0
        },
        routes: { total: routesResult.recordset[0]?.total || 0 },
        requests: requestsData
      }
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

// Get capacity analytics
exports.getCapacityAnalytics = async (req, res) => {
  try {
    res.json({ success: true, data: { routes: [] } });
  } catch (error) {
    logger.error('Get capacity analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch capacity analytics' });
  }
};

// Get trip performance metrics
exports.getTripMetrics = async (req, res) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    logger.error('Get trip metrics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch trip metrics' });
  }
};

// Get driver performance
exports.getDriverPerformance = async (req, res) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    logger.error('Get driver performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver performance' });
  }
};