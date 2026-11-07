import { addDaysToDayIso } from '../../utils/dates';
import { EasistentError, defaultRequest, type RequestFn } from './http';
import type {
  EaLoginResponse,
  EaTimetableEvent,
  EaTimetableResponse,
} from './types';

const LOGIN_URL = 'https://www.easistent.com/m/login';
const BASE_URL = 'https://www.easistent.com/m';

/** The timetable endpoint rejects ranges longer than 14 days (HTTP 400, no body). */
export const MAX_RANGE_DAYS = 14;

export interface EasistentCredentials {
  username: string;
  password: string;
}

export interface EasistentSession {
  token: string;
  childId: string;
}

const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;

function assertDayIso(day: string, label: string): void {
  if (!DAY_ISO.test(day)) {
    throw new Error(`Invalid ${label} (expected YYYY-MM-DD): ${day}`);
  }
}

/**
 * Split an inclusive [fromDay, toDay] range into contiguous windows of at
 * most MAX_RANGE_DAYS days each, as required by the timetable endpoint.
 */
export function chunkRange(fromDay: string, toDay: string): [string, string][] {
  assertDayIso(fromDay, 'from date');
  assertDayIso(toDay, 'to date');
  const windows: [string, string][] = [];
  let start = fromDay;
  while (start <= toDay) {
    const end = addDaysToDayIso(start, MAX_RANGE_DAYS - 1);
    windows.push([start, end < toDay ? end : toDay]);
    start = addDaysToDayIso(end, 1);
  }
  return windows;
}

/**
 * Log in with username/password. The token expires after ~24 h, so every
 * sync re-logs in. Never logs or stores the credentials beyond the request.
 */
export async function easistentLogin(
  credentials: EasistentCredentials,
  request: RequestFn = defaultRequest,
): Promise<EasistentSession> {
  const body = {
    username: credentials.username,
    password: credentials.password,
    supported_user_types: ['parent', 'child', 'parent_of_pre_enrolled'],
  };
  const data = (await request('POST', LOGIN_URL, {
    headers: {
      'Content-Type': 'application/json',
      'x-client-platform': 'web',
      'x-client-version': '13',
      'x-app-name': 'null',
    },
    body,
  })) as EaLoginResponse;

  const token = data?.access_token?.token;
  const childId = data?.user?.id;
  if (typeof token !== 'string' || token.length === 0) {
    throw new EasistentError('parse', 'eAsistent login response is missing the access token');
  }
  if (childId === undefined || childId === null) {
    throw new EasistentError('parse', 'eAsistent login response is missing the user id');
  }
  return { token, childId: String(childId) };
}

/** Stable-stringify a timetable entry so identical entries can be deduped. */
function eventKey(event: EaTimetableEvent): string {
  const order = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(order);
    }
    if (value && typeof value === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[key] = order((value as Record<string, unknown>)[key]);
      }
      return sorted;
    }
    return value;
  };
  return JSON.stringify(order(event));
}

function sessionHeaders(session: EasistentSession): Record<string, string> {
  return {
    authorization: `Bearer ${session.token}`,
    'x-client-platform': 'web',
    'x-client-version': '13',
    // Required — the API answers 403 (code 601) without it.
    'x-child-id': session.childId,
  };
}

/**
 * Fetch all timetable entries for an inclusive date range, transparently
 * chunking it into ≤14-day windows (the endpoint's hard limit) and deduping
 * entries that come back in overlapping windows.
 */
export async function fetchTimetableRange(
  session: EasistentSession,
  fromDay: string,
  toDay: string,
  request: RequestFn = defaultRequest,
): Promise<EaTimetableEvent[]> {
  const merged = new Map<string, EaTimetableEvent>();
  for (const [from, to] of chunkRange(fromDay, toDay)) {
    const url = `${BASE_URL}/timetable/events?from=${from}&to=${to}`;
    const data = (await request('GET', url, {
      headers: sessionHeaders(session),
    })) as EaTimetableResponse;
    const entries = [...(data?.events ?? []), ...(data?.schedule ?? [])];
    for (const entry of entries) {
      merged.set(eventKey(entry), entry);
    }
  }
  return [...merged.values()];
}

/**
 * High-level client bound to one credential pair. `testConnection` only
 * verifies the login; `fetchTimetable` re-logs in on every call because the
 * token expires after ~24 h.
 */
export interface EasistentClient {
  testConnection(): Promise<EasistentSession>;
  fetchTimetable(fromDay: string, toDay: string): Promise<EaTimetableEvent[]>;
}

export function createEasistentClient(
  credentials: EasistentCredentials,
  request: RequestFn = defaultRequest,
): EasistentClient {
  return {
    testConnection: () => easistentLogin(credentials, request),
    fetchTimetable: (fromDay, toDay) =>
      easistentLogin(credentials, request).then((session) =>
        fetchTimetableRange(session, fromDay, toDay, request),
      ),
  };
}
