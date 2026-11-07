import { describe, expect, it } from 'vitest';
import {
  addDaysToDayIso,
  dayRangeUtc,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
  wallTimeToUtc,
  utcToWallTime,
} from './dates';

describe('wallTimeToUtc', () => {
  it('converts Ljubljana winter wall time with CET offset (+1)', () => {
    expect(wallTimeToUtc('2026-01-15T12:00')).toBe('2026-01-15T11:00:00.000Z');
  });

  it('converts Ljubljana summer wall time with CEST offset (+2)', () => {
    expect(wallTimeToUtc('2026-07-01T12:00')).toBe('2026-07-01T10:00:00.000Z');
  });

  it('maps a non-existent spring-forward wall time using the pre-transition offset', () => {
    // 2026-03-29 02:00–03:00 does not exist in Ljubljana (clocks jump to
    // 03:00). date-fns-tz resolves it with the CEST (+2) offset in effect
    // just before the jump.
    expect(wallTimeToUtc('2026-03-29T02:30')).toBe('2026-03-29T00:30:00.000Z');
  });

  it('maps an ambiguous fall-back wall time using standard time', () => {
    // 2026-10-25 02:30 happens twice; date-fns-tz resolves the ambiguity
    // with the CET (+1) offset in effect after the clocks fall back.
    expect(wallTimeToUtc('2026-10-25T02:30')).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('utcToWallTime round trips', () => {
  it('round trips a winter instant', () => {
    const wall = utcToWallTime('2026-01-15T11:00:00.000Z');
    expect(wall.getFullYear()).toBe(2026);
    expect(wall.getMonth()).toBe(0);
    expect(wall.getDate()).toBe(15);
    expect(wall.getHours()).toBe(12);
  });

  it('round trips a summer instant', () => {
    const wall = utcToWallTime('2026-07-01T10:00:00.000Z');
    expect(wall.getHours()).toBe(12);
  });
});

describe('dayRangeUtc across DST changes', () => {
  it('covers 24 hours on a normal day', () => {
    const range = dayRangeUtc('2026-06-01');
    expect(range.startUtc).toBe('2026-05-31T22:00:00.000Z');
    expect(range.endUtc).toBe('2026-06-01T22:00:00.000Z');
  });

  it('covers only 23 hours on a spring-forward day', () => {
    // 2026-03-29: 02:00 jumps to 03:00, so the day is one hour shorter.
    const range = dayRangeUtc('2026-03-29');
    const hours =
      (Date.parse(range.endUtc) - Date.parse(range.startUtc)) / 3_600_000;
    expect(hours).toBe(23);
    expect(range.startUtc).toBe('2026-03-28T23:00:00.000Z');
    expect(range.endUtc).toBe('2026-03-29T22:00:00.000Z');
  });

  it('covers 25 hours on a fall-back day', () => {
    // 2026-10-25: 03:00 jumps back to 02:00, so the day is one hour longer.
    const range = dayRangeUtc('2026-10-25');
    const hours =
      (Date.parse(range.endUtc) - Date.parse(range.startUtc)) / 3_600_000;
    expect(hours).toBe(25);
  });

  it('rejects malformed day strings', () => {
    expect(() => dayRangeUtc('2026-6-1')).toThrow(/Invalid day ISO/);
  });
});

describe('addDaysToDayIso', () => {
  it('moves across a month boundary', () => {
    expect(addDaysToDayIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDayIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('keeps the calendar day over a DST change', () => {
    expect(addDaysToDayIso('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysToDayIso('2026-10-24', 1)).toBe('2026-10-25');
  });
});

describe('datetime-local input conversion', () => {
  it('converts an input value to UTC and back', () => {
    const utc = fromDateTimeLocalValue('2026-03-30T09:15');
    expect(utc).toBe('2026-03-30T07:15:00.000Z');
    expect(toDateTimeLocalValue(utc)).toBe('2026-03-30T09:15');
  });

  it('rejects malformed input values', () => {
    expect(() => fromDateTimeLocalValue('2026-03-30 09:15')).toThrow(
      /Invalid datetime-local/,
    );
  });
});
