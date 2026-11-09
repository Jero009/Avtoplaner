import { type GoogleRequestFn } from './http';
import type { GoogleCalendarInfo, GoogleEvent } from './types';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Thin read client for the Google Calendar API. All pagination is resolved
 * internally so callers receive complete lists.
 */
export function createGoogleCalendarClient(
  accessToken: string,
  request: GoogleRequestFn,
) {
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  async function getJson(url: string): Promise<Record<string, unknown>> {
    const response = (await request('GET', url, { headers: authHeaders })) as Record<
      string,
      unknown
    >;
    return response ?? {};
  }

  return {
    /** All calendars the user has (including shared and holiday ones). */
    async listCalendars(): Promise<GoogleCalendarInfo[]> {
      const calendars: GoogleCalendarInfo[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(`${CALENDAR_API_BASE}/users/me/calendarList`);
        url.searchParams.set('maxResults', '250');
        if (pageToken) {
          url.searchParams.set('pageToken', pageToken);
        }
        const page = await getJson(url.toString());
        const items = Array.isArray(page.items) ? page.items : [];
        for (const item of items) {
          const record = item as Record<string, unknown>;
          if (typeof record.id !== 'string' || typeof record.summary !== 'string') {
            continue;
          }
          calendars.push({
            id: record.id,
            summary: record.summary,
            primary: record.primary === true,
          });
        }
        pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
      } while (pageToken);
      return calendars;
    },

    /**
     * Every event of one calendar inside the window. `singleEvents=true`
     * expands recurring series into concrete instances so the local timeline
     * can render the real dates; `orderBy=startTime` keeps the order stable.
     */
    async listEvents(
      calendarId: string,
      window: { timeMin: string; timeMax: string },
    ): Promise<GoogleEvent[]> {
      const events: GoogleEvent[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        );
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('maxResults', '250');
        url.searchParams.set('timeMin', window.timeMin);
        url.searchParams.set('timeMax', window.timeMax);
        if (pageToken) {
          url.searchParams.set('pageToken', pageToken);
        }
        const page = await getJson(url.toString());
        const items = Array.isArray(page.items) ? page.items : [];
        for (const item of items) {
          if (item && typeof (item as Record<string, unknown>).id === 'string') {
            events.push(item as GoogleEvent);
          }
        }
        pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
      } while (pageToken);
      return events;
    },
  };
}
