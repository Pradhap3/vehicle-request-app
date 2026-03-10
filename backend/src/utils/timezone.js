/**
 * Timezone helpers for UTC storage and IST display without external deps.
 */

const UTC_TIMEZONE = 'UTC';
const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const ISO_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

const pad = (value) => String(value).padStart(2, '0');

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatUtcDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const formatUtcDateTime = (date) =>
  `${formatUtcDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;

const formatIsoUtc = (date) =>
  `${formatUtcDate(date)}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`;

const toIstDate = (value) => {
  const date = toDate(value);
  return date ? new Date(date.getTime() + IST_OFFSET_MS) : null;
};

const parseIstInput = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (match) {
    const [, yy, mo, dd, hh = '00', mm = '00', ss = '00'] = match;
    const utcMillis = Date.UTC(
      Number(yy),
      Number(mo) - 1,
      Number(dd),
      Number(hh),
      Number(mm),
      Number(ss)
    ) - IST_OFFSET_MS;
    return new Date(utcMillis);
  }

  return toDate(value);
};

const utcToIST = (utcDate) => {
  const istDate = toIstDate(utcDate);
  return istDate ? formatUtcDateTime(istDate) : null;
};

const istToUTC = (istDate) => {
  const utcDate = parseIstInput(istDate);
  return utcDate ? formatIsoUtc(utcDate) : null;
};

const nowIST = () => utcToIST(new Date());
const nowUTC = () => formatIsoUtc(new Date());
const todayIST = () => {
  const istDate = toIstDate(new Date());
  return istDate ? formatUtcDate(istDate) : null;
};
const todayUTC = () => formatUtcDate(new Date());

const isPastTimeIST = (istDateTime) => {
  const parsed = parseIstInput(istDateTime);
  return parsed ? parsed.getTime() < Date.now() : false;
};

const isPastTimeUTC = (utcDateTime) => {
  const parsed = toDate(utcDateTime);
  return parsed ? parsed.getTime() < Date.now() : false;
};

const formatForResponse = (dbDateTime) => utcToIST(dbDateTime);
const formatForDatabase = (userInputDateTime) => istToUTC(userInputDateTime);

const getMinutesDifference = (startIST, endIST) => {
  const start = parseIstInput(startIST);
  const end = parseIstInput(endIST);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 60000);
};

const addMinutesIST = (istDateTime, minutes) => {
  const parsed = parseIstInput(istDateTime);
  if (!parsed) return null;
  parsed.setUTCMinutes(parsed.getUTCMinutes() + Number(minutes || 0));
  return utcToIST(parsed);
};

const getShiftTimesIST = (date, shift) => {
  const shiftRules = {
    SHIFT_1: { entry: '05:30', exit: '14:50' },
    SHIFT_2: { entry: '14:30', exit: '23:15' },
    SHIFT_3: { entry: '23:10', exit: '05:30', nextDay: true },
    GENERAL: { entry: '08:00', exit: '17:50' }
  };

  const rules = shiftRules[shift] || shiftRules.GENERAL;
  const base = String(date || todayIST()).slice(0, 10);
  const nextDate = new Date(`${base}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + (rules.nextDay ? 1 : 0));

  return {
    entryTime: `${base} ${rules.entry}:00`,
    exitTime: `${formatUtcDate(nextDate)} ${rules.exit}:00`,
    nextDay: Boolean(rules.nextDay)
  };
};

const isWithinOfficeHoursIST = (shift = 'GENERAL') => {
  const now = nowIST();
  const today = todayIST();
  const shiftTimes = getShiftTimesIST(today, shift);
  return getMinutesDifference(shiftTimes.entryTime, now) >= 0
    && getMinutesDifference(now, shiftTimes.exitTime) >= 0;
};

const getNextBusinessDayIST = (startDate) => {
  const base = parseIstInput(`${String(startDate || todayIST()).slice(0, 10)} 00:00:00`) || new Date();
  do {
    base.setUTCDate(base.getUTCDate() + 1);
    const weekday = toIstDate(base).getUTCDay();
    if (![0, 6].includes(weekday)) return formatUtcDate(toIstDate(base));
  } while (true);
};

const timezoneMiddleware = (req, res, next) => {
  req.timezone = {
    UTC: UTC_TIMEZONE,
    IST: IST_TIMEZONE,
    now: nowIST,
    today: todayIST,
    format: formatForResponse,
    toDatabase: formatForDatabase,
    parse: istToUTC
  };
  next();
};

const SHIFT_SCHEDULE = {
  SHIFT_1: { name: 'Morning Shift', entryBy: '05:30', exitAt: '14:50', assignAt: '03:30', duration: 9.33, color: '#FF6B6B' },
  SHIFT_2: { name: 'Afternoon Shift', entryBy: '14:30', exitAt: '23:15', assignAt: '12:00', duration: 8.75, color: '#4ECDC4' },
  SHIFT_3: { name: 'Night Shift', entryBy: '23:10', exitAt: '05:30', assignAt: '20:30', nextDay: true, duration: 6.33, color: '#45B7D1' },
  GENERAL: { name: 'General Shift', entryBy: '08:00', exitAt: '17:50', assignAt: '05:00', duration: 9.83, color: '#95E1D3' }
};

module.exports = {
  utcToIST,
  istToUTC,
  formatForResponse,
  formatForDatabase,
  nowIST,
  nowUTC,
  todayIST,
  todayUTC,
  isPastTimeIST,
  isPastTimeUTC,
  getMinutesDifference,
  addMinutesIST,
  getShiftTimesIST,
  isWithinOfficeHoursIST,
  getNextBusinessDayIST,
  UTC_TIMEZONE,
  IST_TIMEZONE,
  IST_OFFSET_MS,
  DATE_FORMAT,
  DATETIME_FORMAT,
  ISO_FORMAT,
  SHIFT_SCHEDULE,
  timezoneMiddleware
};
