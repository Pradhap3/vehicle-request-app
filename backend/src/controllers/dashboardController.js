const logger = require('../utils/logger');
const { getPool } = require('../config/database');
const SmartAllocationService = require('../ai/SmartAllocationService');

// Get dashboard statistics
exports.getStats = async (req, res) => {
  try {
    const pool = getPool();

    // Get all stats with simple queries that work with any schema
    const usersResult = await pool.request().query(`SELECT COUNT(*) as total FROM users WHERE is_active = 1`);
    const cabsResult = await pool.request().query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available
      FROM cabs
      WHERE is_active = 1
    `);
    const routesResult = await pool.request().query(`SELECT COUNT(*) as total FROM routes WHERE is_active = 1`);
    
    // Try to get requests stats, handle if table structure is different
    let requestsData = { total: 0, pending: 0, approved: 0, completed: 0, assigned: 0, in_progress: 0 };
    try {
      const requestsResult = await pool.request().query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'ASSIGNED' THEN 1 ELSE 0 END) as assigned,
          SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
        FROM cab_requests
        WHERE is_active = 1
      `);
      requestsData = {
        total: requestsResult.recordset[0]?.total || 0,
        pending: requestsResult.recordset[0]?.pending || 0,
        approved: requestsResult.recordset[0]?.approved || 0,
        assigned: requestsResult.recordset[0]?.assigned || 0,
        in_progress: requestsResult.recordset[0]?.in_progress || 0,
        completed: requestsResult.recordset[0]?.completed || 0
      };
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
          available: cabsResult.recordset[0]?.available || 0
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
    const date = req.query?.date || new Date().toISOString().slice(0, 10);
    const data = await SmartAllocationService.getCapacityAnalytics(date);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Get capacity analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch capacity analytics' });
  }
};

// Get trip performance metrics
exports.getTripMetrics = async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        CAST(pickup_time AS DATE) AS trip_date,
        COUNT(*) AS total_trips,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_trips,
        SUM(CASE WHEN status IN ('APPROVED', 'ASSIGNED', 'IN_PROGRESS') THEN 1 ELSE 0 END) AS active_trips,
        AVG(CASE WHEN actual_pickup_time IS NOT NULL THEN DATEDIFF(MINUTE, pickup_time, actual_pickup_time) * 1.0 END) AS avg_pickup_delay_min
      FROM cab_requests
      WHERE is_active = 1
        AND pickup_time >= DATEADD(DAY, -14, GETDATE())
      GROUP BY CAST(pickup_time AS DATE)
      ORDER BY trip_date DESC
    `);
    res.json({ success: true, data: result.recordset || [] });
  } catch (error) {
    logger.error('Get trip metrics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch trip metrics' });
  }
};

// Get driver performance
exports.getDriverPerformance = async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        u.id AS driver_id,
        u.name AS driver_name,
        c.cab_number,
        COUNT(cr.id) AS total_trips,
        SUM(CASE WHEN cr.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_trips,
        AVG(CASE WHEN cr.actual_pickup_time IS NOT NULL THEN DATEDIFF(MINUTE, cr.pickup_time, cr.actual_pickup_time) * 1.0 END) AS avg_pickup_delay_min
      FROM cabs c
      INNER JOIN users u ON u.id = c.driver_id
      LEFT JOIN cab_requests cr ON cr.cab_id = c.id AND cr.is_active = 1 AND cr.pickup_time >= DATEADD(DAY, -30, GETDATE())
      WHERE c.is_active = 1
      GROUP BY u.id, u.name, c.cab_number
      ORDER BY completed_trips DESC, total_trips DESC
    `);
    res.json({ success: true, data: result.recordset || [] });
  } catch (error) {
    logger.error('Get driver performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver performance' });
  }
};
