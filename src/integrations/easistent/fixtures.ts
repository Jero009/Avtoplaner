import type { EaTimetableEvent, EaTimetableResponse } from './types';

/**
 * Realistic timetable fixtures shaped like the live eAsistent API
 * (verified Sep 2026). Dates around the 2026-10-25 DST fall-back in
 * Europe/Ljubljana exercise time-zone handling.
 */

export function lessonBlock(overrides: Partial<EaTimetableEvent> = {}): EaTimetableEvent {
  return {
    id: 700422635,
    type: 'block',
    slug: 'urnik$700422635',
    date: '2026-10-23',
    from: '08:00',
    to: '08:45',
    subject: { id: 63, title: 'Slovenščina', title_short: 'SLO' },
    teachers: ['Tina Novak'],
    classroom: '12',
    homework: [],
    ...overrides,
  };
}

export function lessonWithHomework(): EaTimetableEvent {
  return lessonBlock({
    id: 700422640,
    slug: 'urnik$700422640',
    date: '2026-10-23',
    from: '09:00',
    to: '09:45',
    subject: { id: 71, title: 'Matematika', title_short: 'MAT' },
    teachers: ['Ana Kovač'],
    classroom: '24',
    homework: [
      { title: 'Vaje: linearne funkcije', description: 'str. 45, naloge 1–10', done: false },
    ],
  });
}

export function announcedTest(): EaTimetableEvent {
  return {
    id: 884612,
    type: 'event',
    slug: 'ocenjevanje$884612',
    date: '2026-10-26',
    from: '10:10',
    to: '10:50',
    subject: { id: 84, title: 'Računalniške komunikacije in omrežja', title_short: 'RKO' },
    teachers: ['Marko Zupan'],
    classroom: '3',
    is_important: true,
    evaluation: {
      title: '1. Pisno ocenjevanje znanja',
      summary: 'OSI model, IP naslavljanje',
      is_pre_evaluation: false,
      grade_type: 'Pisna ocena',
      grade_color: '#e11d48',
    },
  };
}

export function substitution(): EaTimetableEvent {
  return {
    id: 70282970,
    type: 'event',
    slug: 'dogodek$70282970',
    date: '2026-10-26',
    from: '12:30',
    to: '13:15',
    subject: { id: 71, title: 'Matematika', title_short: 'MAT' },
    teachers: ['Ana Kovač'],
    classroom: '24',
    is_substitution: true,
    original_subject: 'Angleščina',
    type_label: 'NADOMEŠČANJE',
  };
}

export function cancelledHour(): EaTimetableEvent {
  return {
    id: 70282980,
    type: 'event',
    slug: 'dogodek$70282980',
    date: '2026-10-27',
    from: '08:00',
    to: '08:45',
    subject: {},
    teachers: [],
    classroom: null,
    is_canceled: true,
    type_label: 'ODPADLA URA',
  };
}

export function schoolEvent(): EaTimetableEvent {
  return {
    id: 70282962,
    type: 'event',
    slug: 'dogodek$70282962',
    date: '2026-11-25',
    from: '06:55',
    to: '14:55',
    subject: { title: 'SISTEMATSKI PREGLED', title_short: 'SISTEMATSKI PREGLED' },
    teachers: [],
    classroom: null,
  };
}

/** One full API chunk response: schedule blocks + change events. */
export function timetableChunkResponse(events: EaTimetableEvent[]): EaTimetableResponse {
  const schedule = events.filter((event) => event.type === 'block');
  const changes = events.filter((event) => event.type !== 'block');
  return { events: changes, schedule };
}

export function loginResponse(): unknown {
  return {
    access_token: { token: 'test-jwt-token' },
    user: { id: 1234567 },
  };
}

/* ------------------------------------------------------------------ */
/* Fully synthetic split-group timetable (NO real school data).       */
/* ------------------------------------------------------------------ */

/**
 * A synthetic two-week timetable whose class is split into two groups, in
 * the exact payload shape of `/m/timetable/events`. Fake subjects, teachers,
 * classrooms and slugs only — used to test split-slot detection and the
 * one-time group picker. Mirrors the real-world pattern: both groups'
 * lessons share the same weekly slot (same weekday + from + to).
 *
 * Layout (2026-11-09 is a Monday):
 * - CCC lesson Mon–Fri 07:45–08:30 (never split).
 * - Split slots, each with AAA (room 11) + BBB (room 18):
 *     Mon 08:35–09:20, Mon 12:30–13:15, Tue 10:50–11:35, Thu 09:25–10:10
 *   in both weeks (2026-11-09…13 and 2026-11-16…20).
 * - Homework "Naloga AAA" on the AAA Mon 08:35 lesson (week 1) and
 *   "Vaje BBB" on the BBB Mon 08:35 lesson (week 1).
 * - Week 2: the BBB Mon 08:35 hour is substituted (original: Predmet BBB).
 */
const SYNTH_SUBJECTS = {
  aaa: { subject_id: 111, title: 'Predmet AAA', title_short: 'AAA', color: '#c15644' },
  bbb: { subject_id: 222, title: 'Predmet BBB', title_short: 'BBB', color: '#2f7ed8' },
  ccc: { subject_id: 333, title: 'Predmet CCC', title_short: 'CCC', color: '#4caf50' },
} as const;

const SYNTH_TEACHERS = {
  aaa: ['Učitelj Ena'],
  bbb: ['Učitelj Dva'],
  ccc: ['Učitelj Tri'],
} as const;

let synthId = 900_000;

function synthLesson(
  dayIso: string,
  from: string,
  to: string,
  subjectKey: keyof typeof SYNTH_SUBJECTS,
  classroom: string,
  homework: string[] = [],
): EaTimetableEvent {
  synthId += 1;
  return {
    id: synthId,
    type: 'block',
    slug: `urnik$${synthId}`,
    date: dayIso,
    from,
    to,
    subject: { ...SYNTH_SUBJECTS[subjectKey] },
    teachers: [...SYNTH_TEACHERS[subjectKey]],
    classroom,
    homework: homework.map((title) => ({ title, description: '', done: false })),
  };
}

export function splitGroupTimetable(): EaTimetableEvent[] {
  const mondays = ['2026-11-09', '2026-11-16'];
  const tuesdays = ['2026-11-10', '2026-11-17'];
  const thursdays = ['2026-11-12', '2026-11-19'];
  const fridays = ['2026-11-13', '2026-11-20'];
  const weekdays = [...mondays, ...tuesdays, ...thursdays, ...fridays];

  const entries: EaTimetableEvent[] = [];

  for (const day of weekdays) {
    entries.push(synthLesson(day, '07:45', '08:30', 'ccc', '23'));
  }
  for (const monday of mondays) {
    const isFirstWeek = monday === mondays[0];
    entries.push(
      synthLesson(monday, '08:35', '09:20', 'aaa', '11', isFirstWeek ? ['Naloga AAA'] : []),
      synthLesson(monday, '08:35', '09:20', 'bbb', '18', isFirstWeek ? ['Vaje BBB'] : []),
      synthLesson(monday, '12:30', '13:15', 'aaa', '11'),
      synthLesson(monday, '12:30', '13:15', 'bbb', '18'),
    );
  }
  for (const tuesday of tuesdays) {
    entries.push(
      synthLesson(tuesday, '10:50', '11:35', 'aaa', '11'),
      synthLesson(tuesday, '10:50', '11:35', 'bbb', '18'),
    );
  }
  for (const thursday of thursdays) {
    entries.push(
      synthLesson(thursday, '09:25', '10:10', 'aaa', '11'),
      synthLesson(thursday, '09:25', '10:10', 'bbb', '18'),
    );
  }

  // Week 2: the BBB Monday 08:35 hour is substituted by CCC.
  synthId += 1;
  entries.push({
    id: synthId,
    type: 'event',
    slug: `dogodek$${synthId}`,
    date: mondays[1]!,
    from: '08:35',
    to: '09:20',
    subject: { ...SYNTH_SUBJECTS.ccc },
    teachers: [...SYNTH_TEACHERS.ccc],
    classroom: '23',
    is_substitution: true,
    original_subject: SYNTH_SUBJECTS.bbb.title,
    type_label: 'NADOMEŠČANJE',
  });

  return entries;
}
