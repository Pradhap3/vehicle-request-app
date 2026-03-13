const { sql, getPool } = require('../config/database');
const logger = require('../utils/logger');

class ReportsService {
  static async getTripSummary(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          COUNT(*) AS total_trips,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows,
          SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END) AS escalated,
          SUM(CASE WHEN status IN ('ASSIGNED','DRIVER_EN_ROUTE','ARRIVED','IN_PROGRESS') THEN 1 ELSE 0 END) AS in_progress,
          AVG(CAST(duration_minutes AS FLOAT)) AS avg_duration,
          AVG(CAST(distance_km AS FLOAT)) AS avg_distance
        FROM trips
        WHERE is_active = 1 AND CAST(scheduled_pickup AS DATE) BETWEEN @from AND @to
      `);
    return result.recordset[0];
  }

  static async getDailyBreakdown(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          CAST(scheduled_pickup AS DATE) AS trip_date,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows
        FROM trips
        WHERE is_active = 1 AND CAST(scheduled_pickup AS DATE) BETWEEN @from AND @to
        GROUP BY CAST(scheduled_pickup AS DATE)
        ORDER BY trip_date
      `);
    return result.recordset;
  }

  static async getDriverPerformance(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          d.id AS driver_id, u.name AS driver_name,
          COUNT(t.id) AS total_trips,
          SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN t.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN t.status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows,
          AVG(CAST(t.duration_minutes AS FLOAT)) AS avg_duration,
          d.rating_average,
          v.vehicle_number
        FROM drivers d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN vehicles v ON v.id = d.vehicle_id
        LEFT JOIN trips t ON t.driver_id = d.id AND t.is_active = 1
          AND CAST(t.scheduled_pickup AS DATE) BETWEEN @from AND @to
        WHERE d.is_active = 1
        GROUP BY d.id, u.name, d.rating_average, v.vehicle_number
        ORDER BY completed DESC
      `);
    return result.recordset;
  }

  static async getVehicleUtilization(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          v.id, v.vehicle_number, v.vehicle_type, v.capacity,
          COUNT(t.id) AS total_trips,
          SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_trips,
          SUM(CAST(t.distance_km AS FLOAT)) AS total_distance_km,
          vn.name AS vendor_name
        FROM vehicles v
        LEFT JOIN vendors vn ON vn.id = v.vendor_id
        LEFT JOIN trips t ON t.vehicle_id = v.id AND t.is_active = 1
          AND CAST(t.scheduled_pickup AS DATE) BETWEEN @from AND @to
        WHERE v.is_active = 1
        GROUP BY v.id, v.vehicle_number, v.vehicle_type, v.capacity, vn.name
        ORDER BY total_trips DESC
      `);
    return result.recordset;
  }

  static async getEmployeeUsage(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          u.id, u.employee_id, u.name, u.department,
          COUNT(b.id) AS total_bookings,
          SUM(CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN b.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN b.status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows
        FROM users u
        LEFT JOIN bookings b ON b.employee_id = u.id AND b.is_active = 1
          AND CAST(b.pickup_time AS DATE) BETWEEN @from AND @to
        WHERE u.role IN ('EMPLOYEE','USER') AND u.is_active = 1
        GROUP BY u.id, u.employee_id, u.name, u.department
        HAVING COUNT(b.id) > 0
        ORDER BY total_bookings DESC
      `);
    return result.recordset;
  }

  static async getShiftReport(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          ISNULL(s.name, 'Unassigned') AS shift_name,
          ISNULL(s.shift_code, 'N/A') AS shift_code,
          COUNT(b.id) AS total_bookings,
          SUM(CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN b.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled
        FROM bookings b
        LEFT JOIN shifts s ON s.id = b.shift_id
        WHERE b.is_active = 1 AND CAST(b.pickup_time AS DATE) BETWEEN @from AND @to
        GROUP BY s.name, s.shift_code
        ORDER BY total_bookings DESC
      `);
    return result.recordset;
  }

  static async getRouteReport(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          r.id, r.name AS route_name, r.zone,
          COUNT(t.id) AS total_trips,
          SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          AVG(CAST(t.duration_minutes AS FLOAT)) AS avg_duration
        FROM routes r
        LEFT JOIN trips t ON t.route_id = r.id AND t.is_active = 1
          AND CAST(t.scheduled_pickup AS DATE) BETWEEN @from AND @to
        WHERE r.is_active = 1
        GROUP BY r.id, r.name, r.zone
        ORDER BY total_trips DESC
      `);
    return result.recordset;
  }

  static async getIncidentReport(fromDate, toDate) {
    const pool = getPool();
    const result = await pool.request()
      .input('from', sql.Date, fromDate)
      .input('to', sql.Date, toDate)
      .query(`
        SELECT
          incident_type,
          severity,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count
        FROM incidents
        WHERE is_active = 1 AND CAST(created_at AS DATE) BETWEEN @from AND @to
        GROUP BY incident_type, severity
        ORDER BY total DESC
      `);
    return result.recordset;
  }

  static async exportCSV(reportType, fromDate, toDate) {
    let data;
    switch (reportType) {
      case 'trips': data = await this.getDailyBreakdown(fromDate, toDate); break;
      case 'drivers': data = await this.getDriverPerformance(fromDate, toDate); break;
      case 'vehicles': data = await this.getVehicleUtilization(fromDate, toDate); break;
      case 'employees': data = await this.getEmployeeUsage(fromDate, toDate); break;
      case 'routes': data = await this.getRouteReport(fromDate, toDate); break;
      default: data = await this.getDailyBreakdown(fromDate, toDate);
    }

    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') ? `"${str}"` : str;
    }).join(','));

    return [headers.join(','), ...rows].join('\n');
  }
}

module.exports = ReportsService;
