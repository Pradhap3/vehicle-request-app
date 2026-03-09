-- Optional setup for shift-based cab delay monitoring
-- Execute manually in your target database.

-- 1) Ensure routes has trip_type column (used as fallback for shift resolution)
IF COL_LENGTH('dbo.routes', 'trip_type') IS NULL
BEGIN
  ALTER TABLE dbo.routes ADD trip_type NVARCHAR(40) NULL;
END
GO

-- 2) Optional direct shift column on cabs
IF COL_LENGTH('dbo.cabs', 'shift_type') IS NULL
BEGIN
  ALTER TABLE dbo.cabs ADD shift_type NVARCHAR(20) NULL;
END
GO

-- 3) Optional mapping table (preferred for clean assignment)
IF OBJECT_ID('dbo.cab_shift_assignments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cab_shift_assignments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    cab_id INT NOT NULL,
    shift_code NVARCHAR(20) NOT NULL, -- SHIFT_1 / SHIFT_2 / SHIFT_3 / GENERAL
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NULL
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_cab_shift_assignments_cab_active'
    AND object_id = OBJECT_ID('dbo.cab_shift_assignments')
)
BEGIN
  CREATE INDEX IX_cab_shift_assignments_cab_active
    ON dbo.cab_shift_assignments (cab_id, is_active);
END
GO

-- 4) Sample shift mapping
-- Replace cab IDs and shift codes as needed
-- UPDATE dbo.cabs SET shift_type = 'GENERAL' WHERE id = 1;
-- INSERT INTO dbo.cab_shift_assignments (cab_id, shift_code, is_active) VALUES (1, 'SHIFT_1', 1);
-- INSERT INTO dbo.cab_shift_assignments (cab_id, shift_code, is_active) VALUES (2, 'SHIFT_2', 1);
-- INSERT INTO dbo.cab_shift_assignments (cab_id, shift_code, is_active) VALUES (3, 'SHIFT_3', 1);
