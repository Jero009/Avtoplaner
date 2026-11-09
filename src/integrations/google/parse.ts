import type { GoogleEvent, GoogleEventTime } from './types';

/** One Google event mapped into the local `events` row shape. */
export interface ParsedGoogleEvent {
  externalId: string;
  title: string;
  description: string | null;
  location: string | null;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  /** True when the event is an instance of a recurring series. */
  recurring: boolean;
}

export const UNTITLED_EVENT = '(no title)';

/**
 * Map Google events into local rows. Cancelled events (tombstones) and
 * events without a start are dropped — the sync does a full replace, so a
 * missing row is the correct representation of a remote deletion.
 *
 * Timed events carry RFC 3339 timestamps with an explicit offset, which
 * `Date` parses natively; all-day events are plain dates with an exclusive
 * end, stored at UTC midnight so the timeline's all-day bucket renders them
 * by date (the same convention local all-day events use).
 */
export function parseGoogleEvents(events: GoogleEvent[]): ParsedGoogleEvent[] {
  const parsed: ParsedGoogleEvent[] = [];
  for (const event of events) {
    if (event.status === 'cancelled' || !event.start || typeof event.id !== 'string') {
      continue;
    }
    const isAllDay = typeof event.start.date === 'string';
    const parsedEvent = isAllDay
      ? parseAllDay(event, event.start, event.end)
      : parseTimed(event, event.start, event.end);
    if (parsedEvent) {
      parsed.push(parsedEvent);
    }
  }
  return parsed;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseTimed(
  event: GoogleEvent,
  start: GoogleEventTime,
  end: GoogleEventTime,
): ParsedGoogleEvent | null {
  const startMs = Date.parse(start.dateTime ?? '');
  if (Number.isNaN(startMs)) {
    return null;
  }
  let endMs = Date.parse(end?.dateTime ?? '');
  if (Number.isNaN(endMs) || endMs <= startMs) {
    // Google always sends an end for non-cancelled events; guard anyway.
    endMs = startMs + 60 * 60 * 1000;
  }
  return {
    externalId: event.id,
    title: clean(event.summary) ?? UNTITLED_EVENT,
    description: clean(event.description),
    location: clean(event.location),
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    allDay: false,
    recurring: Boolean(event.originalStartTime),
  };
}

function parseAllDay(
  event: GoogleEvent,
  start: GoogleEventTime,
  end: GoogleEventTime,
): ParsedGoogleEvent | null {
  const startDate = parseDateOnly(start.date);
  if (!startDate) {
    return null;
  }
  const endDate = parseDateOnly(end?.date);
  // Google's all-day end date is exclusive; missing or non-positive ends
  // mean a single-day event.
  const endUtc =
    endDate && endDate.getTime() > startDate.getTime()
      ? endDate.toISOString()
      : new Date(startDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    externalId: event.id,
    title: clean(event.summary) ?? UNTITLED_EVENT,
    description: clean(event.description),
    location: clean(event.location),
    startUtc: startDate.toISOString(),
    endUtc,
    allDay: true,
    recurring: Boolean(event.originalStartTime),
  };
}

function parseDateOnly(date: string | undefined): Date | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}
