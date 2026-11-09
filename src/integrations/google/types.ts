/**
 * Types for the Google Calendar API responses we consume. Only the fields
 * actually used are declared — everything else is ignored on parse.
 */

/** One entry of the user's calendar list (their own calendars). */
export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  /** True for the user's main calendar. */
  primary: boolean;
}

/** Google date/time field: a full RFC 3339 timestamp or an all-day date. */
export interface GoogleEventTime {
  dateTime?: string;
  /** All-day form: `YYYY-MM-DD`, exclusive on `end`. */
  date?: string;
}

/** One event as returned by `events.list`. */
export interface GoogleEvent {
  id: string;
  /** `cancelled` events are deletions/tombstones and never stored. */
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  /**
   * Present on instances of a recurring series (fetched with
   * `singleEvents=true`), absent on standalone events.
   */
  originalStartTime?: GoogleEventTime;
}

export interface GoogleTokenSet {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Only present when a new consent was granted (`prompt=consent`). */
  refreshToken?: string;
}
