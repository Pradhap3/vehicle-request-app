/*
Manual DB updates for:
1) Driver <-> Route mapping
2) Route standard pickup time + trip type
3) Helpful indexes for auto-allocation and notification lookups
Run this in your target SQL Server database.
*/

-- 1) Driver-route mapping table
IF OBJECT_ID('dbo.driver_routes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.driver_routes (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    driver_id NVARCHAR(255) NULL,
    route_id NVARCHAR(255) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NULL DEFAULT GETDATE(),
    CONSTRAINT PK_driver_routes PRIMARY KEY (id)
  );
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_driver_routes_driver_route_active'
    AND object_id = OBJECT_ID('dbo.driver_routes')
)
BEGIN
  CREATE INDEX IX_driver_routes_driver_route_active
    ON dbo.driver_routes(driver_id, route_id, is_active);
END
GO

-- 2) Route standard trip metadata
IF COL_LENGTH('dbo.routes', 'trip_type') IS NULL
BEGIN
  ALTER TABLE dbo.routes
    ADD trip_type NVARCHAR(40) NULL;
END
GO

IF COL_LENGTH('dbo.routes', 'standard_pickup_time') IS NULL
BEGIN
  ALTER TABLE dbo.routes
    ADD standard_pickup_time NVARCHAR(20) NULL;
END
GO

-- Optional consistency constraint for trip_type values
IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_routes_trip_type'
)
BEGIN
  ALTER TABLE dbo.routes
  ADD CONSTRAINT CK_routes_trip_type
  CHECK (trip_type IS NULL OR trip_type IN ('PICKUP_TO_OFFICE', 'OFFICE_TO_DROP', 'PICKUP_TO_DROP'));
END
GO

-- 3) Helpful indexes
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_cab_requests_route_status_time'
    AND object_id = OBJECT_ID('dbo.cab_requests')
)
AND COL_LENGTH('dbo.cab_requests', 'requested_time') IS NOT NULL
BEGIN
  CREATE INDEX IX_cab_requests_route_status_time
    ON dbo.cab_requests(route_id, status, requested_time);
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_notifications_user_read_created'
    AND object_id = OBJECT_ID('dbo.notifications')
)
AND COL_LENGTH('dbo.notifications', 'user_id') IS NOT NULL
BEGIN
  CREATE INDEX IX_notifications_user_read_created
    ON dbo.notifications(user_id, is_read, created_at);
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_notifications_recipient_read_created'
    AND object_id = OBJECT_ID('dbo.notifications')
)
AND COL_LENGTH('dbo.notifications', 'recipient_id') IS NOT NULL
BEGIN
  CREATE INDEX IX_notifications_recipient_read_created
    ON dbo.notifications(recipient_id, is_read, created_at);
END
GO
