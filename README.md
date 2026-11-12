**English** | [Slovenščina](README.sl.md)

# Autoplaner

Autoplaner is a personal calendar for Android and the web. It combines local
events, Google Calendar data, and school information from eAsistent in one
offline-capable application.

The application is planned with React, TypeScript, Vite, Capacitor, SQLite,
and a PWA build. Data is stored locally; there is no Autoplaner backend.

## Status

- **Local calendar (v1.0):** FullCalendar views, local event CRUD with
  conflict detection, dashboard, themes, sl/en i18n, SQLite with migrations,
  backup export/import, Android (Capacitor) + PWA builds.
- **eAsistent integration (v1.1):** login + timetable sync into the local
  database (lessons, substitutions/cancellations, homework, announced
  tests), shown in the calendar, timetable and homework pages. Android only
  for syncing — the browser/PWA is blocked by CORS and shows a clear error.
  Grades, Google Calendar and closed-app notifications are tracked in the
  Status list below.
- **Device calendar + background sync (v1.3):** synced eAsistent data can
  be written into an Android device calendar (CalendarProvider — works with
  Fossify/DAVx⁵, no Google API) via a purpose-built Capacitor plugin
  (`DeviceCalendarPlugin.java`). Idempotent: a SQLite mapping table
  (`device_calendar_map`) updates events in place and deletes them when the
  source disappears; cancelled hours are written marked with ❌, tests as
  `🧪 <subject> — <topic>`, homework as `📝 <subject> — domača naloga` at
  the owning lesson hour. Group-picker choices are respected (non-selected
  groups never leave the app). eAsistent also auto-syncs on app open when
  the last sync is >6 h old and daily in the background
  (@transistorsoft/capacitor-background-fetch / WorkManager, network-only,
  silent failures). Web/PWA shows an explanatory note instead.
- **Google Calendar connection (v1.4):** OAuth 2.0 with PKCE and no
  backend; an app-wide OAuth client ID is embedded so any user can connect
  without setting up Google Cloud (overridable per user in Settings).
  Syncs all of the user's Google calendars into a single "Google" bucket
  shown alongside local and eAsistent events. Android only — the browser
  PWA has no deep-link redirect. The refresh token is excluded from
  backup export/import. Confirmed working end-to-end on Android as of
  v1.4.6 (exact reverse-client-id scheme registered in the manifest +
  native JSON response handling).

Grades and closed-app notifications are not implemented yet.

Pre-development prerequisites and their status are tracked in
[`docs/pre-development.md`](docs/pre-development.md).

## eAsistent implementation reference

The selected reference repository is
[`chocoearly44/JEA`](https://github.com/chocoearly44/JEA).

It was selected because it is an eAsistent API client with an **MIT license**
and a Java/Android focus, which is the closest match for Autoplaner’s primary
Android platform. It is a research reference for understanding authentication
and data retrieval only. Autoplaner does **not** copy JEA source code, bundle
JEA, or depend on its Maven artifact.

The following alternatives were reviewed:

- [`jakobkordez/easistent_client`](https://github.com/jakobkordez/easistent_client):
  MIT licensed, but Flutter-specific.
- [`umalavasic/eAUrnik`](https://github.com/umalavasic/eAUrnik):
  MIT licensed, but exposes timetable scraping through a separate Python
  server and does not cover the required Android integration.

The eAsistent integration is implemented independently in
`src/integrations/easistent/`, using the project’s existing sync and SQLite
boundaries. It must fail gracefully and retain cached data when the unofficial
service changes or is unavailable.

## License and attribution

Original Autoplaner source code is licensed under the MIT License; see
[`LICENSE`](LICENSE).

The selected JEA repository is separately licensed under the MIT License.
Its copyright and permission notice are preserved in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). If code from JEA is ever
copied into this repository, the complete notice must remain with the copied
code and the change must be recorded there.

“eAsistent” is a trademark of eŠola d.o.o. Autoplaner is an independent
personal project and is not affiliated with or endorsed by eŠola d.o.o.
Access to eAsistent must comply with its terms and applicable law.

## Development

See [`requirements.md`](requirements.md) for the full product requirements and
roadmap. Database migrations are in `src/db/migrations/` and are applied in
numeric order. Timestamps are stored as UTC ISO-8601 strings.

### Documentation map

- [`requirements.md`](requirements.md) — product requirements and roadmap
  (source of truth for behavior and scope).
- [`agent.md`](agent.md) — working guide for coding agents.
- [`docs/PROJECT-OVERVIEW.md`](docs/PROJECT-OVERVIEW.md) — technical overview:
  stack, integrations, and release pipeline.
- [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) — Google Cloud /
  OAuth client configuration used by the embedded client ID.
- [`docs/privacy.md`](docs/privacy.md) — privacy policy (OAuth consent screen).
- [`docs/pre-development.md`](docs/pre-development.md) — pre-development
  prerequisites and their status.
- [`docs/spikes.md`](docs/spikes.md) — research notes.
- [`docs/release.md`](docs/release.md) — how to build and publish a release.
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — known device issues
  and how to diagnose them.

### Build and test

```sh
npm install
node scripts/copy-sqlite-wasm.mjs   # required before running the web app
npm run dev                         # web dev server
npm run build                       # production web bundle into dist/
npm run lint
npx vitest run                      # unit tests
npx cap sync android                # MUST run after every npm run build
cd android && ./gradlew assembleDebug
```

Releases are documented in
[`docs/release.md`](docs/release.md).
