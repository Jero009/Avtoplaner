import type { DbDriver } from '../driver';
import { createCalendarRepository } from './calendar-repository';
import { createEventRepository } from './event-repository';
import { createGradeRepository } from './grade-repository';
import { createHomeworkRepository } from './homework-repository';
import { createLessonRepository } from './lesson-repository';
import { createSyncStateRepository } from './sync-state-repository';

export interface Repositories {
  calendars: ReturnType<typeof createCalendarRepository>;
  events: ReturnType<typeof createEventRepository>;
  homework: ReturnType<typeof createHomeworkRepository>;
  lessons: ReturnType<typeof createLessonRepository>;
  grades: ReturnType<typeof createGradeRepository>;
  syncState: ReturnType<typeof createSyncStateRepository>;
}

export function createRepositories(driver: DbDriver): Repositories {
  return {
    calendars: createCalendarRepository(driver),
    events: createEventRepository(driver),
    homework: createHomeworkRepository(driver),
    lessons: createLessonRepository(driver),
    grades: createGradeRepository(driver),
    syncState: createSyncStateRepository(driver),
  };
}
