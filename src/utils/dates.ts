import { addDays, format } from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

/** The single display time zone for the whole app. */
export const APP_TIME_ZONE = 'Europe/Ljubljana';

const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Interpret a wall-clock string in Ljubljana (e.g. "2026-03-31T09:00" or
 * "2026-03-31") as an instant and return its UTC ISO string.
 */
export function wallTimeToUtc(wallTime: string): string {
  return fromZonedTime(wallTime, APP_TIME_ZONE).toISOString();
}

/** Convert a UTC ISO string to a wall-clock Date in Ljubljana. */
export function utcToWallTime(utcIso: string): Date {
  return toZonedTime(new Date(utcIso), APP_TIME_ZONE);
}

/** Format a UTC ISO string as seen in Ljubljana, e.g. "31.3.2026 09:00". */
export function formatUtcInZone(utcIso: string, format: string): string {
  return formatInTimeZone(new Date(utcIso), APP_TIME_ZONE, format);
}

/** The current calendar day in Ljubljana as "YYYY-MM-DD". */
export function todayDayIso(now: Date = new Date()): string {
  return formatInTimeZone(now, APP_TIME_ZONE, 'yyyy-MM-dd');
}

/** Add days to a "YYYY-MM-DD" string using pure calendar arithmetic. */
export function addDaysToDayIso(dayIso: string, days: number): string {
  if (!DAY_ISO.test(dayIso)) {
    throw new Error(`Invalid day ISO string: ${dayIso}`);
  }
  return format(addDays(new Date(`${dayIso}T12:00:00Z`), days), 'yyyy-MM-dd');
}

/**
 * The half-open UTC interval covering one Ljubljana calendar day. The
 * interval length is 23h or 25h on DST change days and 24h otherwise.
 */
export function dayRangeUtc(dayIso: string): { startUtc: string; endUtc: string } {
  if (!DAY_ISO.test(dayIso)) {
    throw new Error(`Invalid day ISO string: ${dayIso}`);
  }
  return {
    startUtc: wallTimeToUtc(`${dayIso}T00:00`),
    endUtc: wallTimeToUtc(`${addDaysToDayIso(dayIso, 1)}T00:00`),
  };
}

/** Convert a UTC instant to a value usable in <input type="datetime-local">. */
export function toDateTimeLocalValue(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), APP_TIME_ZONE, "yyyy-MM-dd'T'HH:mm");
}

/** Convert an <input type="datetime-local"> value to a UTC ISO string. */
export function fromDateTimeLocalValue(value: string): string {
  if (!DATE_TIME_LOCAL.test(value)) {
    throw new Error(`Invalid datetime-local value: ${value}`);
  }
  return wallTimeToUtc(value);
}

/** Day boundaries for an all-day event stored as a UTC interval. */
export function allDayRangeUtc(dayIso: string): { startUtc: string; endUtc: string } {
  return dayRangeUtc(dayIso);
}
