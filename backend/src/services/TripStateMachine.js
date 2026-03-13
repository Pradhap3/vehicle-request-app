const { sql, getPool } = require('../config/database');
const TripEvent = require('../models/TripEvent');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// Valid trip state transitions
const TRANSITIONS = {
  ASSIGNED:          ['DRIVER_EN_ROUTE', 'CANCELLED'],
  DRIVER_EN_ROUTE:   ['ARRIVED', 'CANCELLED'],
  ARRIVED:           ['PASSENGER_ONBOARD', 'NO_SHOW', 'CANCELLED'],
  PASSENGER_ONBOARD: ['IN_PROGRESS'],
  IN_PROGRESS:       ['COMPLETED', 'ESCALATED'],
  COMPLETED:         [],
  CANCELLED:         [],
  NO_SHOW:           [],
  ESCALATED:         ['RESOLVED', 'COMPLETED']
};

class TripStateMachine {
  static generateRef() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TR${ts}${rand}`.slice(0, 12);
  }

  static canTransition(fromStatus, toStatus) {
    const allowed = TRANSITIONS[fromStatus];
    return allowed && allowed.includes(toStatus);
  }

  static async createTrip(data) {
    const pool = getPool();
    const ref = this.generateRef();
    const result = await pool.request()
      .input('ref', sql.NVarChar(20), ref)
      .input('bookingId', sql.Int, data.booking_id || null)
      .input('driverId', sql.Int, data.driver_id)
      .input('vehicleId', sql.Int, data.vehicle_id || null)
      .input('routeId', sql.Int, data.route_id || null)
      .input('scheduledPickup', sql.DateTime, data.scheduled_pickup ? new Date(data.scheduled_pickup) : null)
      .input('pickupLocation', sql.NVarChar(500), data.pickup_location || null)
      .input('dropLocation', sql.NVarChar(500), data.drop_location || null)
      .input('pickupLat', sql.Float, data.pickup_latitude || null)
      .input('pickupLng', sql.Float, data.pickup_longitude || null)
      .input('dropLat', sql.Float, data.drop_latitude || null)
      .input('dropLng', sql.Float, data.drop_longitude || null)
      .input('assignedBy', sql.Int, data.assigned_by || null)
      .query(`
        INSERT INTO trips (
          trip_ref, booking_id, driver_id, vehicle_id, route_id, status,
          scheduled_pickup, pickup_location, drop_location,
          pickup_latitude, pickup_longitude, drop_latitude, drop_longitude,
          assigned_by, assigned_at
        ) OUTPUT INSERTED.*
        VALUES (
          @ref, @bookingId, @driverId, @vehicleId, @routeId, 'ASSIGNED',
          @scheduledPickup, @pickupLocation, @dropLocation,
          @pickupLat, @pickupLng, @dropLat, @dropLng,
          @assignedBy, GETDATE()
        )
      `);

    const trip = result.recordset[0];

    await TripEvent.create({
      trip_id: trip.id,
      event_type: 'TRIP_CREATED',
      to_status: 'ASSIGNED',
      performed_by: data.assigned_by,
      metadata: { booking_id: data.booking_id }
    });

    // Update booking status if linked
    if (data.booking_id) {
      await pool.request()
        .input('bookingId', sql.Int, data.booking_id)
        .query(`UPDATE bookings SET status = 'ASSIGNED', updated_at = GETDATE() WHERE id = @bookingId`);
    }

    return trip;
  }

  static async transition(tripId, toStatus, userId, extra = {}) {
    const pool = getPool();

    // Get current trip
    const tripResult = await pool.request().input('id', sql.Int, tripId).query(`
      SELECT t.*, d.user_id AS driver_user_id, b.employee_id
      FROM trips t
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN bookings b ON b.id = t.booking_id
      WHERE t.id = @id AND t.is_active = 1
    `);
    const trip = tripResult.recordset[0];
    if (!trip) throw new Error('Trip not found');

    if (!this.canTransition(trip.status, toStatus)) {
      throw new Error(`Cannot transition from ${trip.status} to ${toStatus}`);
    }

    const request = pool.request()
      .input('id', sql.Int, tripId)
      .input('toStatus', sql.NVarChar(50), toStatus);

    let extraSql = '';

    switch (toStatus) {
      case 'DRIVER_EN_ROUTE':
        extraSql = ', eta_minutes = @eta';
        request.input('eta', sql.Int, extra.eta_minutes || null);
        break;
      case 'ARRIVED':
        break;
      case 'PASSENGER_ONBOARD':
        extraSql = ', actual_pickup = GETDATE()';
        break;
      case 'IN_PROGRESS':
        extraSql = ', actual_pickup = ISNULL(actual_pickup, GETDATE())';
        break;
      case 'COMPLETED':
        extraSql = ', actual_dropoff = GETDATE(), completed_at = GETDATE()';
        if (extra.distance_km) { request.input('dist', sql.Decimal(10,2), extra.distance_km); extraSql += ', distance_km = @dist'; }
        if (extra.duration_minutes) { request.input('dur', sql.Int, extra.duration_minutes); extraSql += ', duration_minutes = @dur'; }
        break;
      case 'CANCELLED':
        if (extra.notes) { request.input('notes', sql.NVarChar(sql.MAX), extra.notes); extraSql += ', notes = @notes'; }
        break;
      case 'NO_SHOW':
        break;
      case 'ESCALATED':
        if (extra.notes) { request.input('notes', sql.NVarChar(sql.MAX), extra.notes); extraSql += ', notes = @notes'; }
        break;
    }

    await request.query(`
      UPDATE trips SET status = @toStatus, updated_at = GETDATE() ${extraSql} WHERE id = @id
    `);

    // Record event
    await TripEvent.create({
      trip_id: tripId,
      event_type: `STATUS_${toStatus}`,
      from_status: trip.status,
      to_status: toStatus,
      latitude: extra.latitude,
      longitude: extra.longitude,
      performed_by: userId,
      metadata: extra
    });

    // Sync booking status
    if (trip.booking_id) {
      const bookingStatus = this._mapTripToBookingStatus(toStatus);
      if (bookingStatus) {
        await pool.request()
          .input('bookingId', sql.Int, trip.booking_id)
          .input('bs', sql.NVarChar(50), bookingStatus)
          .query(`UPDATE bookings SET status = @bs, updated_at = GETDATE() WHERE id = @bookingId`);
      }
    }

    // Send notifications
    await this._sendTransitionNotifications(trip, toStatus, extra);

    // Update driver availability
    if (toStatus === 'IN_PROGRESS' || toStatus === 'DRIVER_EN_ROUTE') {
      await pool.request().input('dId', sql.Int, trip.driver_id).query(`
        UPDATE drivers SET availability_status = 'ON_TRIP' WHERE id = @dId
      `);
    }
    if (toStatus === 'COMPLETED' || toStatus === 'CANCELLED' || toStatus === 'NO_SHOW') {
      await pool.request().input('dId', sql.Int, trip.driver_id).query(`
        UPDATE drivers SET availability_status = 'ONLINE' WHERE id = @dId
      `);
    }

    return this.getTrip(tripId);
  }

  static _mapTripToBookingStatus(tripStatus) {
    const map = {
      DRIVER_EN_ROUTE: 'DRIVER_EN_ROUTE',
      ARRIVED: 'ARRIVED',
      PASSENGER_ONBOARD: 'PASSENGER_ONBOARD',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      NO_SHOW: 'NO_SHOW',
      ESCALATED: 'ESCALATED'
    };
    return map[tripStatus] || null;
  }

  static async _sendTransitionNotifications(trip, toStatus, extra) {
    const messages = {
      DRIVER_EN_ROUTE: { title: 'Driver on the way', message: `Your driver is en route. ETA: ${extra.eta_minutes || '?'} minutes` },
      ARRIVED: { title: 'Driver arrived', message: 'Your driver has arrived at the pickup location' },
      PASSENGER_ONBOARD: { title: 'Trip started', message: 'You have been picked up. Have a safe ride!' },
      COMPLETED: { title: 'Trip completed', message: 'Your trip has been completed. Please rate your experience.' },
      CANCELLED: { title: 'Trip cancelled', message: extra.notes || 'Your trip has been cancelled' },
      NO_SHOW: { title: 'Marked as no-show', message: 'You were marked as no-show for your scheduled trip' }
    };

    const msg = messages[toStatus];
    if (msg && trip.employee_id) {
      try {
        await Notification.create({
          user_id: trip.employee_id,
          type: `TRIP_${toStatus}`,
          title: msg.title,
          message: msg.message,
          data: { tripId: trip.id, bookingId: trip.booking_id }
        });
      } catch (err) {
        logger.error('Failed to send trip notification:', err);
      }
    }
  }

  static async getTrip(id) {
    const pool = getPool();
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT t.*, b.booking_ref, b.employee_id,
             u.name AS employee_name, u.phone AS employee_phone,
             du.name AS driver_name, du.phone AS driver_phone,
             v.vehicle_number, v.vehicle_type, v.make, v.model, v.color,
             r.name AS route_name
      FROM trips t
      LEFT JOIN bookings b ON b.id = t.booking_id
      LEFT JOIN users u ON u.id = b.employee_id
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN users du ON du.id = d.user_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN routes r ON r.id = t.route_id
      WHERE t.id = @id
    `);
    return result.recordset[0] || null;
  }

  static async findAll(filters = {}, limit = 20, offset = 0) {
    const pool = getPool();
    const request = pool.request().input('limit', sql.Int, limit).input('offset', sql.Int, offset);
    let where = 'WHERE t.is_active = 1';

    if (filters.status) { where += ' AND t.status = @status'; request.input('status', sql.NVarChar(50), filters.status); }
    if (filters.driver_id) { where += ' AND t.driver_id = @driverId'; request.input('driverId', sql.Int, filters.driver_id); }
    if (filters.date) { where += ' AND CAST(t.scheduled_pickup AS DATE) = @date'; request.input('date', sql.Date, filters.date); }
    if (filters.employee_id) {
      where += ' AND b.employee_id = @employeeId';
      request.input('employeeId', sql.Int, filters.employee_id);
    }

    const result = await request.query(`
      SELECT t.*, b.booking_ref, b.employee_id,
             u.name AS employee_name,
             du.name AS driver_name,
             v.vehicle_number,
             r.name AS route_name
      FROM trips t
      LEFT JOIN bookings b ON b.id = t.booking_id
      LEFT JOIN users u ON u.id = b.employee_id
      LEFT JOIN drivers d ON d.id = t.driver_id
      LEFT JOIN users du ON du.id = d.user_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN routes r ON r.id = t.route_id
      ${where}
      ORDER BY t.scheduled_pickup DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    return result.recordset;
  }

  static async getDriverTodayTrips(driverId) {
    const pool = getPool();
    const result = await pool.request().input('driverId', sql.Int, driverId).query(`
      SELECT t.*, b.booking_ref, b.employee_id,
             u.name AS employee_name, u.phone AS employee_phone,
             v.vehicle_number, r.name AS route_name
      FROM trips t
      LEFT JOIN bookings b ON b.id = t.booking_id
      LEFT JOIN users u ON u.id = b.employee_id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN routes r ON r.id = t.route_id
      WHERE t.driver_id = @driverId AND t.is_active = 1
        AND CAST(t.scheduled_pickup AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY t.scheduled_pickup ASC
    `);
    return result.recordset;
  }

  static async getEmployeeTrips(employeeId, limit = 20) {
    const pool = getPool();
    const result = await pool.request()
      .input('employeeId', sql.Int, employeeId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) t.*, b.booking_ref,
               du.name AS driver_name, du.phone AS driver_phone,
               v.vehicle_number, v.vehicle_type, v.color,
               r.name AS route_name
        FROM trips t
        LEFT JOIN bookings b ON b.id = t.booking_id
        LEFT JOIN drivers d ON d.id = t.driver_id
        LEFT JOIN users du ON du.id = d.user_id
        LEFT JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN routes r ON r.id = t.route_id
        WHERE b.employee_id = @employeeId AND t.is_active = 1
        ORDER BY t.scheduled_pickup DESC
      `);
    return result.recordset;
  }
}

module.exports = TripStateMachine;
