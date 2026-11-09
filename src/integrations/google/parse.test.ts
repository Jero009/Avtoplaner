import { describe, expect, it } from 'vitest';
import { parseGoogleEvents, UNTITLED_EVENT } from './parse';
import type { GoogleEvent } from './types';

function event(overrides: Partial<GoogleEvent>): GoogleEvent {
  return {
    id: 'evt-1',
    status: 'confirmed',
    summary: 'Test event',
    start: { dateTime: '2026-11-09T09:00:00+01:00' },
    end: { dateTime: '2026-11-09T10:00:00+01:00' },
    ...overrides,
  };
}

describe('parseGoogleEvents', () => {
  it('converts a timed event with an explicit offset to UTC', () => {
    const [parsed] = parseGoogleEvents([event({})]);
    expect(parsed).toMatchObject({
      externalId: 'evt-1',
      title: 'Test event',
      description: null,
      location: null,
      startUtc: '2026-11-09T08:00:00.000Z',
      endUtc: '2026-11-09T09:00:00.000Z',
      allDay: false,
      recurring: false,
    });
  });

  it('keeps description and location, drops empty strings', () => {
    const [withMeta] = parseGoogleEvents([
      event({ description: ' bring book ', location: 'Room 12 ' }),
    ]);
    expect(withMeta).toMatchObject({ description: 'bring book', location: 'Room 12' });

    const [withoutMeta] = parseGoogleEvents([
      event({ description: '   ', location: '' }),
    ]);
    expect(withoutMeta).toMatchObject({ description: null, location: null });
  });

  it('flags recurring-series instances via originalStartTime', () => {
    const [instance] = parseGoogleEvents([
      event({
        id: 'evt-instance',
        originalStartTime: { dateTime: '2026-11-16T09:00:00+01:00' },
      }),
    ]);
    expect(instance?.recurring).toBe(true);
  });

  it('expands an all-day range with the exclusive end date', () => {
    const [parsed] = parseGoogleEvents([
      event({
        id: 'evt-allday',
        summary: 'School trip',
        start: { date: '2026-06-15' },
        end: { date: '2026-06-18' },
      }),
    ]);
    expect(parsed).toMatchObject({
      title: 'School trip',
      startUtc: '2026-06-15T00:00:00.000Z',
      endUtc: '2026-06-18T00:00:00.000Z', // exclusive end stays exclusive
      allDay: true,
      recurring: false,
    });
  });

  it('defaults a single all-day event to one day when end is missing', () => {
    const [parsed] = parseGoogleEvents([
      event({ start: { date: '2026-06-15' }, end: { date: '2026-06-15' } }),
    ]);
    expect(parsed?.endUtc).toBe('2026-06-16T00:00:00.000Z');
  });

  it('falls back to the untitled placeholder', () => {
    const [parsed] = parseGoogleEvents([event({ summary: '  ' })]);
    expect(parsed?.title).toBe(UNTITLED_EVENT);
  });

  it('drops cancelled tombstones and events without a start', () => {
    const parsed = parseGoogleEvents([
      event({ id: 'gone', status: 'cancelled', start: {} }),
      event({ id: 'nostart', start: {} }),
      event({ id: 'kept' }),
    ]);
    expect(parsed.map((item) => item.externalId)).toEqual(['kept']);
  });

  it('drops events with an invalid timestamp', () => {
    const parsed = parseGoogleEvents([
      event({ start: { dateTime: 'not-a-date' } }),
    ]);
    expect(parsed).toHaveLength(0);
  });
});
