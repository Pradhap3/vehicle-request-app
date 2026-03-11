const { getPool } = require('../config/database');
const logger = require('../utils/logger');

class SchemaBootstrapService {
  static statements = [
    `
    IF OBJECT_ID('dbo.route_stops', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.route_stops (
        id INT IDENTITY(1,1) PRIMARY KEY,
        route_id INT NOT NULL REFERENCES routes(id),
        stop_name NVARCHAR(255) NOT NULL,
        latitude FLOAT NULL,
        longitude FLOAT NULL,
        stop_sequence INT NOT NULL,
        eta_offset_minutes INT DEFAULT 0,
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      );
    END
    `,
    `
    IF OBJECT_ID('dbo.employee_transport_profiles', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.employee_transport_profiles (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employee_id INT NOT NULL REFERENCES users(id),
        route_id INT NULL REFERENCES routes(id),
        shift_code NVARCHAR(40) NULL,
        pickup_location NVARCHAR(500) NULL,
        drop_location NVARCHAR(500) NULL,
        pickup_latitude FLOAT NULL,
        pickup_longitude FLOAT NULL,
        drop_latitude FLOAT NULL,
        drop_longitude FLOAT NULL,
        stop_name NVARCHAR(255) NULL,
        stop_sequence INT NULL,
        auto_generate BIT DEFAULT 1,
        is_active BIT DEFAULT 1,
        effective_from DATE NULL,
        effective_to DATE NULL,
        last_generated_for DATE NULL,
        pending_shift_code NVARCHAR(40) NULL,
        pending_shift_effective_from DATE NULL,
        pending_shift_effective_to DATE NULL,
        pending_shift_requested_at DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      );
    END
    `,
    `
    IF COL_LENGTH('dbo.cab_requests', 'request_type') IS NULL
      ALTER TABLE dbo.cab_requests ADD request_type NVARCHAR(40) DEFAULT 'ADHOC';
    IF COL_LENGTH('dbo.cab_requests', 'priority') IS NULL
      ALTER TABLE dbo.cab_requests ADD priority NVARCHAR(20) DEFAULT 'NORMAL';
    IF COL_LENGTH('dbo.cab_requests', 'actual_pickup_time') IS NULL
      ALTER TABLE dbo.cab_requests ADD actual_pickup_time DATETIME NULL;
    IF COL_LENGTH('dbo.cab_requests', 'actual_dropoff_time') IS NULL
      ALTER TABLE dbo.cab_requests ADD actual_dropoff_time DATETIME NULL;
    IF COL_LENGTH('dbo.cab_requests', 'delay_reason') IS NULL
      ALTER TABLE dbo.cab_requests ADD delay_reason NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.cab_requests', 'assigned_at') IS NULL
      ALTER TABLE dbo.cab_requests ADD assigned_at DATETIME NULL;
    IF COL_LENGTH('dbo.cab_requests', 'boarding_area') IS NULL
      ALTER TABLE dbo.cab_requests ADD boarding_area NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.cab_requests', 'dropping_area') IS NULL
      ALTER TABLE dbo.cab_requests ADD dropping_area NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.cab_requests', 'is_active') IS NULL
      ALTER TABLE dbo.cab_requests ADD is_active BIT NOT NULL CONSTRAINT DF_cab_requests_is_active DEFAULT 1;
    IF COL_LENGTH('dbo.cab_requests', 'deleted_at') IS NULL
      ALTER TABLE dbo.cab_requests ADD deleted_at DATETIME NULL;
    IF COL_LENGTH('dbo.cab_requests', 'deleted_by') IS NULL
      ALTER TABLE dbo.cab_requests ADD deleted_by INT NULL;
    `,
    `
    IF COL_LENGTH('dbo.users', 'auth_provider') IS NULL
      ALTER TABLE dbo.users ADD auth_provider NVARCHAR(50) NOT NULL CONSTRAINT DF_users_auth_provider_boot DEFAULT 'LOCAL';
    IF COL_LENGTH('dbo.users', 'external_subject') IS NULL
      ALTER TABLE dbo.users ADD external_subject NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.users', 'preferred_language') IS NULL
      ALTER TABLE dbo.users ADD preferred_language NVARCHAR(10) DEFAULT 'en';
    IF COL_LENGTH('dbo.users', 'last_login') IS NULL
      ALTER TABLE dbo.users ADD last_login DATETIME NULL;
    `,
    `
    IF COL_LENGTH('dbo.cabs', 'last_location_update') IS NULL
      ALTER TABLE dbo.cabs ADD last_location_update DATETIME NULL;
    `,
    `
    IF OBJECT_ID('dbo.trips', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.trips (
        id INT IDENTITY(1,1) PRIMARY KEY,
        request_id INT NULL,
        route_id INT NULL,
        cab_id INT NULL,
        driver_id INT NULL,
        trip_date DATE NOT NULL,
        trip_direction NVARCHAR(30) NOT NULL DEFAULT 'INBOUND',
        trip_category NVARCHAR(40) NOT NULL DEFAULT 'DAILY',
        shift_code NVARCHAR(40) NULL,
        planned_start_time DATETIME NULL,
        planned_end_time DATETIME NULL,
        actual_start_time DATETIME NULL,
        actual_end_time DATETIME NULL,
        status NVARCHAR(40) NOT NULL DEFAULT 'PLANNED',
        planned_distance_km FLOAT NULL,
        planned_duration_minutes INT NULL,
        optimization_score FLOAT NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      );
    END
    `,
    `
    IF OBJECT_ID('dbo.trip_passengers', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.trip_passengers (
        id INT IDENTITY(1,1) PRIMARY KEY,
        trip_id INT NOT NULL REFERENCES trips(id),
        request_id INT NULL,
        employee_id INT NOT NULL,
        stop_sequence INT NULL,
        pickup_location NVARCHAR(500) NULL,
        drop_location NVARCHAR(500) NULL,
        status NVARCHAR(40) NOT NULL DEFAULT 'ASSIGNED',
        boarded_at DATETIME NULL,
        dropped_at DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      );
    END
    `,
    `
    IF OBJECT_ID('dbo.security_gate_logs', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.security_gate_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        cab_id INT NULL,
        trip_id INT NULL,
        plate_number NVARCHAR(50) NULL,
        gate_code NVARCHAR(50) NOT NULL,
        event_type NVARCHAR(20) NOT NULL DEFAULT 'ENTRY',
        decision NVARCHAR(20) NOT NULL DEFAULT 'MANUAL_REVIEW',
        reason NVARCHAR(500) NULL,
        scanned_by_user_id INT NULL,
        scanned_at DATETIME NOT NULL DEFAULT GETDATE(),
        created_at DATETIME DEFAULT GETDATE()
      );
    END
    `,
    `
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trip_passengers_trip_employee' AND object_id = OBJECT_ID('dbo.trip_passengers'))
      CREATE INDEX IX_trip_passengers_trip_employee ON dbo.trip_passengers(trip_id, employee_id);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trips_trip_date_status' AND object_id = OBJECT_ID('dbo.trips'))
      CREATE INDEX IX_trips_trip_date_status ON dbo.trips(trip_date, status);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_security_gate_logs_scanned_at' AND object_id = OBJECT_ID('dbo.security_gate_logs'))
      CREATE INDEX IX_security_gate_logs_scanned_at ON dbo.security_gate_logs(scanned_at DESC);
    `
  ];

  static async ensureSchema() {
    const pool = getPool();
    for (const statement of this.statements) {
      try {
        await pool.request().query(statement);
      } catch (error) {
        logger.warn(`Schema bootstrap warning: ${error.message}`);
      }
    }
    logger.info('Schema bootstrap completed');
  }
}

module.exports = SchemaBootstrapService;
