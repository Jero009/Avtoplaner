import { describe, expect, it } from 'vitest';
import { findConflictingIds } from './conflicts';

function event(id: string, startUtc: string, endUtc: string) {
  return { id, startUtc, endUtc };
}

describe('findConflictingIds', () => {
  it('flags both events of a partial overlap', () => {
    const ids = findConflictingIds([
      event('a', '2026-05-01T10:00:00.000Z', '2026-05-01T11:00:00.000Z'),
      event('b', '2026-05-01T10:30:00.000Z', '2026-05-01T12:00:00.000Z'),
    ]);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('flags an event fully contained in another', () => {
    const ids = findConflictingIds([
      event('a', '2026-05-01T09:00:00.000Z', '2026-05-01T17:00:00.000Z'),
      event('b', '2026-05-01T10:00:00.000Z', '2026-05-01T11:00:00.000Z'),
    ]);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('does not flag events that only touch at a boundary', () => {
    const ids = findConflictingIds([
      event('a', '2026-05-01T10:00:00.000Z', '2026-05-01T11:00:00.000Z'),
      event('b', '2026-05-01T11:00:00.000Z', '2026-05-01T12:00:00.000Z'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('does not flag separate events', () => {
    const ids = findConflictingIds([
      event('a', '2026-05-01T08:00:00.000Z', '2026-05-01T09:00:00.000Z'),
      event('b', '2026-05-01T14:00:00.000Z', '2026-05-01T15:00:00.000Z'),
      event('c', '2026-05-02T14:00:00.000Z', '2026-05-02T15:00:00.000Z'),
    ]);
    expect(ids.size).toBe(0);
  });

  it('flags every member of a chain of overlaps', () => {
    const ids = findConflictingIds([
      event('a', '2026-05-01T09:00:00.000Z', '2026-05-01T10:00:00.000Z'),
      event('b', '2026-05-01T09:30:00.000Z', '2026-05-01T10:30:00.000Z'),
      event('c', '2026-05-01T10:15:00.000Z', '2026-05-01T11:00:00.000Z'),
    ]);
    console.log('CHAIN IDS:', JSON.stringify([...ids]));
    expect(ids).toEqual(new Set(['a', 'b', 'c']));
  });

  it('flags identical intervals as conflicting', () => {
    const ids = findConflictingIds([
      event('a', '2026-05-01T10:00:00.000Z', '2026-05-01T11:00:00.000Z'),
      event('b', '2026-05-01T10:00:00.000Z', '2026-05-01T11:00:00.000Z'),
    ]);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set for an empty list', () => {
    expect(findConflictingIds([]).size).toBe(0);
  });
});
