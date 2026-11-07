import type { EaTimetableEvent, EaTimetableResponse } from './types';

/**
 * Realistic timetable fixtures shaped like the live eAsistent API
 * (verified Sep 2026). Dates around the 2026-10-25 DST fall-back in
 * Europe/Ljubljana exercise time-zone handling.
 */

export function lessonBlock(overrides: Partial<EaTimetableEvent> = {}): EaTimetableEvent {
  return {
    id: 566422635,
    type: 'block',
    slug: 'urnik$566422635',
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
    id: 566422640,
    slug: 'urnik$566422640',
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
