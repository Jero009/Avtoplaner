/**
 * eAsistent mobile web API response shapes (verified against the live API,
 * Sep 2026). Every field is optional and defensively typed: the parser must
 * never throw on a missing key, it just skips the broken entry.
 */

/** Subject attached to a timetable entry; some entries carry a plain string. */
export interface EaSubjectRef {
  id?: number;
  /** The live API names it `subject_id` on timetable events (Sep 2026). */
  subject_id?: number;
  title?: string;
  title_short?: string | null;
  /** Hex color the school assigned to the subject. */
  color?: string | null;
}

/** Homework item nested inside a timetable lesson event. */
export interface EaHomeworkItem {
  id?: number;
  title?: string;
  description?: string;
  done?: boolean;
}

/** Announced-test metadata on `ocenjevanje$<id>` timetable events. */
export interface EaEvaluation {
  title?: string;
  summary?: string;
  is_pre_evaluation?: boolean;
  grade_type?: string;
  grade_color?: string;
}

/**
 * One entry of `/m/timetable/events` — either a `schedule` block (a regular
 * timetable hour, slug `urnik$<id>`) or an `event` (change/school event,
 * slug `dogodek$<id>` / `ocenjevanje$<id>`).
 */
export interface EaTimetableEvent {
  id?: number;
  type?: 'block' | 'event' | string;
  slug?: string;
  /** "YYYY-MM-DD" */
  date?: string;
  /** "HH:MM" wall-clock time in the school's time zone (Europe/Ljubljana). */
  from?: string;
  to?: string;
  subject?: EaSubjectRef | string | null;
  teachers?: string[];
  classroom?: string | null;
  homework?: EaHomeworkItem[];
  evaluation?: EaEvaluation | null;
  is_important?: boolean;
  is_substitution?: boolean;
  is_canceled?: boolean;
  original_subject?: string | null;
  type_label?: string | null;
}

export interface EaLoginResponse {
  access_token?: { token?: string };
  user?: { id?: number | string };
}

/** Response of one chunked `/m/timetable/events` call. */
export interface EaTimetableResponse {
  events?: EaTimetableEvent[];
  schedule?: EaTimetableEvent[];
}
