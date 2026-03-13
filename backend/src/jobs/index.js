const cron = require('node-cron');
const logger = require('../utils/logger');
const EmailService = require('../services/EmailService');
const SmartAllocationService = require('../ai/SmartAllocationService');
const DelayMonitoringService = require('../services/DelayMonitoringService');
const RecurringTransportService = require('../services/RecurringTransportService');
const LiveLocation = require('../models/LiveLocation');
const { getPool } = require('../config/database');

const setupCronJobs = (io) => {
  const autoAssignWindowMinutes = parseInt(process.env.AUTO_ASSIGN_WINDOW_MINUTES || '30', 10);

  // Process pending email notifications every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await EmailService.processPendingEmails();
      if (result.processed > 0) {
        logger.info(`Processed ${result.processed} email notifications`);
      }
    } catch (error) {
      logger.error('Email processing cron error:', error);
    }
  });

  // Generate recurring transport trips every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await RecurringTransportService.ensureDailyTrips(new Date(), { io });
      if (result.success && result.generatedCount > 0) {
        logger.info(`Generated ${result.generatedCount} recurring commute request(s)`);
      }
    } catch (error) {
      logger.error('Recurring transport cron error:', error);
    }
  });

  // Auto-assign upcoming rides every minute
  cron.schedule('* * * * *', async () => {
    try {
      const result = await SmartAllocationService.autoAllocateUpcomingRequests(autoAssignWindowMinutes);
      if (result.success && result.totalAllocations > 0) {
        logger.info(`Auto-assigned ${result.totalAllocations} request(s)`);
      }
    } catch (error) {
      logger.error('Auto assignment cron error:', error);
    }
  });

  // Trip reminders - 30 minutes before pickup
  cron.schedule('*/5 * * * *', async () => {
    try {
      const pool = getPool();
      const result = await pool.request().query(`
        SELECT b.id, b.booking_ref, b.employee_id, b.pickup_time, b.pickup_location,
               u.name AS employee_name
        FROM bookings b
        JOIN users u ON u.id = b.employee_id
        WHERE b.status IN ('ASSIGNED','APPROVED')
          AND b.is_active = 1
          AND b.pickup_time BETWEEN GETDATE() AND DATEADD(MINUTE, 35, GETDATE())
          AND b.pickup_time > DATEADD(MINUTE, 25, GETDATE())
      `);

      for (const booking of result.recordset) {
        try {
          const Notification = require('../models/Notification');
          await Notification.create({
            user_id: booking.employee_id,
            type: 'TRIP_REMINDER',
            title: 'Trip reminder',
            message: `Your ride from ${booking.pickup_location} is in ~30 minutes`,
            data: { bookingId: booking.id, bookingRef: booking.booking_ref }
          });
          if (io) {
            io.to(`user_${booking.employee_id}`).emit('trip_reminder', {
              booking_id: booking.id, pickup_time: booking.pickup_time
            });
          }
        } catch (err) {
          logger.error(`Failed to send reminder for booking ${booking.id}:`, err);
        }
      }
    } catch (error) {
      logger.error('Trip reminder cron error:', error);
    }
  });

  // Stale trip detection - mark trips as NO_SHOW if not started within grace period
  cron.schedule('*/10 * * * *', async () => {
    try {
      const pool = getPool();
      const result = await pool.request().query(`
        UPDATE trips SET status = 'NO_SHOW', updated_at = GETDATE()
        OUTPUT INSERTED.id
        WHERE status = 'ARRIVED'
          AND is_active = 1
          AND DATEDIFF(MINUTE, scheduled_pickup, GETDATE()) > 15
      `);
      if (result.recordset.length > 0) {
        logger.info(`Marked ${result.recordset.length} trip(s) as NO_SHOW (stale)`);
      }
    } catch (error) {
      logger.error('Stale trip detection cron error:', error);
    }
  });

  // Monitor cab shift delays every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await DelayMonitoringService.monitorCabShiftDelays({ io });
      if (result.success && result.alerts > 0) {
        logger.info(`Shift delay monitor raised ${result.alerts} alert(s)`);
      }
    } catch (error) {
      logger.error('Shift delay monitor cron error:', error);
    }
  });

  // Traffic check for AI-enabled routes
  if (process.env.ENABLE_AI_FEATURES === 'true') {
    cron.schedule('*/10 * * * *', async () => {
      try {
        const Route = require('../models/Route');
        const routes = await Route.findAll();
        for (const route of routes) {
          if (route.start_latitude && route.end_latitude) {
            await SmartAllocationService.checkTrafficAndNotify(route.id);
          }
        }
      } catch (error) {
        logger.error('Traffic check cron error:', error);
      }
    });
  }

  // Nightly summary report at 11 PM
  cron.schedule('0 23 * * *', async () => {
    try {
      const pool = getPool();
      const today = new Date().toISOString().split('T')[0];
      const summary = await pool.request().input('date', require('mssql').Date, today).query(`
        SELECT
          COUNT(*) AS total_trips,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_shows
        FROM bookings WHERE CAST(pickup_time AS DATE) = @date AND is_active = 1
      `);
      logger.info('Nightly summary:', summary.recordset[0]);

      if (io) {
        io.to('HR_ADMIN').to('ADMIN').emit('nightly_summary', {
          date: today, ...summary.recordset[0]
        });
      }
    } catch (error) {
      logger.error('Nightly summary cron error:', error);
    }
  });

  // Cleanup old location data weekly (Sunday 3 AM)
  cron.schedule('0 3 * * 0', async () => {
    try {
      const deleted = await LiveLocation.cleanup(14);
      logger.info(`Location cleanup: removed ${deleted} old records`);
    } catch (error) {
      logger.error('Location cleanup cron error:', error);
    }
  });

  logger.info('All cron jobs scheduled');
};

module.exports = { setupCronJobs };
