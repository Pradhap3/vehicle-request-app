const logger = require('../utils/logger');
const Driver = require('../models/Driver');
const LiveLocation = require('../models/LiveLocation');

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join room based on user role
    socket.on('join_role', (data) => {
      const room = typeof data === 'string' ? data : (data && (data.room || data.role || data.name)) || 'unknown';
      socket.join(room);
      if (data && data.userId) {
        socket.join(`user_${data.userId}`);
      }
      if (data && data.driverId) {
        socket.join(`driver_${data.driverId}`);
      }
      logger.info(`Socket ${socket.id} joined room: ${room}`);
    });

    // Driver location updates (from mobile app)
    socket.on('driver_location', async (data) => {
      try {
        const { driver_id, latitude, longitude, speed, heading, accuracy, altitude, trip_id } = data;

        if (driver_id && latitude && longitude) {
          // Update driver position in DB
          await Driver.updateLocation(driver_id, latitude, longitude);

          // Record location trail
          await LiveLocation.record({
            driver_id, trip_id, latitude, longitude, speed, heading, accuracy, altitude
          });
        }

        // Broadcast to admins
        io.to('HR_ADMIN').to('ADMIN').emit('cab_location_update', data);

        // Broadcast to specific trip watchers
        if (trip_id) {
          io.emit(`trip_location_${trip_id}`, { latitude, longitude, speed, heading });
        }
      } catch (error) {
        logger.error('Socket driver_location error:', error);
      }
    });

    // Trip status updates
    socket.on('trip_status', (data) => {
      io.to('HR_ADMIN').to('ADMIN').emit('trip_status_update', data);
      if (data.employee_id) {
        io.to(`user_${data.employee_id}`).emit('trip_status_update', data);
      }
    });

    // Driver availability change
    socket.on('driver_availability', async (data) => {
      try {
        const { driver_id, status } = data;
        if (driver_id && status) {
          await Driver.updateAvailability(driver_id, status);
          io.to('HR_ADMIN').to('ADMIN').emit('driver_status_change', data);
        }
      } catch (error) {
        logger.error('Socket driver_availability error:', error);
      }
    });

    // SOS alert
    socket.on('sos_alert', (data) => {
      logger.warn('SOS ALERT received:', data);
      io.to('HR_ADMIN').to('ADMIN').to('SECURITY').emit('sos_alert', {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    // Join trip room for live tracking
    socket.on('watch_trip', (tripId) => {
      socket.join(`trip_${tripId}`);
      logger.info(`Socket ${socket.id} watching trip ${tripId}`);
    });

    socket.on('unwatch_trip', (tripId) => {
      socket.leave(`trip_${tripId}`);
    });

    // Gate activity
    socket.on('gate_scan', (data) => {
      io.to('SECURITY').to('HR_ADMIN').to('ADMIN').emit('gate_activity', data);
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });
};

module.exports = { setupSocketHandlers };
