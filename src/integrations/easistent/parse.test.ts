import { describe, expect, it } from 'vitest';
import { parseTimetable, stableHash } from './parse';
import {
  announcedTest,
  cancelledHour,
  lessonBlock,
  lessonWithHomework,
  schoolEvent,
  substitution,
} from './fixtures';

describe('parseTimetable', () => {
  it('maps a regular lesson block to a normal lesson with subject, teacher and room', () => {
    const result = parseTimetable([lessonBlock()]);

    expect(result.lessons).toHaveLength(1);
    const lesson = result.lessons[0]!;
    expect(lesson.status).toBe('normal');
    expect(lesson.teacher).toBe('Tina Novak');
    expect(lesson.classroom).toBe('12');
    // 08:00 wall time in Ljubljana on 2026-10-23 is still CEST (UTC+2).
    expect(lesson.startUtc).toBe('2026-10-23T06:00:00.000Z');
    expect(lesson.endUtc).toBe('2026-10-23T06:45:00.000Z');

    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]).toMatchObject({
      name: 'Slovenščina',
      shortName: 'SLO',
    });
    expect(lesson.subjectId).toBe(result.subjects[0]!.id);

    // Every timed entry also appears as a calendar event.
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      kind: 'lesson',
      title: 'SLO',
      location: '12',
    });
  });

  it('converts the same wall time to different UTC hours across the DST fall-back', () => {
    // 2026-10-23 is CEST (UTC+2); 2026-10-26 is CET (UTC+1).
    const result = parseTimetable([
      lessonBlock({ date: '2026-10-23' }),
      lessonBlock({ id: 2, slug: 'urnik$2', date: '2026-10-26' }),
    ]);
    const starts = result.lessons.map((lesson) => lesson.startUtc).sort();
    expect(starts).toEqual([
      '2026-10-23T06:00:00.000Z',
      '2026-10-26T07:00:00.000Z',
    ]);
  });

  it('handles the spring DST transition (2027-03-29 is CEST again)', () => {
    const result = parseTimetable([
      lessonBlock({ id: 3, slug: 'urnik$3', date: '2027-03-29' }),
    ]);
    expect(result.lessons[0]!.startUtc).toBe('2027-03-29T06:00:00.000Z');
  });

  it('extracts homework nested in lesson events with a stable id', () => {
    const event = lessonWithHomework();
    const first = parseTimetable([event]);
    expect(first.homework).toHaveLength(1);
    expect(first.homework[0]).toMatchObject({
      title: 'Vaje: linearne funkcije',
      description: 'str. 45, naloge 1–10',
      dueDate: '2026-10-23',
      done: false,
    });

    // Re-parsing the same content yields identical ids (sync idempotency).
    const second = parseTimetable([lessonWithHomework()]);
    expect(second.homework[0]!.id).toBe(first.homework[0]!.id);
    expect(second.homework[0]!.subjectId).toBe(first.homework[0]!.subjectId);
  });

  it('recognises announced tests (ocenjevanje$ events) with grade color', () => {
    const result = parseTimetable([announcedTest()]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      kind: 'test',
      externalId: 'ea-test:884612',
      title: 'RKO: 1. Pisno ocenjevanje znanja',
      color: '#e11d48',
    });
    // 10:10 wall time on 2026-10-26 is CET (UTC+1).
    expect(result.events[0]!.startUtc).toBe('2026-10-26T09:10:00.000Z');
  });

  it('maps substitutions to the NEW subject and keeps the original in the note', () => {
    const result = parseTimetable([substitution()]);

    const lesson = result.lessons[0]!;
    expect(lesson.status).toBe('substitution');
    // subject = the substituting subject (MAT), not the original.
    expect(result.subjects.map((s) => s.shortName)).toContain('MAT');
    expect(lesson.note).toBe('Angleščina');

    const event = result.events[0]!;
    expect(event.kind).toBe('substitution');
    expect(event.title).toBe('MAT');
    expect(event.description).toContain('NADOMEŠČANJE');
    expect(event.description).toContain('Angleščina');
  });

  it('maps cancelled hours to a cancelled lesson and a struck-through calendar event', () => {
    const result = parseTimetable([cancelledHour()]);

    expect(result.lessons[0]!.status).toBe('cancelled');
    expect(result.events[0]!).toMatchObject({
      kind: 'cancelled',
      title: 'ODPADLA URA',
    });
  });

  it('keeps one-off school events (all-day-ish ranges) as calendar events', () => {
    const result = parseTimetable([schoolEvent()]);

    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0]!.status).toBe('changed');
    expect(result.events[0]).toMatchObject({
      kind: 'school-event',
      title: 'SISTEMATSKI PREGLED',
    });
  });

  it('dedupes identical entries and skips entries without a time slot', () => {
    const result = parseTimetable([
      lessonBlock(),
      { ...lessonBlock() }, // same content, different object identity
      { id: 9, slug: 'urnik$9', date: '2026-10-23' }, // no from/to → skipped
    ]);
    expect(result.lessons).toHaveLength(1);
    expect(result.events).toHaveLength(1);
  });

  it('produces a deterministic 12-char hex hash', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
    expect(stableHash('abc')).toMatch(/^[0-9a-f]{12}$/);
  });
});
