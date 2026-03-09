const { sql, getPool } = require('../config/database');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

const DEFAULT_OFFICE_RADIUS_KM = parseFloat(process.env.OFFICE_GEOFENCE_RADIUS_KM || '1.0');
const ALERT_COOLDOWN_MINUTES = parseInt(process.env.SHIFT_DELAY_ALERT_COOLDOWN_MINUTES || '30', 10);

const SHIFT_RULES = {
  SHIFT_1: { entryBy: '05:30', leaveAt: '14:50' }, // shift end 14:30 + 20 min
  SHIFT_2: { entryBy: '14:30', leaveAt: '23:15' },
  SHIFT_3: { entryBy: '23:10', leaveAt: '05:30', leaveNextDay: true },
  GENERAL: { entryBy: '08:00', leaveAt: '17:50' }
};

class DelayMonitoringService {
  static schemaCache = null;
  static sentCache = new Map();

  static bindFlexibleId(request, paramName, id) {
    if (id === null || id === undefined) {
      request.input(paramName, sql.NVarChar(255), null);
      return;
    }
    if (typeof id === 'number' && Number.isInteger(id)) {
      request.input(paramName, sql.Int, id);
      return;
    }
    const normalized = String(id).trim();
    if (/^\d+$/.test(normalized)) {
      request.input(paramName, sql.Int, parseInt(normalized, 10));
      return;
    }
    request.input(paramName, sql.NVarChar(255), normalized);
  }

  static normalizeShift(raw) {
    const input = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (input === 'S1' || input === 'SHIFT1') return 'SHIFT_1';
    if (input === 'S2' || input === 'SHIFT2') return 'SHIFT_2';
    if (input === 'S3' || input === 'SHIFT3') return 'SHIFT_3';
    if (input === 'GENERAL' || input === 'GEN') return 'GENERAL';
    if (SHIFT_RULES[input]) return input;
    return 'GENERAL';
  }

  static parseTimeParts(hhmm) {
    const [h = '00', m = '00'] = String(hhmm || '00:00').split(':');
    return { h: parseInt(h, 10), m: parseInt(m, 10) };
  }

  static withTime(baseDate, hhmm, dayOffset = 0) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + dayOffset);
    const { h, m } = this.parseTimeParts(hhmm);
    d.setHours(h, m, 0, 0);
    return d;
  }

  static minutesDiff(later, earlier) {
    return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 60000));
  }

  static distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static shouldSend(key) {
    const now = Date.now();
    const last = this.sentCache.get(key) || 0;
    if ((now - last) < ALERT_COOLDOWN_MINUTES * 60000) return false;
    this.sentCache.set(key, now);
    return true;
  }

  static async getSchema() {
    if (this.schemaCache) return this.schemaCache;
    const pool = getPool();

    const cols = await pool.request().query(`
      SELECT t.name AS table_name, c.name AS column_name
      FROM sys.tables t
      INNER JOIN sys.columns c ON c.object_id = t.object_id
      WHERE t.name IN ('cabs','cab_tracking','cab_requests','routes','users','cab_shift_assignments')
    `);

    const has = (table, col) =>
      cols.recordset.some((r) => String(r.table_name).toLowerCase() === table && String(r.column_name).toLowerCase() === col);
    const pick = (table, candidates) =>
      candidates.find((c) => has(table, c)) || null;

    this.schemaCache = {
      cabsHasShiftType: has('cabs', 'shift_type'),
      trackingTimeCol: pick('cab_tracking', ['recorded_at', 'timestamp', 'created_at']),
      requestAssignCol: pick('cab_requests', ['assigned_cab_id', 'cab_id']),
      requestTimeCol: pick('cab_requests', ['requested_time', 'pickup_time', 'created_at']),
      routesTripTypeCol: pick('routes', ['trip_type', 'shift_type']),
      hasShiftMapTable: cols.recordset.some((r) => String(r.table_name).toLowerCase() === 'cab_shift_assignments')
    };
    return this.schemaCache;
  }

  static async getOfficeConfig() {
    const lat = parseFloat(process.env.OFFICE_LATITUDE || '');
    const lng = parseFloat(process.env.OFFICE_LONGITUDE || '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, radiusKm: DEFAULT_OFFICE_RADIUS_KM };
  }

  static async getActiveHRUsers() {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT id, name, email, role
      FROM users
      WHERE is_active = 1
        AND role IN ('HR_ADMIN', 'ADMIN')
    `);
    return result.recordset || [];
  }

  static async getActiveCabs(schema) {
    const pool = getPool();
    const shiftSelect = schema.cabsHasShiftType ? ', shift_type' : '';
    const result = await pool.request().query(`
      SELECT id, cab_number, driver_id, status, current_latitude, current_longitude, last_location_update ${shiftSelect}
      FROM cabs
      WHERE is_active = 1
    `);
    return result.recordset || [];
  }

  static async getShiftFromMapping(cabId) {
    const pool = getPool();
    const request = pool.request();
    this.bindFlexibleId(request, 'cab_id', cabId);
    try {
      const result = await request.query(`
        SELECT TOP 1 shift_code
        FROM cab_shift_assignments
        WHERE cab_id = @cab_id
          AND is_active = 1
        ORDER BY id DESC
      `);
      return result.recordset[0]?.shift_code || null;
    } catch {
      return null;
    }
  }

  static async getShiftFromLatestRoute(schema, cabId) {
    if (!schema.requestAssignCol || !schema.routesTripTypeCol) return null;
    const pool = getPool();
    const request = pool.request();
    this.bindFlexibleId(request, 'cab_id', cabId);
    const result = await request.query(`
      SELECT TOP 1 r.${schema.routesTripTypeCol} AS trip_type
      FROM cab_requests cr
      INNER JOIN routes r ON r.id = cr.route_id
      WHERE cr.${schema.requestAssignCol} = @cab_id
      ORDER BY cr.${schema.requestTimeCol || 'created_at'} DESC
    `);
    return result.recordset[0]?.trip_type || null;
  }

  static async resolveShift(schema, cab) {
    if (schema.hasShiftMapTable) {
      const mapped = await this.getShiftFromMapping(cab.id);
      if (mapped) return this.normalizeShift(mapped);
    }
    if (schema.cabsHasShiftType && cab.shift_type) {
      return this.normalizeShift(cab.shift_type);
    }
    const routeShift = await this.getShiftFromLatestRoute(schema, cab.id);
    if (routeShift) return this.normalizeShift(routeShift);
    return 'GENERAL';
  }

  static async getTripStartedAt(schema, cabId) {
    if (!schema.trackingTimeCol) return null;
    const pool = getPool();
    const request = pool.request();
    this.bindFlexibleId(request, 'cab_id', cabId);
    const result = await request.query(`
      SELECT TOP 1 ${schema.trackingTimeCol} AS ts
      FROM cab_tracking
      WHERE cab_id = @cab_id
        AND CAST(${schema.trackingTimeCol} AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY ${schema.trackingTimeCol} ASC
    `);
    return result.recordset[0]?.ts || null;
  }

  static async emitHRNotification(io, payload) {
    const hrs = await this.getActiveHRUsers();
    for (const hr of hrs) {
      const created = await Notification.create({
        user_id: hr.id,
        type: 'CAB_DELAY',
        title: payload.title,
        message: payload.message,
        data: payload.data
      });
      if (io) {
        io.to(`user_${hr.id}`).emit('notification', {
          id: created?.id,
          ...payload,
          created_at: new Date().toISOString()
        });
      }
    }
  }

  static async monitorCabShiftDelays({ io } = {}) {
    try {
      const office = await this.getOfficeConfig();
      if (!office) {
        logger.warn('Shift delay monitor skipped: OFFICE_LATITUDE/OFFICE_LONGITUDE not set');
        return { success: false, message: 'Office coordinates not configured', alerts: 0 };
      }

      const schema = await this.getSchema();
      const cabs = await this.getActiveCabs(schema);
      const now = new Date();
      let alerts = 0;

      for (const cab of cabs) {
        if (!cab.current_latitude || !cab.current_longitude) continue;

        const shift = await this.resolveShift(schema, cab);
        const rules = SHIFT_RULES[shift] || SHIFT_RULES.GENERAL;

        const entryDeadline = this.withTime(now, rules.entryBy, 0);
        const leaveOfficeAt = this.withTime(now, rules.leaveAt, rules.leaveNextDay ? 1 : 0);

        const dist = this.distanceKm(
          Number(cab.current_latitude),
          Number(cab.current_longitude),
          office.lat,
          office.lng
        );
        const isAtOffice = dist <= office.radiusKm;

        if (now > entryDeadline && !isAtOffice) {
          const delayMinutes = this.minutesDiff(now, entryDeadline);
          const tripStartedAt = await this.getTripStartedAt(schema, cab.id);
          const key = `entry:${cab.id}:${now.toISOString().slice(0, 10)}:${shift}`;
          if (!this.shouldSend(key)) continue;

          const title = `Cab ${cab.cab_number} delayed for office entry`;
          const message =
            `Cab ${cab.cab_number} (${shift}) has not reached office by ${rules.entryBy}. ` +
            `Delay: ${delayMinutes} min.`;

          await this.emitHRNotification(io, {
            type: 'CAB_DELAY',
            title,
            message,
            data: {
              cab_id: cab.id,
              cab_number: cab.cab_number,
              shift,
              phase: 'ENTRY_TO_OFFICE',
              delay_minutes: delayMinutes,
              expected_entry_by: rules.entryBy,
              leave_office_at: rules.leaveAt,
              distance_to_office_km: Number(dist.toFixed(2)),
              trip_started_at: tripStartedAt ? new Date(tripStartedAt).toISOString() : null,
              current_latitude: cab.current_latitude,
              current_longitude: cab.current_longitude
            }
          });

          alerts += 1;
        }

        // Optional: alert if still at office long after scheduled office departure.
        if (now > leaveOfficeAt && isAtOffice) {
          const delayMinutes = this.minutesDiff(now, leaveOfficeAt);
          const key = `leave:${cab.id}:${now.toISOString().slice(0, 10)}:${shift}`;
          if (!this.shouldSend(key)) continue;

          const title = `Cab ${cab.cab_number} delayed departure from office`;
          const message =
            `Cab ${cab.cab_number} (${shift}) has not left office after scheduled ${rules.leaveAt}. ` +
            `Delay: ${delayMinutes} min.`;

          await this.emitHRNotification(io, {
            type: 'CAB_DELAY',
            title,
            message,
            data: {
              cab_id: cab.id,
              cab_number: cab.cab_number,
              shift,
              phase: 'LEAVING_OFFICE',
              delay_minutes: delayMinutes,
              scheduled_leave_at: rules.leaveAt,
              distance_to_office_km: Number(dist.toFixed(2)),
              current_latitude: cab.current_latitude,
              current_longitude: cab.current_longitude
            }
          });

          alerts += 1;
        }
      }

      return { success: true, alerts };
    } catch (error) {
      logger.error('Shift delay monitor error:', error);
      return { success: false, message: error.message, alerts: 0 };
    }
  }
}

module.exports = DelayMonitoringService;
