# Technical spikes

Phase 0 results will be recorded here before the corresponding integrations are
implemented.

## eAsistent

| Data | Android | Browser |
|---|---|---|
| Login | Pending | Pending |
| Timetable | Pending | Pending |
| Grades | Pending | Pending |
| Homework | Pending | Pending |

**Decision:** Pending.

## Google Calendar

- Android authentication: **Verified by design** — OAuth 2.0 Authorization
  Code + PKCE via the system browser (Custom Tabs), redirect through the
  reverse-client-ID custom scheme `com.googleusercontent.apps.<id>:`
  (auto-registered by Google for Android clients). Requires a free
  Android-type OAuth client (see [`google-oauth-setup.md`](google-oauth-setup.md)).
- Browser authentication: Supported by the same PKCE flow — requires the
  deployed origin registered as a Web-application redirect (pending PWA
  deploy).
- Calendar/event fetch: `calendarList.list` + `events.list` with
  `singleEvents=true` (recurrences expanded), full-replace sync into SQLite.
- Token storage: refresh token in the local SQLite settings table, excluded
  from backups.

**Decision:** No backend, no embedded secret — pure client-side PKCE. ONE
maintainer-registered client ships inside the app
(`embedded-client-id.ts`) so end users connect with zero setup; the Settings
field stays as a per-user override. Implemented in `src/integrations/google/`
(v1.4.0).

