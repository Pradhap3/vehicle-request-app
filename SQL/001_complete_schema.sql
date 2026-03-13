-- ============================================================================
-- AISIN Employee Transport Management System - Complete Database Schema
-- Database: Microsoft SQL Server / Azure SQL
-- ============================================================================

-- ============================================================================
-- 1. ROLES TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'roles')
CREATE TABLE roles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(50) NOT NULL UNIQUE,
  description NVARCHAR(255),
  permissions NVARCHAR(MAX), -- JSON array of permission strings
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 2. USERS TABLE (enhanced)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  employee_id NVARCHAR(50) UNIQUE,
  name NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL UNIQUE,
  phone NVARCHAR(20),
  department NVARCHAR(100),
  role NVARCHAR(50) NOT NULL DEFAULT 'EMPLOYEE'
    CHECK (role IN ('ADMIN','HR_ADMIN','EMPLOYEE','USER','CAB_DRIVER','DRIVER','SECURITY','VENDOR')),
  password_hash NVARCHAR(255) NOT NULL,
  auth_provider NVARCHAR(50) NOT NULL DEFAULT 'LOCAL'
    CHECK (auth_provider IN ('LOCAL','MICROSOFT')),
  external_subject NVARCHAR(255),
  preferred_language NVARCHAR(10) DEFAULT 'en',
  office_location NVARCHAR(255),
  office_latitude FLOAT,
  office_longitude FLOAT,
  profile_image_url NVARCHAR(500),
  last_login DATETIME,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 3. VENDORS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vendors')
CREATE TABLE vendors (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  contact_person NVARCHAR(255),
  email NVARCHAR(255),
  phone NVARCHAR(20),
  address NVARCHAR(500),
  contract_start DATE,
  contract_end DATE,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 4. VEHICLES TABLE (enhanced from cabs)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'vehicles')
CREATE TABLE vehicles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  vehicle_number NVARCHAR(20) NOT NULL UNIQUE,
  vehicle_type NVARCHAR(50) DEFAULT 'SEDAN'
    CHECK (vehicle_type IN ('SEDAN','SUV','VAN','BUS','MINI_BUS','HATCHBACK')),
  make NVARCHAR(100),
  model NVARCHAR(100),
  year INT,
  color NVARCHAR(50),
  capacity INT NOT NULL DEFAULT 4,
  fuel_type NVARCHAR(20) DEFAULT 'PETROL'
    CHECK (fuel_type IN ('PETROL','DIESEL','CNG','ELECTRIC','HYBRID')),
  insurance_expiry DATE,
  fitness_expiry DATE,
  permit_expiry DATE,
  vendor_id INT REFERENCES vendors(id),
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 5. DRIVERS TABLE (extends users with driver-specific fields)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'drivers')
CREATE TABLE drivers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id),
  vehicle_id INT REFERENCES vehicles(id),
  vendor_id INT REFERENCES vendors(id),
  license_number NVARCHAR(50),
  license_expiry DATE,
  badge_number NVARCHAR(50),
  availability_status NVARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
    CHECK (availability_status IN ('ONLINE','OFFLINE','ON_TRIP','ON_BREAK')),
  current_latitude FLOAT,
  current_longitude FLOAT,
  last_location_update DATETIME,
  rating_average DECIMAL(3,2) DEFAULT 0,
  total_trips INT DEFAULT 0,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 6. CABS TABLE (keep for backward compat, links to vehicles + drivers)
-- ============================================================================
-- The existing cabs table is kept as-is for backward compatibility.
-- New code should prefer vehicles + drivers tables.

-- Add columns to existing cabs if they don't exist
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'cabs')
BEGIN
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cabs') AND name = 'vehicle_id')
    ALTER TABLE cabs ADD vehicle_id INT REFERENCES vehicles(id);
END
GO

-- ============================================================================
-- 7. SHIFTS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'shifts')
CREATE TABLE shifts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  shift_code NVARCHAR(20) NOT NULL UNIQUE,
  name NVARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_minutes INT DEFAULT 15,
  pickup_before_minutes INT DEFAULT 60,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 8. ROUTES TABLE (enhanced)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'routes')
CREATE TABLE routes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  start_point NVARCHAR(255) NOT NULL,
  end_point NVARCHAR(255) NOT NULL,
  start_latitude FLOAT,
  start_longitude FLOAT,
  end_latitude FLOAT,
  end_longitude FLOAT,
  distance_km DECIMAL(10,2),
  estimated_time_minutes INT,
  trip_type NVARCHAR(50) DEFAULT 'INBOUND',
  standard_pickup_time NVARCHAR(10),
  zone NVARCHAR(100),
  max_capacity INT DEFAULT 4,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 9. ROUTE_STOPS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'route_stops')
CREATE TABLE route_stops (
  id INT IDENTITY(1,1) PRIMARY KEY,
  route_id INT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_name NVARCHAR(255) NOT NULL,
  stop_sequence INT NOT NULL,
  latitude FLOAT,
  longitude FLOAT,
  eta_offset_minutes INT DEFAULT 0,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 10. BOOKINGS TABLE (the new primary trip request entity)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'bookings')
CREATE TABLE bookings (
  id INT IDENTITY(1,1) PRIMARY KEY,
  booking_ref NVARCHAR(20) NOT NULL UNIQUE,
  employee_id INT NOT NULL REFERENCES users(id),
  route_id INT REFERENCES routes(id),
  shift_id INT REFERENCES shifts(id),
  pickup_location NVARCHAR(500),
  drop_location NVARCHAR(500),
  pickup_latitude FLOAT,
  pickup_longitude FLOAT,
  drop_latitude FLOAT,
  drop_longitude FLOAT,
  pickup_time DATETIME NOT NULL,
  passengers INT NOT NULL DEFAULT 1,
  purpose NVARCHAR(500),
  booking_type NVARCHAR(50) NOT NULL DEFAULT 'ADHOC'
    CHECK (booking_type IN ('ADHOC','SCHEDULED','RECURRING','SHIFT_BASED','POOL')),
  priority NVARCHAR(20) DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status NVARCHAR(50) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN (
      'REQUESTED','APPROVED','REJECTED','ASSIGNED','DRIVER_EN_ROUTE',
      'ARRIVED','PASSENGER_ONBOARD','IN_PROGRESS','COMPLETED',
      'CANCELLED','NO_SHOW','ESCALATED'
    )),
  approval_required BIT DEFAULT 0,
  approved_by INT REFERENCES users(id),
  approved_at DATETIME,
  cancellation_reason NVARCHAR(500),
  cancelled_by INT REFERENCES users(id),
  cancelled_at DATETIME,
  notes NVARCHAR(MAX),
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 11. TRIPS TABLE (execution record linked to a booking)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'trips')
CREATE TABLE trips (
  id INT IDENTITY(1,1) PRIMARY KEY,
  trip_ref NVARCHAR(20) NOT NULL UNIQUE,
  booking_id INT REFERENCES bookings(id),
  driver_id INT REFERENCES drivers(id),
  vehicle_id INT REFERENCES vehicles(id),
  route_id INT REFERENCES routes(id),
  status NVARCHAR(50) NOT NULL DEFAULT 'ASSIGNED'
    CHECK (status IN (
      'ASSIGNED','DRIVER_EN_ROUTE','ARRIVED','PASSENGER_ONBOARD',
      'IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW','ESCALATED'
    )),
  scheduled_pickup DATETIME,
  actual_pickup DATETIME,
  actual_dropoff DATETIME,
  pickup_location NVARCHAR(500),
  drop_location NVARCHAR(500),
  pickup_latitude FLOAT,
  pickup_longitude FLOAT,
  drop_latitude FLOAT,
  drop_longitude FLOAT,
  distance_km DECIMAL(10,2),
  duration_minutes INT,
  eta_minutes INT,
  start_odometer DECIMAL(10,2),
  end_odometer DECIMAL(10,2),
  assigned_by INT REFERENCES users(id),
  assigned_at DATETIME DEFAULT GETDATE(),
  completed_at DATETIME,
  notes NVARCHAR(MAX),
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 12. TRIP_PASSENGERS TABLE (for pooled/shared rides)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'trip_passengers')
CREATE TABLE trip_passengers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  booking_id INT REFERENCES bookings(id),
  employee_id INT NOT NULL REFERENCES users(id),
  pickup_stop_id INT REFERENCES route_stops(id),
  drop_stop_id INT REFERENCES route_stops(id),
  pickup_location NVARCHAR(500),
  drop_location NVARCHAR(500),
  status NVARCHAR(50) NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING','PICKED_UP','DROPPED','NO_SHOW','CANCELLED')),
  boarded_at DATETIME,
  dropped_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 13. TRIP_EVENTS TABLE (audit trail for trip state changes)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'trip_events')
CREATE TABLE trip_events (
  id INT IDENTITY(1,1) PRIMARY KEY,
  trip_id INT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event_type NVARCHAR(50) NOT NULL,
  from_status NVARCHAR(50),
  to_status NVARCHAR(50),
  latitude FLOAT,
  longitude FLOAT,
  metadata NVARCHAR(MAX), -- JSON
  performed_by INT REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 14. LIVE_LOCATIONS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'live_locations')
CREATE TABLE live_locations (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  driver_id INT NOT NULL REFERENCES drivers(id),
  trip_id INT REFERENCES trips(id),
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  speed FLOAT,
  heading FLOAT,
  accuracy FLOAT,
  altitude FLOAT,
  recorded_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 15. GATE_LOGS TABLE (security gate check-in/out)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'gate_logs')
CREATE TABLE gate_logs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  trip_id INT REFERENCES trips(id),
  booking_id INT REFERENCES bookings(id),
  vehicle_id INT REFERENCES vehicles(id),
  driver_id INT REFERENCES drivers(id),
  employee_id INT REFERENCES users(id),
  gate_code NVARCHAR(20) NOT NULL,
  action_type NVARCHAR(20) NOT NULL DEFAULT 'CHECK_IN'
    CHECK (action_type IN ('CHECK_IN','CHECK_OUT')),
  vehicle_number NVARCHAR(20),
  verification_status NVARCHAR(20) DEFAULT 'VERIFIED'
    CHECK (verification_status IN ('VERIFIED','MISMATCH','EXCEPTION','PENDING')),
  notes NVARCHAR(500),
  logged_by INT REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 16. INCIDENTS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'incidents')
CREATE TABLE incidents (
  id INT IDENTITY(1,1) PRIMARY KEY,
  incident_ref NVARCHAR(20) NOT NULL UNIQUE,
  trip_id INT REFERENCES trips(id),
  booking_id INT REFERENCES bookings(id),
  reported_by INT NOT NULL REFERENCES users(id),
  incident_type NVARCHAR(50) NOT NULL
    CHECK (incident_type IN (
      'SOS','ACCIDENT','BREAKDOWN','MISCONDUCT','DELAY',
      'SAFETY','ROUTE_DEVIATION','OTHER'
    )),
  severity NVARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  title NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  latitude FLOAT,
  longitude FLOAT,
  status NVARCHAR(50) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','CLOSED')),
  resolution NVARCHAR(MAX),
  resolved_by INT REFERENCES users(id),
  resolved_at DATETIME,
  escalated_to INT REFERENCES users(id),
  escalated_at DATETIME,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 17. RATINGS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ratings')
CREATE TABLE ratings (
  id INT IDENTITY(1,1) PRIMARY KEY,
  trip_id INT NOT NULL REFERENCES trips(id),
  booking_id INT REFERENCES bookings(id),
  rated_by INT NOT NULL REFERENCES users(id),
  driver_id INT REFERENCES drivers(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback NVARCHAR(1000),
  categories NVARCHAR(MAX), -- JSON: {punctuality: 5, safety: 4, behavior: 5}
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 18. NOTIFICATIONS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'notifications')
CREATE TABLE notifications (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  type NVARCHAR(50) NOT NULL,
  title NVARCHAR(255) NOT NULL,
  message NVARCHAR(MAX),
  data NVARCHAR(MAX), -- JSON payload
  channel NVARCHAR(20) DEFAULT 'IN_APP'
    CHECK (channel IN ('IN_APP','EMAIL','PUSH','SMS')),
  is_read BIT NOT NULL DEFAULT 0,
  read_at DATETIME,
  is_sent BIT NOT NULL DEFAULT 0,
  sent_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 19. AUDIT_LOGS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'audit_logs')
CREATE TABLE audit_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id INT REFERENCES users(id),
  action NVARCHAR(100) NOT NULL,
  entity_type NVARCHAR(50) NOT NULL,
  entity_id NVARCHAR(50),
  old_values NVARCHAR(MAX), -- JSON
  new_values NVARCHAR(MAX), -- JSON
  ip_address NVARCHAR(45),
  user_agent NVARCHAR(500),
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 20. SETTINGS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'settings')
CREATE TABLE settings (
  id INT IDENTITY(1,1) PRIMARY KEY,
  category NVARCHAR(50) NOT NULL,
  key_name NVARCHAR(100) NOT NULL,
  value NVARCHAR(MAX),
  description NVARCHAR(500),
  updated_by INT REFERENCES users(id),
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE(),
  UNIQUE(category, key_name)
);
GO

-- ============================================================================
-- 21. EMPLOYEE_TRANSPORT_PROFILES TABLE (existing, for backward compat)
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_transport_profiles')
CREATE TABLE employee_transport_profiles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES users(id),
  route_id INT REFERENCES routes(id),
  shift_id INT REFERENCES shifts(id),
  shift_code NVARCHAR(20),
  pickup_location NVARCHAR(500),
  drop_location NVARCHAR(500),
  pickup_latitude FLOAT,
  pickup_longitude FLOAT,
  drop_latitude FLOAT,
  drop_longitude FLOAT,
  auto_generate BIT DEFAULT 1,
  is_active BIT NOT NULL DEFAULT 1,
  effective_from DATE,
  effective_to DATE,
  last_generated_for DATE,
  created_at DATETIME NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 22. REFRESH_TOKENS TABLE
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'refresh_tokens')
CREATE TABLE refresh_tokens (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash NVARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  is_revoked BIT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Users
CREATE NONCLUSTERED INDEX IX_users_email ON users(email);
CREATE NONCLUSTERED INDEX IX_users_role ON users(role) WHERE is_active = 1;
CREATE NONCLUSTERED INDEX IX_users_employee_id ON users(employee_id);
CREATE NONCLUSTERED INDEX IX_users_auth ON users(auth_provider, external_subject);

-- Drivers
CREATE NONCLUSTERED INDEX IX_drivers_user_id ON drivers(user_id);
CREATE NONCLUSTERED INDEX IX_drivers_vehicle_id ON drivers(vehicle_id);
CREATE NONCLUSTERED INDEX IX_drivers_availability ON drivers(availability_status) WHERE is_active = 1;

-- Vehicles
CREATE NONCLUSTERED INDEX IX_vehicles_vendor ON vehicles(vendor_id) WHERE is_active = 1;
CREATE NONCLUSTERED INDEX IX_vehicles_number ON vehicles(vehicle_number);

-- Bookings
CREATE NONCLUSTERED INDEX IX_bookings_employee ON bookings(employee_id);
CREATE NONCLUSTERED INDEX IX_bookings_status ON bookings(status) WHERE is_active = 1;
CREATE NONCLUSTERED INDEX IX_bookings_pickup_time ON bookings(pickup_time);
CREATE NONCLUSTERED INDEX IX_bookings_ref ON bookings(booking_ref);
CREATE NONCLUSTERED INDEX IX_bookings_route ON bookings(route_id);
CREATE NONCLUSTERED INDEX IX_bookings_shift ON bookings(shift_id);

-- Trips
CREATE NONCLUSTERED INDEX IX_trips_booking ON trips(booking_id);
CREATE NONCLUSTERED INDEX IX_trips_driver ON trips(driver_id);
CREATE NONCLUSTERED INDEX IX_trips_status ON trips(status) WHERE is_active = 1;
CREATE NONCLUSTERED INDEX IX_trips_scheduled ON trips(scheduled_pickup);
CREATE NONCLUSTERED INDEX IX_trips_ref ON trips(trip_ref);

-- Trip passengers
CREATE NONCLUSTERED INDEX IX_trip_passengers_trip ON trip_passengers(trip_id);
CREATE NONCLUSTERED INDEX IX_trip_passengers_employee ON trip_passengers(employee_id);

-- Trip events
CREATE NONCLUSTERED INDEX IX_trip_events_trip ON trip_events(trip_id);
CREATE NONCLUSTERED INDEX IX_trip_events_type ON trip_events(event_type);

-- Live locations
CREATE NONCLUSTERED INDEX IX_live_locations_driver ON live_locations(driver_id, recorded_at DESC);
CREATE NONCLUSTERED INDEX IX_live_locations_trip ON live_locations(trip_id);

-- Gate logs
CREATE NONCLUSTERED INDEX IX_gate_logs_trip ON gate_logs(trip_id);
CREATE NONCLUSTERED INDEX IX_gate_logs_vehicle ON gate_logs(vehicle_number);
CREATE NONCLUSTERED INDEX IX_gate_logs_date ON gate_logs(created_at);

-- Incidents
CREATE NONCLUSTERED INDEX IX_incidents_trip ON incidents(trip_id);
CREATE NONCLUSTERED INDEX IX_incidents_reporter ON incidents(reported_by);
CREATE NONCLUSTERED INDEX IX_incidents_status ON incidents(status) WHERE is_active = 1;
CREATE NONCLUSTERED INDEX IX_incidents_ref ON incidents(incident_ref);

-- Ratings
CREATE NONCLUSTERED INDEX IX_ratings_trip ON ratings(trip_id);
CREATE NONCLUSTERED INDEX IX_ratings_driver ON ratings(driver_id);

-- Notifications
CREATE NONCLUSTERED INDEX IX_notifications_user ON notifications(user_id, is_read);
CREATE NONCLUSTERED INDEX IX_notifications_created ON notifications(created_at DESC);

-- Audit logs
CREATE NONCLUSTERED INDEX IX_audit_entity ON audit_logs(entity_type, entity_id);
CREATE NONCLUSTERED INDEX IX_audit_user ON audit_logs(user_id);
CREATE NONCLUSTERED INDEX IX_audit_date ON audit_logs(created_at DESC);

-- Settings
CREATE NONCLUSTERED INDEX IX_settings_category ON settings(category);

-- Refresh tokens
CREATE NONCLUSTERED INDEX IX_refresh_tokens_user ON refresh_tokens(user_id);
CREATE NONCLUSTERED INDEX IX_refresh_tokens_hash ON refresh_tokens(token_hash);
GO

PRINT 'Schema creation completed successfully.';
GO
