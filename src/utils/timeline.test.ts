import { describe, expect, it } from 'vitest';
import type {
  CalendarRecord,
  EventRecord,
  LessonRecord,
  SubjectRecord,
} from '../db/types';
import { wallTimeToUtc } from './dates';
import {
  PX_PER_MINUTE,
  buildTimelineBlocks,
  fallbackColor,
  layoutTimeline,
  nowLineTopPx,
  wallDayOf,
  wallMinutesOf,
} from './timeline';

function item(id: string, dayIso: string, from: string, to: string) {
  return {
    id,
    startUtc: wallTimeToUtc(`${dayIso}T${from}`),
    endUtc: wallTimeToUtc(`${dayIso}T${to}`),
  };
}

describe('layoutTimeline', () => {
  it('positions blocks by wall-clock minutes (px per minute)', () => {
    const layout = layoutTimeline([item('a', '2026-11-09', '08:00', '09:00')], '2026-11-09');
    const block = layout.positioned[0]!;
    // Day starts at 06:00 → 08:00 is 120 minutes in.
    expect(layout.startMin).toBe(6 * 60);
    expect(block.top).toBeCloseTo(120 * PX_PER_MINUTE, 5);
    expect(block.height).toBeCloseTo(60 * PX_PER_MINUTE, 5);
    expect(block.column).toBe(0);
    expect(block.columnCount).toBe(1);
  });

  it('defaults to 06:00–16:00 on an empty day and expands for early/late events', () => {
    const empty = layoutTimeline([], '2026-11-09');
    expect(empty.startMin).toBe(360);
    expect(empty.endMin).toBe(960);
    expect(empty.hourMarks).toHaveLength(10);
    expect(empty.heightPx).toBeCloseTo(600 * PX_PER_MINUTE, 5);

    const expanded = layoutTimeline(
      [item('early', '2026-11-09', '06:55', '07:40'), item('late', '2026-11-09', '15:30', '17:10')],
      '2026-11-09',
    );
    expect(expanded.startMin).toBe(360); // 06:55 stays inside the 06:00 floor
    expect(expanded.endMin).toBe(18 * 60);
  });

  it('stacks overlapping blocks into columns and reuses freed columns', () => {
    const layout = layoutTimeline(
      [
        item('a', '2026-11-09', '08:00', '09:00'),
        item('b', '2026-11-09', '08:30', '09:30'),
        // starts when "a" ends → column 0 is free again, but the block
        // still overlaps "b", so the cluster keeps two columns.
        item('c', '2026-11-09', '09:00', '09:30'),
      ],
      '2026-11-09',
    );
    const byId = new Map(layout.positioned.map((p) => [p.item.id, p]));
    expect(byId.get('a')).toMatchObject({ column: 0, columnCount: 2 });
    expect(byId.get('b')).toMatchObject({ column: 1, columnCount: 2 });
    expect(byId.get('c')).toMatchObject({ column: 0, columnCount: 2 });
  });

  it('gives non-overlapping blocks the full width again', () => {
    const layout = layoutTimeline(
      [item('a', '2026-11-09', '08:00', '08:45'), item('b', '2026-11-09', '08:45', '09:30')],
      '2026-11-09',
    );
    expect(layout.positioned.every((p) => p.columnCount === 1)).toBe(true);
  });

  it('renders the same wall time at the same offset across the DST fall-back', () => {
    // 2026-10-23 is CEST (UTC+2), 2026-10-27 is CET (UTC+1).
    const before = layoutTimeline([item('a', '2026-10-23', '08:35', '09:20')], '2026-10-23');
    const after = layoutTimeline([item('a', '2026-10-27', '08:35', '09:20')], '2026-10-27');
    expect(after.positioned[0]!.top).toBe(before.positioned[0]!.top);
    expect(after.positioned[0]!.height).toBe(before.positioned[0]!.height);

    // The underlying UTC instants really do differ by one offset hour.
    expect(wallTimeToUtc('2026-10-23T08:35')).toBe('2026-10-23T06:35:00.000Z');
    expect(wallTimeToUtc('2026-10-27T08:35')).toBe('2026-10-27T07:35:00.000Z');

    // And the DST Sunday itself (25 h day) places a lesson correctly.
    const sunday = layoutTimeline([item('s', '2026-10-25', '08:35', '09:20')], '2026-10-25');
    expect(sunday.positioned[0]!.top).toBe(before.positioned[0]!.top);
  });

  it('ignores items of other days and zero-length items', () => {
    const layout = layoutTimeline(
      [
        item('a', '2026-11-09', '08:00', '09:00'),
        item('other-day', '2026-11-10', '08:00', '09:00'),
        { ...item('zero', '2026-11-09', '08:00', '08:00') },
      ],
      '2026-11-09',
    );
    expect(layout.positioned.map((p) => p.item.id)).toEqual(['a']);
  });
});

describe('wall clock helpers', () => {
  it('wallMinutesOf / wallDayOf convert UTC to Ljubljana wall time', () => {
    const utc = wallTimeToUtc('2026-11-09T08:35');
    expect(wallDayOf(utc)).toBe('2026-11-09');
    expect(wallMinutesOf(utc)).toBe(8 * 60 + 35);
  });
});

describe('nowLineTopPx', () => {
  const DAY = '2026-11-09';

  it('returns null on a different day (before and after)', () => {
    expect(nowLineTopPx(DAY, new Date('2026-11-08T12:00:00Z'), 360)).toBeNull();
    expect(nowLineTopPx(DAY, new Date('2026-11-10T00:30:00Z'), 360)).toBeNull();
  });

  it('positions the line at the current wall-clock time', () => {
    // 10:30 Ljubljana (CET, UTC+1) on the viewed Monday.
    const top = nowLineTopPx(DAY, new Date('2026-11-09T09:30:00Z'), 360);
    expect(top).toBeCloseTo((10.5 * 60 - 360) * PX_PER_MINUTE, 5);
  });

  it('positions the same local time identically on a CEST day', () => {
    // 2026-10-23 (CEST): 10:30 wall = 08:30 UTC.
    const cest = nowLineTopPx('2026-10-23', new Date('2026-10-23T08:30:00Z'), 360);
    expect(cest).toBeCloseTo((10.5 * 60 - 360) * PX_PER_MINUTE, 5);
  });
});

describe('buildTimelineBlocks', () => {
  const subjects: SubjectRecord[] = [
    { id: 'ea-subj:aaa', externalId: '111', name: 'Predmet AAA', shortName: 'AAA', color: '#c15644' },
    { id: 'ea-subj:ccc', externalId: '333', name: 'Predmet CCC', shortName: 'CCC', color: null },
  ];
  const lessons: LessonRecord[] = [
    {
      id: 'ea-lesson:1',
      subjectId: 'ea-subj:aaa',
      teacher: null,
      classroom: '11',
      startUtc: wallTimeToUtc('2026-11-09T08:35'),
      endUtc: wallTimeToUtc('2026-11-09T09:20'),
      status: 'normal',
      note: null,
    },
  ];
  const calendars: CalendarRecord[] = [
    { id: 'local', source: 'local', externalId: 'local', name: 'Local', color: '#2563eb', visible: true },
  ];

  function event(partial: Partial<EventRecord> & { id: string; title: string }): EventRecord {
    return {
      calendarId: 'easistent',
      source: 'easistent',
      externalId: partial.id,
      description: null,
      location: null,
      startUtc: wallTimeToUtc('2026-11-09T08:35'),
      endUtc: wallTimeToUtc('2026-11-09T09:20'),
      allDay: false,
      recurring: false,
      updatedAt: '2026-11-07T00:00:00.000Z',
      ...partial,
    };
  }

  it('uses the eAsistent subject color, short name and room for lessons', () => {
    const blocks = buildTimelineBlocks(
      [event({ id: 'ea-lesson:1', title: 'AAA', location: '11' })],
      lessons,
      subjects,
      calendars,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      title: 'AAA',
      room: '11',
      color: '#c15644',
      status: 'normal',
    });
  });

  it('falls back to the palette when the subject has no color', () => {
    const blocks = buildTimelineBlocks(
      [event({ id: 'ea-lesson:2', title: 'CCC' })],
      [
        {
          ...lessons[0]!,
          id: 'ea-lesson:2',
          subjectId: 'ea-subj:ccc',
          classroom: '23',
        },
      ],
      subjects,
      calendars,
    );
    expect(blocks[0]!.color).toBe(fallbackColor('ea-subj:ccc'));
    expect(blocks[0]!.room).toBe('23');
  });

  it('marks cancelled, changed and test events with their status and note', () => {
    const blocks = buildTimelineBlocks(
      [
        event({ id: 'ea-cancelled:9', title: 'AAA', description: 'ODPADLA URA' }),
        event({ id: 'ea-event:8', title: 'CCC', description: 'NADOMEŠČANJE — ↤ Predmet AAA' }),
        event({ id: 'ea-test:7', title: 'AAA: 1. Pisno ocenjevanje' }),
      ],
      [
        {
          ...lessons[0]!,
          id: 'ea-change:9',
          status: 'cancelled',
          note: 'Predmet AAA',
        },
        {
          ...lessons[0]!,
          id: 'ea-change:8',
          subjectId: 'ea-subj:ccc',
          status: 'substitution',
          note: 'Predmet AAA',
        },
      ],
      subjects,
      calendars,
    );
    expect(blocks[0]).toMatchObject({ status: 'cancelled', note: 'ODPADLA URA' });
    expect(blocks[1]).toMatchObject({ status: 'changed' });
    expect(blocks[2]).toMatchObject({ status: 'test', color: '#c15644' });
  });

  it('keeps local events in their own calendar color', () => {
    const blocks = buildTimelineBlocks(
      [
        event({
          id: 'local-1',
          title: 'Zobozdravnik',
          source: 'local',
          calendarId: 'local',
          location: 'Ordinacija',
        }),
      ],
      lessons,
      subjects,
      calendars,
    );
    expect(blocks[0]).toMatchObject({ status: 'local', color: '#2563eb', room: 'Ordinacija' });
  });

  it('skips all-day events', () => {
    const blocks = buildTimelineBlocks(
      [event({ id: 'ea-lesson:1', title: 'AAA', allDay: true })],
      lessons,
      subjects,
      calendars,
    );
    expect(blocks).toHaveLength(0);
  });
});
