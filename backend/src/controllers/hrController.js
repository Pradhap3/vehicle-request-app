const { asyncHandler } = require('../middleware/errorHandler');
const { getPool } = require('../config/database');
const sql = require('mssql');
const ReportsService = require('../services/ReportsService');

exports.getDashboard = asyncHandler(async (req, res) => {
  const pool = getPool();
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [employeeCount, activeDrivers, todayBookings, tripSummary, recentIncidents] = await Promise.all([
    pool.request().query(`SELECT COUNT(*) AS count FROM users WHERE role IN ('EMPLOYEE','USER') AND is_active = 1`),
    pool.request().query(`SELECT COUNT(*) AS count FROM drivers WHERE is_active = 1 AND availability_status = 'ONLINE'`),
    pool.request().input('today', sql.Date, today).query(`
      SELECT COUNT(*) AS count, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
      FROM bookings WHERE CAST(pickup_time AS DATE) = @today AND is_active = 1
    `),
    ReportsService.getTripSummary(thirtyDaysAgo, today),
    pool.request().query(`
      SELECT TOP 5 i.*, u.name AS reporter_name
      FROM incidents i LEFT JOIN users u ON u.id = i.reported_by
      WHERE i.is_active = 1 ORDER BY i.created_at DESC
    `)
  ]);

  res.json({
    success: true,
    data: {
      total_employees: employeeCount.recordset[0].count,
      active_drivers: activeDrivers.recordset[0].count,
      today_bookings: todayBookings.recordset[0].count,
      today_completed: todayBookings.recordset[0].completed || 0,
      trip_summary_30d: tripSummary,
      recent_incidents: recentIncidents.recordset
    }
  });
});

exports.getEmployeeRoster = asyncHandler(async (req, res) => {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT u.id, u.employee_id, u.name, u.email, u.phone, u.department,
           etp.shift_code, etp.route_id, r.name AS route_name,
           etp.auto_generate, etp.pickup_location, etp.drop_location
    FROM users u
    LEFT JOIN employee_transport_profiles etp ON etp.employee_id = u.id AND etp.is_active = 1
    LEFT JOIN routes r ON r.id = etp.route_id
    WHERE u.role IN ('EMPLOYEE','USER') AND u.is_active = 1
    ORDER BY u.department, u.name
  `);
  res.json({ success: true, data: result.recordset });
});

exports.getShiftTransportView = asyncHandler(async (req, res) => {
  const pool = getPool();
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const result = await pool.request().input('date', sql.Date, targetDate).query(`
    SELECT s.shift_code, s.name AS shift_name, s.start_time, s.end_time,
           COUNT(b.id) AS booking_count,
           SUM(CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN b.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
           SUM(CASE WHEN b.status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows
    FROM shifts s
    LEFT JOIN bookings b ON b.shift_id = s.id AND CAST(b.pickup_time AS DATE) = @date AND b.is_active = 1
    WHERE s.is_active = 1
    GROUP BY s.shift_code, s.name, s.start_time, s.end_time
    ORDER BY s.start_time
  `);
  res.json({ success: true, data: result.recordset });
});

exports.getComplianceReport = asyncHandler(async (req, res) => {
  const pool = getPool();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const result = await pool.request().input('from', sql.Date, thirtyDaysAgo).query(`
    SELECT u.id, u.employee_id, u.name, u.department,
           COUNT(b.id) AS total_bookings,
           SUM(CASE WHEN b.status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows,
           SUM(CASE WHEN b.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancellations,
           CASE WHEN SUM(CASE WHEN b.status = 'NO_SHOW' THEN 1 ELSE 0 END) > 3 THEN 'NON_COMPLIANT'
                WHEN SUM(CASE WHEN b.status = 'CANCELLED' THEN 1 ELSE 0 END) > 5 THEN 'WARNING'
                ELSE 'COMPLIANT' END AS compliance_status
    FROM users u
    LEFT JOIN bookings b ON b.employee_id = u.id AND b.is_active = 1
      AND CAST(b.pickup_time AS DATE) >= @from
    WHERE u.role IN ('EMPLOYEE','USER') AND u.is_active = 1
    GROUP BY u.id, u.employee_id, u.name, u.department
    HAVING COUNT(b.id) > 0
    ORDER BY no_shows DESC, cancellations DESC
  `);
  res.json({ success: true, data: result.recordset });
});

exports.getSafetyDashboard = asyncHandler(async (req, res) => {
  const pool = getPool();
  const [incidents, ratings] = await Promise.all([
    pool.request().query(`
      SELECT incident_type, severity, COUNT(*) AS count
      FROM incidents WHERE is_active = 1 AND created_at >= DATEADD(DAY, -30, GETDATE())
      GROUP BY incident_type, severity ORDER BY count DESC
    `),
    pool.request().query(`
      SELECT AVG(CAST(rating AS FLOAT)) AS avg_rating,
             COUNT(*) AS total_ratings,
             SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS low_ratings
      FROM ratings WHERE is_active = 1 AND created_at >= DATEADD(DAY, -30, GETDATE())
    `)
  ]);

  res.json({
    success: true,
    data: {
      incidents_by_type: incidents.recordset,
      rating_summary: ratings.recordset[0]
    }
  });
});
