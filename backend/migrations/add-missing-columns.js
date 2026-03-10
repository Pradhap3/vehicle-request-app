// migrations/add-missing-columns.js
// Run this to add missing columns to existing tables
// Usage: node migrations/add-missing-columns.js

require('dotenv').config();
const { connectDB, closeDB, getPool } = require('../src/config/database');

const alterations = [
  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'route_stops')
   CREATE TABLE route_stops (
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
   )`,

  `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_transport_profiles')
   CREATE TABLE employee_transport_profiles (
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
     created_at DATETIME DEFAULT GETDATE(),
     updated_at DATETIME DEFAULT GETDATE()
   )`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_route_stops_route_sequence')
   CREATE INDEX idx_route_stops_route_sequence ON route_stops(route_id, stop_sequence)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_transport_profiles_employee_active')
   CREATE INDEX idx_transport_profiles_employee_active ON employee_transport_profiles(employee_id, is_active)`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_code')
   ALTER TABLE employee_transport_profiles ADD pending_shift_code NVARCHAR(40) NULL`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_effective_from')
   ALTER TABLE employee_transport_profiles ADD pending_shift_effective_from DATE NULL`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_effective_to')
   ALTER TABLE employee_transport_profiles ADD pending_shift_effective_to DATE NULL`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_requested_at')
   ALTER TABLE employee_transport_profiles ADD pending_shift_requested_at DATETIME NULL`,

  // Notifications table - add missing columns
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'user_id')
   ALTER TABLE notifications ADD user_id NVARCHAR(255)`,
  
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'email_sent')
   ALTER TABLE notifications ADD email_sent BIT DEFAULT 0`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'email_sent_at')
   ALTER TABLE notifications ADD email_sent_at DATETIME`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'type')
   ALTER TABLE notifications ADD type NVARCHAR(50)`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'title')
   ALTER TABLE notifications ADD title NVARCHAR(255)`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'message')
   ALTER TABLE notifications ADD message NVARCHAR(MAX)`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'data')
   ALTER TABLE notifications ADD data NVARCHAR(MAX)`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'is_read')
   ALTER TABLE notifications ADD is_read BIT DEFAULT 0`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'read_at')
   ALTER TABLE notifications ADD read_at DATETIME`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('notifications') AND name = 'created_at')
   ALTER TABLE notifications ADD created_at DATETIME DEFAULT GETDATE()`,

  // Users table - add missing columns
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'preferred_language')
   ALTER TABLE users ADD preferred_language NVARCHAR(10) DEFAULT 'en'`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'last_login')
   ALTER TABLE users ADD last_login DATETIME`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'auth_provider')
   ALTER TABLE users ADD auth_provider NVARCHAR(50) NOT NULL CONSTRAINT DF_users_auth_provider DEFAULT 'LOCAL'`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'external_subject')
   ALTER TABLE users ADD external_subject NVARCHAR(255)`,

  `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_external_subject')
   CREATE INDEX idx_users_external_subject ON users(auth_provider, external_subject) WHERE external_subject IS NOT NULL`,

  // Cabs table - add missing columns  
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cabs') AND name = 'last_location_update')
   ALTER TABLE cabs ADD last_location_update DATETIME`,

  // Cab requests - add missing columns
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cab_requests') AND name = 'priority')
   ALTER TABLE cab_requests ADD priority NVARCHAR(20) DEFAULT 'NORMAL'`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cab_requests') AND name = 'actual_pickup_time')
   ALTER TABLE cab_requests ADD actual_pickup_time DATETIME`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cab_requests') AND name = 'actual_dropoff_time')
   ALTER TABLE cab_requests ADD actual_dropoff_time DATETIME`,
   
  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cab_requests') AND name = 'delay_reason')
   ALTER TABLE cab_requests ADD delay_reason NVARCHAR(500)`,

  `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cab_requests') AND name = 'request_type')
   ALTER TABLE cab_requests ADD request_type NVARCHAR(40) DEFAULT 'ADHOC'`,
];

async function runMigrations() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    const pool = getPool();
    
    console.log('Running migrations to add missing columns...\n');
    
    for (const sql of alterations) {
      try {
        await pool.request().query(sql);
        // Extract column name from SQL for logging
        const match = sql.match(/name = '(\w+)'/);
        if (match) {
          console.log(`✓ Checked/Added column: ${match[1]}`);
        }
      } catch (error) {
        console.log(`⚠ Warning: ${error.message}`);
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

runMigrations();
