import type { EventRecord, LessonRecord, SubjectRecord } from '../../db/types';
import { formatUtcInZone } from '../../utils/dates';
import { subjectRowId } from './parse';
import type { EaTimetableEvent } from './types';

/**
 * One-time group picker for split lessons.
 *
 * eAsistent reports BOTH class-group lessons when the class is split into
 * groups: the same weekly slot (weekday + from + to) contains two different
 * subjects. The user picks "his" subject once per slot; the choice applies
 * to every week.
 *
 * Choice model (documented contract):
 * - A slot is keyed as `"<isoWeekday>|<from>|<to>"`, e.g. `"1|08:35|09:20"`
 *   with wall-clock times in Europe/Ljubljana (ISO weekday: 1 = Monday).
 * - The choice value identifies a subject, stored as the API subject id
 *   (`subject_id`) when the payload carried one, else the
 *   deterministic subject row id (`ea-subj:<hash of the subject name>`).
 *   Both forms are accepted when matching, so a choice survives payload
 *   variations.
 * - Filtering happens TWICE:
 *   1. at sync time (`filterEntriesByGroupChoices`) — non-selected entries
 *      (lesson, its calendar event AND its homework) never enter the DB;
 *   2. defensively at query/render time (`applyGroupChoices`) — rows synced
 *      before the choice was made are hidden too.
 * - If a slot stops being split, or the chosen subject no longer appears in
 *   the slot (the school reshuffled the groups), the choice is ignored and
 *   BOTH lessons are shown until the user re-picks; such slots are reported
 *   back as `unresolved` so Settings can surface a hint.
 */

/** Settings-table key holding the serialized choices. */
export const GROUP_CHOICES_KEY = 'easistent.groupChoices';

/** `"<isoWeekday>|<from>|<to>"` — see the module comment. */
export type SlotKey = string;

/** Slot key -> subject identity (API subject id or subject row id). */
export type GroupChoices = Record<SlotKey, string>;

/** How a lesson/entry identifies its subject for choice matching. */
export interface SubjectIdentity {
  /** API subject id as a string, null when the payload had none. */
  apiId: string | null;
  /** Deterministic `ea-subj:<hash>` row id, null when the name is unknown. */
  rowId: string | null;
}

const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekdayOf(dayIso: string): number {
  if (!DAY_ISO.test(dayIso)) {
    throw new Error(`Invalid day ISO string: ${dayIso}`);
  }
  const day = new Date(`${dayIso}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

export function slotKeyOf(dayIso: string, from: string, to: string): SlotKey {
  return `${isoWeekdayOf(dayIso)}|${from}|${to}`;
}

/**
 * Slot key of a UTC interval, derived from its Ljubljana wall clock. Wall
 * time is used on purpose: a lesson that always starts at 08:35 keeps the
 * same slot key on both sides of a DST change even though its UTC instant
 * shifts by an hour.
 */
export function slotKeyFromUtc(startUtc: string, endUtc: string): SlotKey {
  const dayIso = formatUtcInZone(startUtc, 'yyyy-MM-dd');
  return slotKeyOf(
    dayIso,
    formatUtcInZone(startUtc, 'HH:mm'),
    formatUtcInZone(endUtc, 'HH:mm'),
  );
}

/** Parse the stored settings value; anything malformed yields no choices. */
export function parseChoices(raw: string | null | undefined): GroupChoices {
  if (!raw) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const choices: GroupChoices = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0 && key.includes('|')) {
      choices[key] = value;
    }
  }
  return choices;
}

export function serializeChoices(choices: GroupChoices): string {
  return JSON.stringify(choices);
}

export function choicesMatchIdentity(choice: string, identity: SubjectIdentity): boolean {
  return choice === identity.apiId || choice === identity.rowId;
}

function identitiesMatch(a: SubjectIdentity, b: SubjectIdentity): boolean {
  return (
    (a.apiId !== null && a.apiId === b.apiId) ||
    (a.rowId !== null && a.rowId === b.rowId)
  );
}

/* ------------------------------------------------------------------ */
/* Sync-time filtering (raw API entries, before parsing)              */
/* ------------------------------------------------------------------ */

function subjectApiIdOf(entry: EaTimetableEvent): string | null {
  const subject = entry.subject;
  if (!subject || typeof subject !== 'object') {
    return null;
  }
  const id = subject.subject_id ?? subject.id;
  return id !== undefined && id !== null ? String(id) : null;
}

function subjectTitleOf(subject: EaTimetableEvent['subject']): string | null {
  if (typeof subject === 'string') {
    return subject.trim() || null;
  }
  if (subject && typeof subject === 'object') {
    return (subject.title ?? '').trim() || null;
  }
  return null;
}

/**
 * Which subject "owns" an entry for group-choice purposes. For change
 * entries (substitutions, cancellations) the slot belongs to the ORIGINAL
 * subject — a substituted hour of the user's group is still his hour.
 */
function entryIdentity(entry: EaTimetableEvent): SubjectIdentity {
  const isChange = entry.type === 'event' || entry.is_canceled === true;
  const name = isChange
    ? entry.original_subject?.trim() || subjectTitleOf(entry.subject)
    : subjectTitleOf(entry.subject);
  return {
    apiId: isChange ? null : subjectApiIdOf(entry),
    rowId: name ? subjectRowId(name) : null,
  };
}

/**
 * Drop entries of non-selected groups before they are parsed and stored.
 * Entries in non-split slots, slots without a choice, slots whose choice no
 * longer matches any current option (reshuffle → show both until re-picked),
 * and entries whose subject cannot be identified (fail-open) are kept.
 */
export function filterEntriesByGroupChoices(
  entries: readonly EaTimetableEvent[],
  choices: GroupChoices,
): EaTimetableEvent[] {
  if (Object.keys(choices).length === 0) {
    return [...entries];
  }

  // Slot -> distinct subject identities, so a choice can be validated
  // against what the school currently reports for that slot.
  const slotIdentities = new Map<SlotKey, SubjectIdentity[]>();
  for (const entry of entries) {
    if (!entry.date || !entry.from || !entry.to) {
      continue;
    }
    const key = slotKeyOf(entry.date, entry.from, entry.to);
    if (!slotIdentities.has(key)) {
      slotIdentities.set(key, []);
    }
    const identity = entryIdentity(entry);
    const list = slotIdentities.get(key)!;
    if (identity.rowId === null && identity.apiId === null) {
      continue;
    }
    const existing = list.find((candidate) => identitiesMatch(candidate, identity));
    if (existing) {
      // Enrich: a change entry only knows the row id, a later timetable
      // block for the same subject brings the API id (and vice versa).
      existing.apiId = existing.apiId ?? identity.apiId;
    } else {
      list.push(identity);
    }
  }

  return entries.filter((entry) => {
    if (!entry.date || !entry.from || !entry.to) {
      return true;
    }
    const key = slotKeyOf(entry.date, entry.from, entry.to);
    const options = slotIdentities.get(key) ?? [];
    const choice = choices[key];
    // Not a split slot, or nobody picked yet → keep everything.
    if (options.length < 2 || !choice) {
      return true;
    }
    const chosen = options.find((option) => choicesMatchIdentity(choice, option));
    // Stale choice: the picked subject is no longer in this slot → show
    // both until the user re-picks.
    if (!chosen) {
      return true;
    }
    const identity = entryIdentity(entry);
    // Cannot attribute the entry to a group (e.g. a cancellation without
    // an original subject) → fail open, better to over-show than to hide
    // the user's own cancelled hour.
    if (identity.rowId === null && identity.apiId === null) {
      return true;
    }
    return identitiesMatch(identity, chosen);
  });
}

/* ------------------------------------------------------------------ */
/* Query-time filtering + conflict detection (DB rows)                 */
/* ------------------------------------------------------------------ */

/** One lesson group that occupies a conflicted slot. */
export interface ConflictOption {
  subject: SubjectRecord;
  teacher: string | null;
  classroom: string | null;
}

/** A weekly slot that carries lessons of two or more subjects. */
export interface ConflictSlot {
  key: SlotKey;
  isoWeekday: number;
  from: string;
  to: string;
  options: ConflictOption[];
}

interface SlotAggregate {
  options: ConflictOption[];
  identities: SubjectIdentity[];
}

function lessonIdentity(
  lesson: LessonRecord,
  subjectsById: Map<string, SubjectRecord>,
): SubjectIdentity {
  // Change lessons (substitution/cancelled) carry their ORIGINAL subject in
  // `note`; the slot belongs to that group, not to the substituting subject.
  if (lesson.status !== 'normal' && lesson.note) {
    const rowId = subjectRowId(lesson.note);
    return { apiId: subjectsById.get(rowId)?.externalId ?? null, rowId };
  }
  const subject = subjectsById.get(lesson.subjectId);
  return {
    apiId: subject?.externalId ?? null,
    rowId: lesson.subjectId,
  };
}

/**
 * Detect split slots from the synced lessons: slots (weekday + time) that
 * carry two or more distinct subjects across the whole sync window.
 */
export function detectSlotConflicts(
  lessons: readonly LessonRecord[],
  subjects: readonly SubjectRecord[],
): ConflictSlot[] {
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const slots = new Map<SlotKey, SlotAggregate>();

  for (const lesson of lessons) {
    if (!lesson.id.startsWith('ea-')) {
      continue;
    }
    const key = slotKeyFromUtc(lesson.startUtc, lesson.endUtc);
    const identity = lessonIdentity(lesson, subjectsById);
    if (!slots.has(key)) {
      slots.set(key, { options: [], identities: [] });
    }
    const slot = slots.get(key)!;
    const existingIdentity = slot.identities.find((candidate) =>
      identitiesMatch(candidate, identity),
    );
    if (existingIdentity) {
      // Enrich: change lessons only know the row id, regular lessons also
      // carry the API subject id — keep both on the merged identity.
      existingIdentity.apiId = existingIdentity.apiId ?? identity.apiId;
    } else {
      slot.identities.push(identity);
      // For change lessons the option subject is the ORIGINAL subject their
      // identity points at, so substitutions don't appear as a third group.
      const isChange = lesson.status !== 'normal' && lesson.note;
      const optionSubject = subjectsById.get(
        isChange ? identity.rowId! : lesson.subjectId,
      );
      if (optionSubject) {
        slot.options.push({
          subject: optionSubject,
          teacher: lesson.teacher,
          classroom: lesson.classroom,
        });
      }
    }
  }

  const conflicts: ConflictSlot[] = [];
  for (const [key, slot] of slots) {
    if (slot.identities.length >= 2 && slot.options.length >= 2) {
      const [weekday, from, to] = key.split('|');
      conflicts.push({
        key,
        isoWeekday: Number(weekday),
        from: from!,
        to: to!,
        options: slot.options,
      });
    }
  }
  conflicts.sort((a, b) =>
    a.isoWeekday - b.isoWeekday || a.from.localeCompare(b.from),
  );
  return conflicts;
}

/**
 * Resolve the subject identity of an eAsistent calendar event, so choices
 * made against lessons can filter old event rows too. Returns null when the
 * event cannot be attributed (fail-open).
 */
export function eventSubjectIdentity(
  event: EventRecord,
  lessonsById: Map<string, LessonRecord>,
  subjects: readonly SubjectRecord[],
): SubjectIdentity | null {
  const id = event.id;
  const lesson =
    lessonsById.get(id) ?? // ea-lesson:<raw> events share the lesson id
    lessonsById.get(id.replace(/^ea-(event|cancelled):/, 'ea-change:'));
  if (lesson) {
    return lessonIdentity(
      lesson,
      new Map(subjects.map((subject) => [subject.id, subject])),
    );
  }
  // Announced tests have no lesson row; match the subject by the title the
  // parser built ("<short>: <test title>" or just "<short>").
  for (const subject of subjects) {
    const short = subject.shortName?.trim();
    if (
      short &&
      (event.title === short || event.title.startsWith(`${short}: `))
    ) {
      return { apiId: subject.externalId ?? null, rowId: subject.id };
    }
  }
  return null;
}

export interface ApplyChoicesInput {
  lessons: readonly LessonRecord[];
  /** Optional: calendar events to filter with the same choices. */
  events?: readonly EventRecord[];
  subjects: readonly SubjectRecord[];
  choices: GroupChoices;
}

export interface ApplyChoicesResult {
  lessons: LessonRecord[];
  events: EventRecord[];
  conflicts: ConflictSlot[];
  /** Split slots that still need a (fresh) choice — drive the Settings hint. */
  unresolved: ConflictSlot[];
}

/**
 * Defensively hide rows of non-selected groups at query/render time. Only
 * slots that are split in the CURRENT data and whose choice points at a
 * subject that still occupies the slot are filtered; anything else falls
 * back to showing all lessons (see the module contract).
 */
export function applyGroupChoices(input: ApplyChoicesInput): ApplyChoicesResult {
  const subjectsById = new Map(
    input.subjects.map((subject) => [subject.id, subject]),
  );
  const conflicts = detectSlotConflicts(input.lessons, input.subjects);
  const unresolved: ConflictSlot[] = [];

  const activeChoice = new Map<SlotKey, SubjectIdentity>();
  for (const slot of conflicts) {
    const choice = input.choices[slot.key];
    if (!choice) {
      unresolved.push(slot);
      continue;
    }
    const chosenOption = slot.options.find((option) =>
      choicesMatchIdentity(choice, {
        apiId: option.subject.externalId ?? null,
        rowId: option.subject.id,
      }),
    );
    if (!chosenOption) {
      // Stale choice — the picked subject no longer occupies this slot.
      unresolved.push(slot);
      continue;
    }
    activeChoice.set(slot.key, {
      apiId: chosenOption.subject.externalId ?? null,
      rowId: chosenOption.subject.id,
    });
  }

  const isChosen = (key: SlotKey, identity: SubjectIdentity): boolean => {
    const chosen = activeChoice.get(key);
    return !chosen || identitiesMatch(chosen, identity);
  };

  const lessons = input.lessons.filter((lesson) => {
    if (!lesson.id.startsWith('ea-')) {
      return true;
    }
    const key = slotKeyFromUtc(lesson.startUtc, lesson.endUtc);
    if (!activeChoice.has(key)) {
      return true;
    }
    return isChosen(key, lessonIdentity(lesson, subjectsById));
  });

  const lessonsById = new Map(input.lessons.map((lesson) => [lesson.id, lesson]));
  const events = (input.events ?? []).filter((event) => {
    if (event.source !== 'easistent') {
      return true;
    }
    const key = slotKeyFromUtc(event.startUtc, event.endUtc);
    if (!activeChoice.has(key)) {
      return true;
    }
    const identity = eventSubjectIdentity(event, lessonsById, input.subjects);
    if (!identity) {
      return true; // fail-open
    }
    return isChosen(key, identity);
  });

  return { lessons, events, conflicts, unresolved };
}
