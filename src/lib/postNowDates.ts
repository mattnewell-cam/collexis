const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MAX_POST_NOW_DELAY_DAYS = 365;

function getDayIndex(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

export function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

export function formatPostNowDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parsePostNowDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return getStartOfToday();

  const [, year, month, day] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
  parsedDate.setHours(0, 0, 0, 0);
  return parsedDate;
}

export function diffPostNowDays(laterDate: Date | string, earlierDate: Date | string) {
  const later = typeof laterDate === 'string' ? parsePostNowDate(laterDate) : laterDate;
  const earlier = typeof earlierDate === 'string' ? parsePostNowDate(earlierDate) : earlierDate;
  return getDayIndex(later) - getDayIndex(earlier);
}

export function clampPostNowDelay(value: number, max = MAX_POST_NOW_DELAY_DAYS) {
  if (Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

export function resolvePostNowPlannedDate(
  anchorDate: Date | string,
  delayDays: number,
  maxDelayDays = MAX_POST_NOW_DELAY_DAYS,
) {
  const anchor = typeof anchorDate === 'string' ? parsePostNowDate(anchorDate) : anchorDate;
  const nextDate = addDays(anchor, clampPostNowDelay(delayDays, maxDelayDays));
  return formatPostNowDate(nextDate);
}

export function shiftPostNowDate(date: Date | string, dayDelta: number) {
  const parsedDate = typeof date === 'string' ? parsePostNowDate(date) : date;
  return formatPostNowDate(addDays(parsedDate, dayDelta));
}
