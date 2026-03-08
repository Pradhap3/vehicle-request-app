// migrations/run.js
require('dotenv').config({ path: '../.env' });

const { sql, connectDB, closeDB } = require('../src/config/database');
const logger = require('../src/utils/logger');

const migrations = [
  // Users table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
  CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    employee_id NVARCHAR(50) NOT NULL UNIQUE,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    phone NVARCHAR(20),
    department NVARCHAR(100) NOT NULL,
    role NVARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE',
    password_hash NVARCHAR(255) NOT NULL,
    preferred_language NVARCHAR(10) DEFAULT 'en',
    is_active BIT DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
  )`,

  // Cabs table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cabs')
  CREATE TABLE cabs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cab_number NVARCHAR(50) NOT NULL UNIQUE,
    capacity INT NOT NULL DEFAULT 4,
    driver_id INT REFERENCES users(id),
    status NVARCHAR(20) DEFAULT 'AVAILABLE',
    current_latitude FLOAT,
    current_longitude FLOAT,
    last_location_update DATETIME,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
  )`,

  // Routes table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'routes')
  CREATE TABLE routes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    start_point NVARCHAR(500) NOT NULL,
    end_point NVARCHAR(500) NOT NULL,
    start_latitude FLOAT,
    start_longitude FLOAT,
    end_latitude FLOAT,
    end_longitude FLOAT,
    waypoints NVARCHAR(MAX),
    distance_km FLOAT,
    estimated_time_minutes INT,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
  )`,

  // Cab requests table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cab_requests')
  CREATE TABLE cab_requests (
    id INT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES users(id),
    route_id INT REFERENCES routes(id),
    cab_id INT REFERENCES cabs(id),
    pickup_time DATETIME NOT NULL,
    pickup_location NVARCHAR(500),
    dropoff_location NVARCHAR(500),
    pickup_latitude FLOAT,
    pickup_longitude FLOAT,
    dropoff_latitude FLOAT,
    dropoff_longitude FLOAT,
    purpose NVARCHAR(500),
    passengers INT DEFAULT 1,
    status NVARCHAR(50) DEFAULT 'PENDING',
    priority NVARCHAR(20) DEFAULT 'NORMAL',
    assigned_at DATETIME,
    actual_pickup_time DATETIME,
    actual_dropoff_time DATETIME,
    notes NVARCHAR(1000),
    delay_reason NVARCHAR(500),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
  )`,

  // Cab tracking table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'cab_tracking')
  CREATE TABLE cab_tracking (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cab_id INT NOT NULL REFERENCES cabs(id),
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    speed FLOAT,
    heading FLOAT,
    recorded_at DATETIME DEFAULT GETDATE()
  )`,

  // Boarding status table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'boarding_status')
  CREATE TABLE boarding_status (
    id INT IDENTITY(1,1) PRIMARY KEY,
    request_id INT NOT NULL REFERENCES cab_requests(id),
    employee_id INT NOT NULL REFERENCES users(id),
    boarding_area NVARCHAR(500),
    dropping_area NVARCHAR(500),
    boarded_at DATETIME,
    dropped_at DATETIME,
    is_boarded BIT DEFAULT 0,
    is_dropped BIT DEFAULT 0,
    no_show BIT DEFAULT 0,
    no_show_reason NVARCHAR(500),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME
  )`,

  // Notifications table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'notifications')
  CREATE TABLE notifications (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    type NVARCHAR(50) NOT NULL,
    title NVARCHAR(255) NOT NULL,
    message NVARCHAR(1000) NOT NULL,
    data NVARCHAR(MAX),
    is_read BIT DEFAULT 0,
    read_at DATETIME,
    email_sent BIT DEFAULT 0,
    email_sent_at DATETIME,
    created_at DATETIME DEFAULT GETDATE()
  )`,

  // Audit logs table
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_logs')
  CREATE TABLE audit_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action NVARCHAR(100) NOT NULL,
    entity_type NVARCHAR(50),
    entity_id INT,
    old_values NVARCHAR(MAX),
    new_values NVARCHAR(MAX),
    ip_address NVARCHAR(50),
    user_agent NVARCHAR(500),
    created_at DATETIME DEFAULT GETDATE()
  )`,

  // Indexes for performance
  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_cab_requests_employee')
  CREATE INDEX idx_cab_requests_employee ON cab_requests(employee_id)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_cab_requests_status')
  CREATE INDEX idx_cab_requests_status ON cab_requests(status)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_cab_requests_pickup_time')
  CREATE INDEX idx_cab_requests_pickup_time ON cab_requests(pickup_time)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_cab_tracking_cab_recorded')
  CREATE INDEX idx_cab_tracking_cab_recorded ON cab_tracking(cab_id, recorded_at)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_notifications_user_read')
  CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_boarding_status_request')
  CREATE INDEX idx_boarding_status_request ON boarding_status(request_id)`,
];

const runMigrations = async () => {
  try {
    console.log('Starting database migrations...\n');
    
    const pool = await connectDB();
    
    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      try {
        await pool.request().query(migration);
        console.log(`✅ Migration ${i + 1}/${migrations.length} completed`);
      } catch (error) {
        console.log(`⚠️  Migration ${i + 1} skipped or already exists`);
        if (process.env.DEBUG === 'true') {
          console.error(error.message);
        }
      }
    }
    
    console.log('\n✅ All migrations completed');
    
    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigrations();
