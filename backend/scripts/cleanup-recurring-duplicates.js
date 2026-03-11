require('dotenv').config();

const { connectDB, closeDB, sql } = require('../src/config/database');

const ACTIVE_STATUSES = ['IN_PROGRESS', 'ASSIGNED', 'APPROVED', 'PENDING', 'COMPLETED'];
const CANCELLABLE_STATUSES = ['PENDING', 'APPROVED', 'ASSIGNED'];
const RECURRING_TYPES = ['RECURRING_INBOUND', 'RECURRING_OUTBOUND'];
const applyChanges = process.argv.includes('--apply');

const statusPriority = (status) => {
  const priorities = {
    IN_PROGRESS: 6,
    ASSIGNED: 5,
    APPROVED: 4,
    PENDING: 3,
    COMPLETED: 2,
    CANCELLED: 1,
    REJECTED: 0
  };
  return priorities[String(status || '').toUpperCase()] ?? -1;
};

const sortRequests = (a, b) => {
  const statusDelta = statusPriority(b.status) - statusPriority(a.status);
  if (statusDelta !== 0) return statusDelta;
  const aTime = new Date(a.pickup_time || a.created_at || 0).getTime();
  const bTime = new Date(b.pickup_time || b.created_at || 0).getTime();
  return bTime - aTime;
};

const sortNotifications = (a, b) =>
  new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

const main = async () => {
  const pool = await connectDB();
  let cancelledRequests = 0;
  let deletedNotifications = 0;

  try {
    console.log(applyChanges ? 'Applying recurring duplicate cleanup...' : 'Dry run: recurring duplicate cleanup...');

    const requestResult = await pool.request().query(`
      SELECT
        id,
        employee_id,
        request_type,
        status,
        pickup_time,
        created_at,
        CAST(pickup_time AS DATE) AS trip_date
      FROM cab_requests
      WHERE request_type IN ('RECURRING_INBOUND', 'RECURRING_OUTBOUND')
      ORDER BY employee_id, CAST(pickup_time AS DATE), request_type, created_at DESC
    `);

    const requestGroups = new Map();
    for (const row of requestResult.recordset) {
      const key = `${row.employee_id}|${String(row.trip_date).slice(0, 10)}|${row.request_type}`;
      if (!requestGroups.has(key)) requestGroups.set(key, []);
      requestGroups.get(key).push(row);
    }

    for (const [key, rows] of requestGroups.entries()) {
      const activeRows = rows.filter((row) => ACTIVE_STATUSES.includes(String(row.status || '').toUpperCase()));
      if (activeRows.length <= 1) continue;

      const sorted = [...activeRows].sort(sortRequests);
      const keeper = sorted[0];
      const duplicates = sorted.slice(1).filter((row) => CANCELLABLE_STATUSES.includes(String(row.status || '').toUpperCase()));
      if (duplicates.length === 0) continue;

      console.log(`Requests ${key}: keep ${keeper.id}, cancel ${duplicates.map((row) => row.id).join(', ')}`);

      if (applyChanges) {
        for (const duplicate of duplicates) {
          await pool.request()
            .input('id', sql.Int, duplicate.id)
            .input('reason', sql.NVarChar(500), 'Cancelled by recurring duplicate cleanup')
            .query(`
              UPDATE cab_requests
              SET status = 'CANCELLED',
                  notes = ISNULL(notes, '') + '; CANCELLED: ' + @reason,
                  updated_at = GETDATE()
              WHERE id = @id AND status IN ('PENDING', 'APPROVED', 'ASSIGNED')
            `);
          cancelledRequests += 1;
        }
      }
    }

    const notificationResult = await pool.request().query(`
      SELECT
        id,
        user_id,
        type,
        created_at
      FROM notifications
      WHERE type IN ('RECURRING_INBOUND_TRIP_CREATED', 'RECURRING_OUTBOUND_TRIP_CREATED')
      ORDER BY user_id, type, created_at DESC
    `);

    const notificationGroups = new Map();
    for (const row of notificationResult.recordset) {
      const dateKey = new Date(row.created_at).toISOString().slice(0, 10);
      const key = `${row.user_id}|${dateKey}|${row.type}`;
      if (!notificationGroups.has(key)) notificationGroups.set(key, []);
      notificationGroups.get(key).push(row);
    }

    for (const [key, rows] of notificationGroups.entries()) {
      if (rows.length <= 1) continue;
      const sorted = [...rows].sort(sortNotifications);
      const duplicates = sorted.slice(1);
      console.log(`Notifications ${key}: keep ${sorted[0].id}, delete ${duplicates.map((row) => row.id).join(', ')}`);

      if (applyChanges) {
        for (const duplicate of duplicates) {
          await pool.request()
            .input('id', sql.Int, duplicate.id)
            .query(`DELETE FROM notifications WHERE id = @id`);
          deletedNotifications += 1;
        }
      }
    }

    console.log(applyChanges
      ? `Cleanup complete. Cancelled requests: ${cancelledRequests}, deleted notifications: ${deletedNotifications}`
      : 'Dry run complete. Re-run with --apply to persist changes.');
  } finally {
    await closeDB();
  }
};

main().catch(async (error) => {
  console.error('Recurring cleanup failed:', error.message);
  await closeDB();
  process.exit(1);
});
