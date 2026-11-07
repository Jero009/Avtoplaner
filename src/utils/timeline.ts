import type { CalendarRecord, EventRecord, LessonRecord, SubjectRecord } from '../db/types';
import { formatUtcInZone, utcToWallTime } from './dates';

/**
 * Pure layout math for the day timeline (Fossify/Google-Calendar style).
 *
 * All positioning uses Ljubljana WALL-CLOCK minutes of the viewed day, not
 * UTC instants: a lesson that always starts at 08:35 renders at the same
 * offset on both sides of a DST change even though its UTC instant moves by
 * an hour. DST change days themselves are covered by `dayRangeUtc` (23 h or
 * 25 h days) at the query layer.
 */

/** Vertical resolution of the timeline. */
export const PX_PER_MINUTE = 1.25;

/** Shown range when the day has no (timed) events: 06:00–16:00. */
export const DEFAULT_START_MIN = 6 * 60;
export const DEFAULT_END_MIN = 16 * 60;

export interface TimelineItem {
  id: string;
  startUtc: string;
  endUtc: string;
}

export interface PositionedItem<T extends TimelineItem> {
  item: T;
  /** Distance from the top of the scroll content, in px. */
  top: number;
  height: number;
  /** Overlap stacking: 0-based column and how many columns share the range. */
  column: number;
  columnCount: number;
}

export interface TimelineLayout<T extends TimelineItem> {
  /** First drawn minute of the day (a whole hour). */
  startMin: number;
  /** Last drawn minute of the day (a whole hour, exclusive). */
  endMin: number;
  /** Minute-of-day marks for the hour gutter / grid lines. */
  hourMarks: number[];
  /** Total scroll-content height in px. */
  heightPx: number;
  positioned: PositionedItem<T>[];
}

/** Wall-clock (Ljubljana) minutes since midnight of a UTC instant. */
export function wallMinutesOf(utcIso: string): number {
  const wall = utcToWallTime(utcIso);
  return wall.getHours() * 60 + wall.getMinutes();
}

/** Wall-clock (Ljubljana) calendar day of a UTC instant, YYYY-MM-DD. */
export function wallDayOf(utcIso: string): string {
  return formatUtcInZone(utcIso, 'yyyy-MM-dd');
}

function clampToHour(minutes: number, mode: 'floor' | 'ceil'): number {
  const hours = minutes / 60;
  return Math.max(0, Math.round((mode === 'floor' ? Math.floor(hours) : Math.ceil(hours)) * 60));
}

/**
 * Compute the full layout for one day: the drawn hour range (default
 * 06:00–16:00, expanded to cover every event), absolute px positions and
 * overlap stacking columns.
 */
export function layoutTimeline<T extends TimelineItem>(
  items: readonly T[],
  dayIso: string,
  pxPerMinute: number = PX_PER_MINUTE,
): TimelineLayout<T> {
  const timed = items.filter(
    (item) => wallDayOf(item.startUtc) === dayIso && Date.parse(item.endUtc) > Date.parse(item.startUtc),
  );

  let startMin = DEFAULT_START_MIN;
  let endMin = DEFAULT_END_MIN;
  for (const item of timed) {
    startMin = Math.min(startMin, wallMinutesOf(item.startUtc));
    endMin = Math.max(endMin, wallMinutesOf(item.endUtc));
  }
  startMin = clampToHour(startMin, 'floor');
  endMin = Math.max(clampToHour(endMin, 'ceil'), startMin + 60);

  const hourMarks: number[] = [];
  for (let minute = startMin; minute < endMin; minute += 60) {
    hourMarks.push(minute);
  }

  const sorted = [...timed].sort((a, b) =>
    a.startUtc === b.startUtc
      ? a.endUtc.localeCompare(b.endUtc)
      : a.startUtc.localeCompare(b.startUtc),
  );

  const positioned: PositionedItem<T>[] = [];
  // Cluster building: a cluster is a maximal set of transitively
  // overlapping items; columns are assigned greedily inside a cluster
  // (first column whose last item ends before the next one starts).
  let cluster: PositionedItem<T>[] = [];
  let columnEnds: number[] = []; // last occupied end-minute per column
  let clusterEnd = -1;

  const flushCluster = () => {
    const columnCount = columnEnds.length;
    for (const entry of cluster) {
      entry.columnCount = columnCount;
      positioned.push(entry);
    }
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const start = Math.max(wallMinutesOf(item.startUtc), startMin);
    const end = Math.min(Math.max(wallMinutesOf(item.endUtc), start + 1), endMin);
    if (cluster.length > 0 && start >= clusterEnd) {
      flushCluster();
    }
    let column = 0;
    while (column < columnEnds.length && columnEnds[column]! > start) {
      column += 1;
    }
    columnEnds[column] = end;
    cluster.push({
      item,
      top: (start - startMin) * pxPerMinute,
      height: Math.max((end - start) * pxPerMinute, 4),
      column,
      columnCount: 1,
    });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) {
    flushCluster();
  }

  return {
    startMin,
    endMin,
    hourMarks,
    heightPx: (endMin - startMin) * pxPerMinute,
    positioned,
  };
}

/**
 * Top offset of the "now" line in px inside the layout, or null when the
 * viewed day is not `now`'s day. `now` is injectable for tests.
 */
export function nowLineTopPx(
  dayIso: string,
  now: Date,
  startMin: number,
  pxPerMinute: number = PX_PER_MINUTE,
): number | null {
  const wall = utcToWallTime(now.toISOString());
  const nowDay = `${wall.getFullYear()}-${String(wall.getMonth() + 1).padStart(2, '0')}-${String(
    wall.getDate(),
  ).padStart(2, '0')}`;
  if (nowDay !== dayIso) {
    return null;
  }
  const minutes = wall.getHours() * 60 + wall.getMinutes() + wall.getSeconds() / 60;
  return (minutes - startMin) * pxPerMinute;
}

/* ------------------------------------------------------------------ */
/* Timeline blocks: calendar events enriched for rendering            */
/* ------------------------------------------------------------------ */

export type BlockStatus = 'normal' | 'cancelled' | 'changed' | 'test' | 'local';

export interface TimelineBlock extends TimelineItem {
  title: string;
  room: string | null;
  note: string | null;
  color: string;
  status: BlockStatus;
}

/** Fallback palette for subjects/events without an assigned color. */
export const FALLBACK_PALETTE: readonly string[] = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#475569',
];

/** Deterministic palette pick so a subject keeps its color across renders. */
export function fallbackColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length]!;
}

function subjectColor(subject: SubjectRecord | undefined): string | null {
  return subject?.color ?? null;
}

function subjectLabel(subject: SubjectRecord | undefined, fallback: string): string {
  if (!subject) {
    return fallback;
  }
  return subject.shortName?.trim() || subject.name || fallback;
}

/**
 * Turn calendar events into renderable timeline blocks. eAsistent events
 * are joined back to their lesson rows (shared ids) for subject, status and
 * room; local events keep their calendar color.
 */
export function buildTimelineBlocks(
  events: readonly EventRecord[],
  lessons: readonly LessonRecord[],
  subjects: readonly SubjectRecord[],
  calendars: readonly CalendarRecord[],
): TimelineBlock[] {
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const calendarColor = (calendarId: string): string =>
    calendars.find((calendar) => calendar.id === calendarId)?.color ?? fallbackColor(calendarId);

  const blocks: TimelineBlock[] = [];
  for (const event of events) {
    if (event.allDay) {
      continue; // all-day events have no place on a time grid
    }
    if (event.source !== 'easistent') {
      blocks.push({
        id: event.id,
        title: event.title,
        room: event.location,
        note: event.description,
        color: calendarColor(event.calendarId),
        status: 'local',
        startUtc: event.startUtc,
        endUtc: event.endUtc,
      });
      continue;
    }

    const lesson =
      lessonsById.get(event.id) ??
      lessonsById.get(event.id.replace(/^ea-(event|cancelled):/, 'ea-change:'));
    const subject = lesson ? subjectsById.get(lesson.subjectId) : undefined;
    const testSubject = subject
      ? undefined
      : subjects.find((candidate) => {
          const short = candidate.shortName?.trim();
          return Boolean(short) && (event.title === short || event.title.startsWith(`${short}: `));
        });

    let status: BlockStatus = 'normal';
    if (event.id.startsWith('ea-test:')) {
      status = 'test';
    } else if (event.id.startsWith('ea-cancelled:')) {
      status = 'cancelled';
    } else if (event.id.startsWith('ea-event:')) {
      status = 'changed';
    }

    const colorSource = subject ?? testSubject;
    blocks.push({
      id: event.id,
      title: subject
        ? subjectLabel(subject, event.title)
        : status === 'test'
          ? event.title
          : event.title,
      room: event.location ?? lesson?.classroom ?? null,
      note: event.description ?? lesson?.note ?? null,
      color:
        status === 'test'
          ? (subjectColor(colorSource) ?? '#dc2626')
          : (subjectColor(colorSource) ?? fallbackColor(colorSource?.id ?? event.id)),
      status,
      startUtc: event.startUtc,
      endUtc: event.endUtc,
    });
  }
  return blocks;
}
