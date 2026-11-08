/** Where a row comes from: local storage, Google Calendar, eAsistent or manual entry. */
export type EventSource = 'local' | 'google' | 'easistent' | 'manual';

export type SchoolSource = 'easistent' | 'manual';

export type SyncSource = 'google' | 'easistent' | 'manual';

export type LessonStatus = 'normal' | 'changed' | 'substitution' | 'cancelled';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface CalendarRecord {
  id: string;
  source: EventSource;
  externalId: string | null;
  name: string;
  color: string;
  visible: boolean;
}

export interface EventRecord {
  id: string;
  calendarId: string;
  source: EventSource;
  externalId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  recurring: boolean;
  updatedAt: string;
  /** Owning subject (eAsistent events), null for local/manual events. */
  subjectId: string | null;
}

export interface SubjectRecord {
  id: string;
  externalId: string | null;
  name: string;
  shortName: string | null;
  color: string | null;
}

export interface LessonRecord {
  id: string;
  subjectId: string;
  teacher: string | null;
  classroom: string | null;
  startUtc: string;
  endUtc: string;
  status: LessonStatus;
  /** Change note, e.g. the original subject of a substitution. */
  note: string | null;
}

export interface GradeRecord {
  id: string;
  subjectId: string;
  value: string;
  weight: number;
  date: string;
  note: string | null;
  source: SchoolSource;
}

export interface HomeworkRecord {
  id: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  dueDate: string;
  done: boolean;
  source: SchoolSource;
}

export interface HolidayRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface SyncStateRecord {
  source: SyncSource;
  lastSuccessUtc: string | null;
  lastError: string | null;
  status: SyncStatus;
}
