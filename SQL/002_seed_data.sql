-- ============================================================================
-- SEED DATA - Demo users, vehicles, routes, shifts for local development
-- ============================================================================
-- Passwords are all 'password123' hashed with bcrypt (12 rounds)
-- Hash: $2a$12$LJ3C4WV8OXLn0H8QLZ0yOeHUbD3c3yGRqBn2Z3Q5X8V0Vy6kWqiGe

-- ============================================================================
-- ROLES
-- ============================================================================
SET IDENTITY_INSERT roles ON;
INSERT INTO roles (id, name, description, permissions) VALUES
  (1, 'ADMIN', 'System Administrator', '["*"]'),
  (2, 'HR_ADMIN', 'HR Administrator', '["users.*","trips.*","reports.*","drivers.*","vehicles.*","routes.*"]'),
  (3, 'EMPLOYEE', 'Employee', '["bookings.own","trips.own","profile.own"]'),
  (4, 'CAB_DRIVER', 'Driver', '["trips.assigned","location.update","status.update"]'),
  (5, 'SECURITY', 'Security Gate Staff', '["gate.*","trips.verify"]'),
  (6, 'VENDOR', 'Transport Vendor', '["drivers.own","vehicles.own"]');
SET IDENTITY_INSERT roles OFF;
GO

-- ============================================================================
-- USERS
-- ============================================================================
-- Password for all users: password123
DECLARE @pwHash NVARCHAR(255) = '$2a$12$LJ3C4WV8OXLn0H8QLZ0yOeHUbD3c3yGRqBn2Z3Q5X8V0Vy6kWqiGe';

INSERT INTO users (employee_id, name, email, phone, department, role, password_hash, auth_provider, is_active) VALUES
  ('ADM001', 'System Admin', 'admin@aisin.co.in', '9876543210', 'IT', 'ADMIN', @pwHash, 'LOCAL', 1),
  ('HR001', 'Priya Sharma', 'hr@aisin.co.in', '9876543211', 'Human Resources', 'HR_ADMIN', @pwHash, 'LOCAL', 1),
  ('EMP001', 'Rahul Kumar', 'rahul@aisin.co.in', '9876543212', 'Engineering', 'EMPLOYEE', @pwHash, 'LOCAL', 1),
  ('EMP002', 'Anita Desai', 'anita@aisin.co.in', '9876543213', 'Finance', 'EMPLOYEE', @pwHash, 'LOCAL', 1),
  ('EMP003', 'Vikram Singh', 'vikram@aisin.co.in', '9876543214', 'Manufacturing', 'EMPLOYEE', @pwHash, 'LOCAL', 1),
  ('EMP004', 'Meera Nair', 'meera@aisin.co.in', '9876543215', 'Quality', 'EMPLOYEE', @pwHash, 'LOCAL', 1),
  ('EMP005', 'Arjun Reddy', 'arjun@aisin.co.in', '9876543216', 'R&D', 'EMPLOYEE', @pwHash, 'LOCAL', 1),
  ('DRV001', 'Rajesh Driver', 'driver1@aisin.co.in', '9876543220', 'Transport', 'CAB_DRIVER', @pwHash, 'LOCAL', 1),
  ('DRV002', 'Suresh Kumar', 'driver2@aisin.co.in', '9876543221', 'Transport', 'CAB_DRIVER', @pwHash, 'LOCAL', 1),
  ('DRV003', 'Manoj Yadav', 'driver3@aisin.co.in', '9876543222', 'Transport', 'CAB_DRIVER', @pwHash, 'LOCAL', 1),
  ('SEC001', 'Gate Security', 'security@aisin.co.in', '9876543230', 'Security', 'SECURITY', @pwHash, 'LOCAL', 1);
GO

-- ============================================================================
-- VENDORS
-- ============================================================================
INSERT INTO vendors (name, contact_person, email, phone, address, contract_start, contract_end) VALUES
  ('Metro Cabs Pvt Ltd', 'Ravi Prasad', 'ravi@metrocabs.com', '9800000001', 'Bangalore, Karnataka', '2025-01-01', '2026-12-31'),
  ('SafeRide Transport', 'Deepa Menon', 'deepa@saferide.com', '9800000002', 'Chennai, Tamil Nadu', '2025-01-01', '2026-12-31');
GO

-- ============================================================================
-- VEHICLES
-- ============================================================================
INSERT INTO vehicles (vehicle_number, vehicle_type, make, model, year, color, capacity, fuel_type, vendor_id) VALUES
  ('KA01AB1234', 'SEDAN', 'Toyota', 'Etios', 2023, 'White', 4, 'DIESEL', 1),
  ('KA01CD5678', 'SUV', 'Toyota', 'Innova', 2023, 'Silver', 7, 'DIESEL', 1),
  ('KA01EF9012', 'VAN', 'Force', 'Traveller', 2022, 'White', 12, 'DIESEL', 2),
  ('KA01GH3456', 'SEDAN', 'Maruti', 'Dzire', 2024, 'Grey', 4, 'CNG', 1),
  ('KA01IJ7890', 'MINI_BUS', 'Tata', 'Winger', 2023, 'Blue', 15, 'DIESEL', 2);
GO

-- ============================================================================
-- DRIVERS (linked to users and vehicles)
-- ============================================================================
INSERT INTO drivers (user_id, vehicle_id, vendor_id, license_number, license_expiry, badge_number, availability_status) VALUES
  ((SELECT id FROM users WHERE employee_id = 'DRV001'), 1, 1, 'KA0120230001234', '2028-06-30', 'B001', 'ONLINE'),
  ((SELECT id FROM users WHERE employee_id = 'DRV002'), 2, 1, 'KA0120230005678', '2027-12-31', 'B002', 'OFFLINE'),
  ((SELECT id FROM users WHERE employee_id = 'DRV003'), 3, 2, 'TN0120220009012', '2028-03-15', 'B003', 'OFFLINE');
GO

-- ============================================================================
-- SHIFTS
-- ============================================================================
INSERT INTO shifts (shift_code, name, start_time, end_time, grace_minutes, pickup_before_minutes) VALUES
  ('GEN', 'General Shift', '09:00', '18:00', 15, 60),
  ('MOR', 'Morning Shift', '06:00', '14:00', 15, 60),
  ('AFT', 'Afternoon Shift', '14:00', '22:00', 15, 60),
  ('NGT', 'Night Shift', '22:00', '06:00', 15, 60),
  ('FLX', 'Flexible', '10:00', '19:00', 30, 60);
GO

-- ============================================================================
-- ROUTES
-- ============================================================================
INSERT INTO routes (name, start_point, end_point, start_latitude, start_longitude, end_latitude, end_longitude, distance_km, estimated_time_minutes, trip_type, zone) VALUES
  ('Whitefield to AISIN Plant', 'Whitefield Bus Stop', 'AISIN Bidadi Plant', 12.9698, 77.7500, 12.7990, 77.3880, 45.0, 75, 'INBOUND', 'East Zone'),
  ('Electronic City to AISIN Plant', 'Electronic City Phase 1', 'AISIN Bidadi Plant', 12.8456, 77.6603, 12.7990, 77.3880, 35.0, 55, 'INBOUND', 'South Zone'),
  ('Majestic to AISIN Plant', 'Majestic Bus Stand', 'AISIN Bidadi Plant', 12.9766, 77.5713, 12.7990, 77.3880, 30.0, 50, 'INBOUND', 'Central Zone'),
  ('AISIN Plant to Whitefield', 'AISIN Bidadi Plant', 'Whitefield Bus Stop', 12.7990, 77.3880, 12.9698, 77.7500, 45.0, 75, 'OUTBOUND', 'East Zone'),
  ('AISIN Plant to Electronic City', 'AISIN Bidadi Plant', 'Electronic City Phase 1', 12.7990, 77.3880, 12.8456, 77.6603, 35.0, 55, 'OUTBOUND', 'South Zone');
GO

-- ============================================================================
-- ROUTE STOPS
-- ============================================================================
INSERT INTO route_stops (route_id, stop_name, stop_sequence, latitude, longitude, eta_offset_minutes) VALUES
  (1, 'Whitefield Bus Stop', 1, 12.9698, 77.7500, 0),
  (1, 'ITPL Main Gate', 2, 12.9857, 77.7286, 10),
  (1, 'Marathahalli Bridge', 3, 12.9562, 77.6996, 20),
  (1, 'Silk Board Junction', 4, 12.9172, 77.6230, 35),
  (1, 'NICE Road Entry', 5, 12.8800, 77.5500, 50),
  (1, 'AISIN Bidadi Plant', 6, 12.7990, 77.3880, 75),
  (2, 'Electronic City Phase 1', 1, 12.8456, 77.6603, 0),
  (2, 'Bommasandra', 2, 12.8152, 77.6381, 10),
  (2, 'NICE Road Junction', 3, 12.8200, 77.5400, 25),
  (2, 'AISIN Bidadi Plant', 4, 12.7990, 77.3880, 55);
GO

-- ============================================================================
-- SETTINGS (default config)
-- ============================================================================
INSERT INTO settings (category, key_name, value, description) VALUES
  ('booking', 'advance_booking_hours', '24', 'Maximum hours in advance a booking can be made'),
  ('booking', 'cancellation_window_minutes', '60', 'Minutes before pickup when cancellation is free'),
  ('booking', 'max_passengers_per_booking', '10', 'Maximum passengers per booking'),
  ('booking', 'approval_required_for_adhoc', 'false', 'Require admin approval for ad-hoc bookings'),
  ('trip', 'no_show_wait_minutes', '10', 'Minutes driver waits before marking no-show'),
  ('trip', 'auto_complete_after_minutes', '180', 'Auto-complete trip after this many minutes'),
  ('safety', 'sos_alert_recipients', 'admin@aisin.co.in,hr@aisin.co.in', 'Comma-separated emails for SOS alerts'),
  ('safety', 'late_night_start_hour', '22', 'Hour when late-night safety protocol begins'),
  ('safety', 'late_night_end_hour', '6', 'Hour when late-night safety protocol ends'),
  ('geofence', 'office_latitude', '12.7990', 'Office latitude for geofence checks'),
  ('geofence', 'office_longitude', '77.3880', 'Office longitude for geofence checks'),
  ('geofence', 'office_radius_km', '1.0', 'Geofence radius in kilometers'),
  ('notification', 'trip_reminder_minutes', '30', 'Minutes before trip to send reminder'),
  ('notification', 'driver_arrival_notify', 'true', 'Notify employee when driver arrives');
GO

PRINT 'Seed data inserted successfully.';
GO
