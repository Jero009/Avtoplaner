import type { DeviceCalendarPluginInterface } from './plugin';

/**
 * Web/PWA stub: no CalendarProvider exists in the browser. The Settings UI
 * hides the feature behind an explanatory note on web, so these methods are
 * only reachable through the automatic post-sync hook, which checks
 * `deviceCalendarSupported()` first. Keep them rejecting (not throwing in
 * constructors) so an accidental call is a loud no-op failure.
 */
export class DeviceCalendarWeb implements DeviceCalendarPluginInterface {
  async checkPermissions() {
    return { readCalendar: 'denied' as const, writeCalendar: 'denied' as const };
  }

  async requestPermissions() {
    return { readCalendar: 'denied' as const, writeCalendar: 'denied' as const };
  }

  async listWritableCalendars() {
    return { calendars: [] };
  }

  async createCalendar(): Promise<{ id: string }> {
    throw new Error('Device calendar is only available in the Android app');
  }

  async applyChanges(): Promise<{ createdIds: number[] }> {
    throw new Error('Device calendar is only available in the Android app');
  }
}
