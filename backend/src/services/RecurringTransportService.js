const CabRequest = require('../models/CabRequest');
const TransportProfile = require('../models/TransportProfile');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

class RecurringTransportService {
  static recurringLegTypes = ['RECURRING_INBOUND', 'RECURRING_OUTBOUND'];
  static officeKeywords = ['aisin', 'narasapura'];
  static shiftRules = {
    SHIFT_1: { inboundAt: '05:30:00', outboundAt: '14:50:00' },
    SHIFT_2: { inboundAt: '14:30:00', outboundAt: '23:15:00' },
    SHIFT_3: { inboundAt: '23:10:00', outboundAt: '05:30:00' },
    GENERAL: { inboundAt: '08:00:00', outboundAt: '17:50:00' }
  };

  static toIsoDate(targetDate = new Date()) {
    if (typeof targetDate === 'string') return targetDate.slice(0, 10);
    return new Date(targetDate).toISOString().slice(0, 10);
  }

  static combineDateAndTime(date, hhmmss = '08:00:00', dayOffset = 0) {
    const [hh = '08', mm = '00', ss = '00'] = String(hhmmss || '08:00:00').split(':');
    const combined = new Date(`${date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}`);
    if (!Number.isNaN(combined.getTime()) && dayOffset) {
      combined.setDate(combined.getDate() + dayOffset);
    }
    return combined;
  }

  static normalizeShift(rawShift) {
    const normalized = String(rawShift || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (normalized === 'S1' || normalized === 'SHIFT1' || normalized === 'A') return 'SHIFT_1';
    if (normalized === 'S2' || normalized === 'SHIFT2' || normalized === 'B') return 'SHIFT_2';
    if (normalized === 'S3' || normalized === 'SHIFT3' || normalized === 'C') return 'SHIFT_3';
    if (normalized === 'GENERAL' || normalized === 'GEN' || normalized === 'G') return 'GENERAL';
    return this.shiftRules[normalized] ? normalized : 'GENERAL';
  }

  static isOfficeLocation(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return this.officeKeywords.some((keyword) => normalized.includes(keyword));
  }

  static getProfileLocations(profile) {
    const profilePickup = profile.pickup_location || profile.stop_name || 'Daily pickup';
    const profileDrop = profile.drop_location || 'Office';
    const pickupIsOffice = this.isOfficeLocation(profilePickup);
    const dropIsOffice = this.isOfficeLocation(profileDrop);
    const officeLocation = pickupIsOffice ? profilePickup : (dropIsOffice ? profileDrop : 'AISIN Karnataka Limited, Narasapura Industrial Area');
    const nonOfficeLocation = pickupIsOffice ? profileDrop : profilePickup;
    const inboundPickup = pickupIsOffice ? nonOfficeLocation : profilePickup;
    const inboundDrop = officeLocation;
    const outboundPickup = officeLocation;
    const outboundDrop = dropIsOffice ? nonOfficeLocation : profileDrop;

    return {
      officeLocation,
      nonOfficeLocation,
      inboundPickup,
      inboundDrop,
      outboundPickup,
      outboundDrop
    };
  }

  static buildTripTemplates(profile, dateKey) {
    const shift = this.normalizeShift(profile.shift_code);
    const rules = this.shiftRules[shift] || this.shiftRules.GENERAL;
    const locations = this.getProfileLocations(profile);
    const inboundTime = this.combineDateAndTime(
      dateKey,
      profile.standard_pickup_time || rules.inboundAt || '08:00:00'
    );
    const outboundTime = this.combineDateAndTime(
      dateKey,
      rules.outboundAt || '17:50:00'
    );

    return [
      {
        request_type: 'RECURRING_INBOUND',
        notificationType: 'RECURRING_INBOUND_TRIP_CREATED',
        title: 'Daily pickup generated',
        message: `Your pickup trip for ${dateKey} has been generated automatically.`,
        requestedAt: inboundTime,
        pickupLocation: locations.inboundPickup,
        dropLocation: locations.inboundDrop
      },
      {
        request_type: 'RECURRING_OUTBOUND',
        notificationType: 'RECURRING_OUTBOUND_TRIP_CREATED',
        title: 'Daily drop generated',
        message: `Your drop trip for ${dateKey} has been generated automatically.`,
        requestedAt: outboundTime,
        pickupLocation: locations.outboundPickup,
        dropLocation: locations.outboundDrop
      }
    ].filter((template) => template.pickupLocation && template.dropLocation);
  }

  static async ensureDailyTrips(targetDate = new Date(), { io } = {}) {
    const dateKey = this.toIsoDate(targetDate);
    try {
      const profiles = await TransportProfile.getActiveProfilesForDate(dateKey);
      let generatedCount = 0;

      for (const profile of profiles) {
        const tripTemplates = this.buildTripTemplates(profile, dateKey);

        for (const tripTemplate of tripTemplates) {
          const recurringTrips = await CabRequest.findRecurringTripsForEmployeeOnDate(
            profile.employee_id,
            dateKey,
            [tripTemplate.request_type]
          );
          if (recurringTrips.length > 1) {
            for (const duplicateTrip of recurringTrips.slice(1)) {
              if (['PENDING', 'APPROVED'].includes(duplicateTrip.status)) {
                await CabRequest.cancel(duplicateTrip.id);
              }
            }
          }

          const existing = await CabRequest.findActiveTripForEmployeeOnDate(
            profile.employee_id,
            dateKey,
            [tripTemplate.request_type]
          );
          const existingDate = existing?.requested_time
            ? new Date(existing.requested_time).toISOString().slice(0, 10)
            : null;

          if (
            existing &&
            existingDate === dateKey &&
            ['PENDING', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(existing.status)
          ) {
            continue;
          }

          const request = await CabRequest.create({
            employee_id: profile.employee_id,
            route_id: profile.route_id || null,
            pickup_time: tripTemplate.requestedAt,
            requested_time: tripTemplate.requestedAt,
            travel_time: tripTemplate.requestedAt,
            departure_location: tripTemplate.pickupLocation,
            destination_location: tripTemplate.dropLocation,
            pickup_location: tripTemplate.pickupLocation,
            drop_location: tripTemplate.dropLocation,
            boarding_area: tripTemplate.pickupLocation,
            dropping_area: tripTemplate.dropLocation,
            priority: 'NORMAL',
            status: 'PENDING',
            number_of_people: 1,
            request_type: tripTemplate.request_type
          });

          await Notification.create({
            user_id: profile.employee_id,
            type: tripTemplate.notificationType,
            title: tripTemplate.title,
            message: tripTemplate.message,
            data: { request_id: request?.id, route: '/employee' }
          });

          if (io) {
            io.to(`user_${profile.employee_id}`).emit('notification', {
              type: tripTemplate.notificationType,
              title: tripTemplate.title,
              message: tripTemplate.message,
              created_at: new Date().toISOString()
            });
          }

          generatedCount += 1;
        }

        await TransportProfile.markGenerated(profile.id, dateKey);
      }

      return { success: true, generatedCount, date: dateKey };
    } catch (error) {
      logger.error('Recurring transport generation error:', error);
      return { success: false, generatedCount: 0, date: dateKey, error: error.message };
    }
  }
}

module.exports = RecurringTransportService;
