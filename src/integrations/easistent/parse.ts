import type { LessonStatus } from '../../db/types';
import { wallTimeToUtc } from '../../utils/dates';
import type {
  EaSubjectRef,
  EaTimetableEvent,
} from './types';

/**
 * Deterministic 48-bit FNV-1a hash rendered as 12 hex characters. Used for
 * stable row ids where the API gives no numeric id (e.g. homework items), so
 * that re-syncing the same data maps to the same rows.
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i += 1) {
    const byte = input.charCodeAt(i);
    h1 ^= byte;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + Math.imul(byte + i, 0x9e3779b1)) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12);
}

export interface ParsedSubject {
  id: string;
  name: string;
  shortName: string | null;
}

export interface ParsedLesson {
  id: string;
  subjectId: string | null;
  teacher: string | null;
  classroom: string | null;
  startUtc: string;
  endUtc: string;
  status: LessonStatus;
  /** Human-readable change note (original subject of a substitution, …). */
  note: string | null;
}

export interface ParsedHomework {
  id: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  /** Lesson date the homework was given on (the API exposes no due date). */
  dueDate: string;
  done: boolean;
}

export interface ParsedEvent {
  /** external id; the prefix encodes the kind for rendering. */
  externalId: string;
  kind: 'lesson' | 'test' | 'school-event' | 'substitution' | 'cancelled';
  subjectId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startUtc: string;
  endUtc: string;
  /** eAsistent grade color for announced tests, null otherwise. */
  color: string | null;
}

export interface ParsedTimetable {
  subjects: ParsedSubject[];
  lessons: ParsedLesson[];
  homework: ParsedHomework[];
  events: ParsedEvent[];
}

function subjectName(subject: EaSubjectRef | string | null | undefined): string | null {
  if (typeof subject === 'string') {
    return subject.trim() || null;
  }
  if (subject && typeof subject === 'object') {
    return (subject.title ?? '').trim() || null;
  }
  return null;
}

function subjectShort(
  subject: EaSubjectRef | string | null | undefined,
  fallback: string,
): string {
  if (subject && typeof subject === 'object' && subject.title_short) {
    return subject.title_short.trim();
  }
  return fallback;
}

function subjectIdOf(
  subject: EaSubjectRef | string | null | undefined,
  byId: Map<string, ParsedSubject>,
): string | null {
  const name = subjectName(subject);
  if (!name) {
    return null;
  }
  const short =
    subject && typeof subject === 'object' && subject.title_short?.trim()
      ? subject.title_short.trim()
      : null;
  const id = `ea-subj:${stableHash(name)}`;
  if (!byId.has(id)) {
    byId.set(id, { id, name, shortName: short });
  } else {
    const existing = byId.get(id)!;
    if (short && !existing.shortName) {
      existing.shortName = short;
    }
  }
  return id;
}

/** External id of a raw entry: numeric id, else slug, else content hash. */
function entryId(entry: EaTimetableEvent): string {
  if (entry.id !== undefined && entry.id !== null) {
    return String(entry.id);
  }
  if (entry.slug) {
    return entry.slug;
  }
  return stableHash(JSON.stringify(entry));
}

function slotUtc(
  entry: EaTimetableEvent,
): { startUtc: string; endUtc: string } | null {
  if (!entry.date || !entry.from || !entry.to) {
    return null;
  }
  return {
    startUtc: wallTimeToUtc(`${entry.date}T${entry.from}`),
    endUtc: wallTimeToUtc(`${entry.date}T${entry.to}`),
  };
}

function joinTeachers(teachers: string[] | undefined): string | null {
  const joined = (teachers ?? []).filter((name) => name && name.trim()).join(', ');
  return joined.length > 0 ? joined : null;
}

/**
 * Turn raw timetable entries (already deduped by the client) into rows for
 * the local database. Malformed entries (no usable date/slot) are skipped.
 *
 * Mapping rules (verified against the live API, Sep 2026):
 * - `urnik$` blocks are regular lessons; `is_canceled` marks a dropped hour.
 * - `type: "event"` entries are changes/school events. For substitutions
 *   `subject` is the NEW subject and `original_subject` the replaced one;
 *   cancelled hours carry an empty subject.
 * - `ocenjevanje$<id>` events with an `evaluation` object are announced
 *   tests (the /m/exams/ endpoint is empty in practice).
 * - Homework text lives inside lesson events as `homework[]`.
 * Every timed entry also becomes a calendar event so it shows in the
 * calendar views next to local events.
 */
export function parseTimetable(entries: EaTimetableEvent[]): ParsedTimetable {
  const bySubjectId = new Map<string, ParsedSubject>();
  const lessons = new Map<string, ParsedLesson>();
  const homework = new Map<string, ParsedHomework>();
  const events = new Map<string, ParsedEvent>();

  for (const entry of entries) {
    const id = entryId(entry);
    const slot = slotUtc(entry);
    const slug = entry.slug ?? '';
    const name = subjectName(entry.subject);
    const subjectId = subjectIdOf(entry.subject, bySubjectId);
    const teacher = joinTeachers(entry.teachers);
    const classroom = entry.classroom?.trim() || null;
    const isTest = slug.startsWith('ocenjevanje$') && entry.evaluation != null;

    // Homework is attached to any lesson event with a date.
    if (entry.date) {
      for (const item of entry.homework ?? []) {
        const title = (item.title ?? '').trim();
        const description = (item.description ?? '').trim() || null;
        if (!title && !description) {
          continue;
        }
        const hwId = `ea-hw:${stableHash(`${entry.date}|${name ?? ''}|${title || description}`)}`;
        // Same id seen twice: keep the first occurrence (dedupe).
        if (!homework.has(hwId)) {
          homework.set(hwId, {
            id: hwId,
            subjectId,
            title: title || description!,
            description,
            dueDate: entry.date,
            done: item.done === true,
          });
        }
      }
    }

    if (!slot) {
      continue; // announcements without a time slot have nothing to place
    }

    const short = subjectShort(entry.subject, name ?? '');

    if (isTest) {
      const evaluation = entry.evaluation!;
      const testTitle = (evaluation.title ?? evaluation.summary ?? '').trim();
      events.set(`ea-test:${id}`, {
        externalId: `ea-test:${id}`,
        kind: 'test',
        subjectId,
        title: testTitle ? `${short}: ${testTitle}` : short,
        description: [evaluation.summary, evaluation.grade_type]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join(' — ') || null,
        location: classroom,
        startUtc: slot.startUtc,
        endUtc: slot.endUtc,
        color: evaluation.grade_color?.trim() || null,
      });
      continue;
    }

    if (entry.type === 'event' || entry.is_canceled === true) {
      // Change entry: substitution, cancelled hour or one-off school event.
      const status: LessonStatus = entry.is_canceled
        ? 'cancelled'
        : entry.is_substitution
          ? 'substitution'
          : 'changed';
      const original = entry.original_subject?.trim() || null;
      // Cancelled hours come with an empty subject; lessons.subject_id is
      // NOT NULL, so fall back to a placeholder named after the change type.
      const lessonSubjectId =
        subjectId ??
        subjectIdOf(
          { title: entry.type_label?.trim() || '—', title_short: null },
          bySubjectId,
        );
      const lessonId = `ea-change:${id}`;
      lessons.set(lessonId, {
        id: lessonId,
        subjectId: lessonSubjectId,
        teacher,
        classroom,
        startUtc: slot.startUtc,
        endUtc: slot.endUtc,
        status,
        note: original,
      });
      if (status === 'cancelled') {
        events.set(`ea-cancelled:${id}`, {
          externalId: `ea-cancelled:${id}`,
          kind: 'cancelled',
          subjectId,
          title: original ?? entry.type_label ?? (short || '—'),
          description: entry.type_label ?? null,
          location: classroom,
          startUtc: slot.startUtc,
          endUtc: slot.endUtc,
          color: null,
        });
      } else {
        events.set(`ea-event:${id}`, {
          externalId: `ea-event:${id}`,
          kind: status === 'substitution' ? 'substitution' : 'school-event',
          subjectId,
          title: short,
          description: [entry.type_label, original ? `↤ ${original}` : null]
            .filter((part): part is string => Boolean(part && part.trim()))
            .join(' — ') || null,
          location: classroom,
          startUtc: slot.startUtc,
          endUtc: slot.endUtc,
          color: null,
        });
      }
      continue;
    }

    // Regular timetable hour.
    lessons.set(`ea-lesson:${id}`, {
      id: `ea-lesson:${id}`,
      subjectId: subjectId ?? subjectIdOf({ title: '—', title_short: null }, bySubjectId),
      teacher,
      classroom,
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
      status: 'normal',
      note: null,
    });
    events.set(`ea-lesson:${id}`, {
      externalId: `ea-lesson:${id}`,
      kind: 'lesson',
      subjectId,
      title: short,
      description: null,
      location: classroom,
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
      color: null,
    });
  }

  return {
    subjects: [...bySubjectId.values()],
    lessons: [...lessons.values()],
    homework: [...homework.values()],
    events: [...events.values()],
  };
}
