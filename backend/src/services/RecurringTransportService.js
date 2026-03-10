const CabRequest = require('../models/CabRequest');
const TransportProfile = require('../models/TransportProfile');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

class RecurringTransportService {
  static toIsoDate(targetDate = new Date()) {
    if (typeof targetDate === 'string') return targetDate.slice(0, 10);
    return new Date(targetDate).toISOString().slice(0, 10);
  }

  static combineDateAndTime(date, hhmmss = '08:00:00') {
    const [hh = '08', mm = '00', ss = '00'] = String(hhmmss || '08:00:00').split(':');
    return new Date(`${date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}`);
  }

  static async ensureDailyTrips(targetDate = new Date(), { io } = {}) {
    const dateKey = this.toIsoDate(targetDate);
    try {
      const profiles = await TransportProfile.getActiveProfilesForDate(dateKey);
      let generatedCount = 0;

      for (const profile of profiles) {
        const existing = await CabRequest.findConflictingRequest(
          profile.employee_id,
          this.combineDateAndTime(dateKey, profile.standard_pickup_time || '08:00:00'),
          null,
          24 * 60
        );

        const existingDate = existing?.requested_time ? new Date(existing.requested_time).toISOString().slice(0, 10) : null;
        if (existing && existingDate === dateKey && ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS'].includes(existing.status)) {
          await TransportProfile.markGenerated(profile.id, dateKey);
          continue;
        }

        const request = await CabRequest.create({
          employee_id: profile.employee_id,
          route_id: profile.route_id || null,
          pickup_time: this.combineDateAndTime(dateKey, profile.standard_pickup_time || '08:00:00'),
          requested_time: this.combineDateAndTime(dateKey, profile.standard_pickup_time || '08:00:00'),
          travel_time: this.combineDateAndTime(dateKey, profile.standard_pickup_time || '08:00:00'),
          departure_location: profile.pickup_location || profile.stop_name || 'Daily pickup',
          destination_location: profile.drop_location || 'Office',
          pickup_location: profile.pickup_location || profile.stop_name || 'Daily pickup',
          drop_location: profile.drop_location || 'Office',
          boarding_area: profile.pickup_location || profile.stop_name || 'Daily pickup',
          dropping_area: profile.drop_location || 'Office',
          priority: 'NORMAL',
          status: 'PENDING',
          number_of_people: 1,
          request_type: 'RECURRING'
        });

        await Notification.create({
          user_id: profile.employee_id,
          type: 'RECURRING_TRIP_CREATED',
          title: 'Daily transport generated',
          message: `Your daily commute for ${dateKey} has been generated automatically.`,
          data: { request_id: request?.id, route: '/employee' }
        });

        if (io) {
          io.to(`user_${profile.employee_id}`).emit('notification', {
            type: 'RECURRING_TRIP_CREATED',
            title: 'Daily transport generated',
            message: `Your daily commute for ${dateKey} has been generated automatically.`,
            created_at: new Date().toISOString()
          });
        }

        await TransportProfile.markGenerated(profile.id, dateKey);
        generatedCount += 1;
      }

      return { success: true, generatedCount, date: dateKey };
    } catch (error) {
      logger.error('Recurring transport generation error:', error);
      return { success: false, generatedCount: 0, date: dateKey, error: error.message };
    }
  }
}

module.exports = RecurringTransportService;
