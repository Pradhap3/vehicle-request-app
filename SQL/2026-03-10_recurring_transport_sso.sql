/*
  AISIN Fleet Management System
  Deployment SQL for:
  - Microsoft SSO user linkage
  - recurring transport profiles
  - route stops
  - request type support

  Run on the target Azure SQL / SQL Server database before deploying the new backend.
*/

SET NOCOUNT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'route_stops')
  BEGIN
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
    );
  END;

  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_transport_profiles')
  BEGIN
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
    );
  END;

  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_route_stops_route_sequence')
  BEGIN
    CREATE INDEX idx_route_stops_route_sequence
      ON route_stops(route_id, stop_sequence);
  END;

  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_transport_profiles_employee_active')
  BEGIN
    CREATE INDEX idx_transport_profiles_employee_active
      ON employee_transport_profiles(employee_id, is_active);
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_code')
  BEGIN
    ALTER TABLE employee_transport_profiles
      ADD pending_shift_code NVARCHAR(40) NULL;
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_effective_from')
  BEGIN
    ALTER TABLE employee_transport_profiles
      ADD pending_shift_effective_from DATE NULL;
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_effective_to')
  BEGIN
    ALTER TABLE employee_transport_profiles
      ADD pending_shift_effective_to DATE NULL;
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_transport_profiles') AND name = 'pending_shift_requested_at')
  BEGIN
    ALTER TABLE employee_transport_profiles
      ADD pending_shift_requested_at DATETIME NULL;
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'auth_provider')
  BEGIN
    ALTER TABLE users
      ADD auth_provider NVARCHAR(50) NOT NULL
      CONSTRAINT DF_users_auth_provider DEFAULT 'LOCAL';
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'external_subject')
  BEGIN
    ALTER TABLE users
      ADD external_subject NVARCHAR(255);
  END;

  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_external_subject')
  BEGIN
    EXEC('
      CREATE INDEX idx_users_external_subject
      ON users(auth_provider, external_subject)
      WHERE external_subject IS NOT NULL
    ');
  END;

  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cab_requests') AND name = 'request_type')
  BEGIN
    ALTER TABLE cab_requests
      ADD request_type NVARCHAR(40) DEFAULT 'ADHOC';
  END;

  COMMIT TRANSACTION;
  PRINT 'Deployment SQL completed successfully.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
