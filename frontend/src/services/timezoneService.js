const UTC = 'UTC';
const IST = 'Asia/Kolkata';
const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const DISPLAY_FORMAT = 'DD MMM YYYY, hh:mm A';
const IST_OFFSET_MS = 330 * 60 * 1000;

const pad = (value) => String(value).padStart(2, '0');

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const formatDateTime = (date) =>
  `${formatDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;

const toIstDate = (value) => {
  const date = toDate(value);
  return date ? new Date(date.getTime() + IST_OFFSET_MS) : null;
};

const parseIst = (value) => {
  if (!value) return null;
  const raw = String(value).trim().replace('T', ' ');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return toDate(value);
  const [, yy, mo, dd, hh = '00', mm = '00', ss = '00'] = match;
  return new Date(Date.UTC(Number(yy), Number(mo) - 1, Number(dd), Number(hh), Number(mm), Number(ss)) - IST_OFFSET_MS);
};

export const utcToIST = (utcDate) => {
  const date = toIstDate(utcDate);
  return date ? formatDateTime(date) : null;
};

export const istToUTC = (istDate) => {
  const date = parseIst(istDate);
  return date ? date.toISOString() : null;
};

export const formatForDisplay = (utcDate) => {
  const date = toIstDate(utcDate);
  if (!date) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours24 = date.getUTCHours();
  const hours12 = hours24 % 12 || 12;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  return `${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(hours12)}:${pad(date.getUTCMinutes())} ${suffix}`;
};

export const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  return istToUTC(`${dateStr} ${timeStr}`);
};

export const getNowIST = () => utcToIST(new Date());

export default {
  UTC,
  IST,
  DATE_FORMAT,
  DATETIME_FORMAT,
  DISPLAY_FORMAT,
  utcToIST,
  istToUTC,
  formatForDisplay,
  parseDateTime,
  getNowIST
};
