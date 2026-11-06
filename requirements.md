# Autoplaner – Project Requirements

**Version:** 1.2
**Status:** Simplified, buildable specification
**Application type:** Android APK (primary) + installable PWA (secondary)
**Languages:** Slovenian (default), English

---

## 0.1 Naming and versioning standard

- The product name is **Autoplaner**. Use this spelling and capitalization in
  the UI, documentation, and release notes.
- The Android application ID is `com.jero009.autoplaner`. It must not change
  after the first installed release.
- APK artifact names use lowercase kebab case:
  `autoplaner-{appVersion}-{buildType}.apk`, for example
  `autoplaner-0.1.0-debug.apk`.
- App versions use Semantic Versioning (`MAJOR.MINOR.PATCH`):
  - `MAJOR`: incompatible behavior or data changes.
  - `MINOR`: backward-compatible user-visible features.
  - `PATCH`: backward-compatible fixes and maintenance.
- The initial development release is `0.1.0`. Pre-release identifiers may be
  appended when needed, such as `0.2.0-beta.1`.
- Android `versionCode` is a positive integer that increases for every
  installable APK, including debug and pre-release builds. It is independent
  of the app version and must never be reused.
- The database `schema_version` and requirements-document `Version` are
  separate version numbers and must not be used as the app version.

---

## 0. Guiding Rule

> **As simple as possible, but it has to work.**

Every feature in this document has a known, working implementation path.
Anything that needs a backend, background servers, or fragile workarounds is postponed or marked as a limitation.

**Decision:** Autoplaner is a personal app for **exactly one user** (the developer). It is not published or shared. Consequences:
- Google Cloud stays in **"Testing"** mode with one test user (your own account), so no app verification is needed.
- The eAsistent integration only has to work for your own account and school.
- The APK is sideloaded (debug or self-signed build), so there's no Play Store.
- The PWA on GitHub Pages is only for your own use. Your Google OAuth client allows only that origin and `localhost`.

---

## 1. Overview

Autoplaner is a personal calendar that shows, in one place:

- the school timetable, grades and homework from **eAsistent**,
- personal events from **Google Calendar**,
- the user's own **local events**.

All data is stored locally in SQLite. There is no backend, no login and no user accounts.

### 1.1 Platform roles

| Feature | Android APK | Browser PWA |
|---|---|---|
| Local calendar & events | ✅ | ✅ |
| Dashboard, themes, languages | ✅ | ✅ |
| Google Calendar | ✅ | ✅ |
| eAsistent | ✅ | ⚠️ Only if Phase 0 confirms it works (CORS) |
| Notifications when app is closed | ✅ (scheduled local notifications) | ❌ In-app only |
| Backup / restore | ✅ | ✅ |

**Android is the main platform.** The PWA is a convenience version that shares the same code.

---

## 2. Technology Stack

| Area | Choice | Why |
|---|---|---|
| UI | React + TypeScript + Vite | Standard, fast |
| Styling | Tailwind CSS | `dark` class for themes |
| Icons | Lucide | — |
| Calendar UI | FullCalendar (free MIT views only: dayGrid, timeGrid, list) | Day / week / month / agenda for free |
| Android | Capacitor | Same code as web |
| Database | `@capacitor-community/sqlite` | **One API for both platforms** (native SQLite on Android, WASM + IndexedDB on web) |
| HTTP | `CapacitorHttp` | Bypasses CORS on Android (needed for eAsistent) |
| Dates | `date-fns` + `date-fns-tz` | Time zones & DST |
| i18n | `react-i18next` | — |
| Notifications | `@capacitor/local-notifications` | Works when app is closed on Android |
| Secure storage | A Capacitor secure-storage plugin (Android Keystore) | eAsistent / Google tokens |
| PWA | `vite-plugin-pwa` | Offline app shell |
| Font | Roboto, **self-hosted** | Works offline |
| Hosting (PWA) | GitHub Pages | Free, static, HTTPS |
| CI | GitHub Actions | Build web + debug APK |

### 2.1 Explicitly not used

Backend server, VPS, Docker, cloud database, background sync servers, Web Push.

---

## 3. Phase 0 – Technical Spikes (do this first, 1–3 days)

Nothing else is built until these two questions are answered. Write the results into `docs/spikes.md`.

### 3.1 eAsistent spike

1. Find the login and data endpoints used by the eAsistent mobile app (unofficial; check existing open-source clients for reference).
2. From an **Android test build** (`CapacitorHttp`): log in, then fetch timetable, grades and homework.
3. From the **browser** (`fetch`): try the same requests and check whether CORS blocks them.
4. Record what works:

| Data | Android | Browser |
|---|---|---|
| Login | ? | ? |
| Timetable (incl. changes/substitutions) | ? | ? |
| Grades | ? | ? |
| Homework | ? | ? |

**Decision rule:**
- If Android works → build the integration (Android only, unless the browser also works).
- If nothing works → drop eAsistent and add **manual timetable entry** instead (see 6.4).

**Note:** The API is unofficial and can change at any time. The integration must fail gracefully and keep showing cached data.

### 3.2 Google Calendar spike

1. Create a Google Cloud project, enable the Calendar API, set the consent screen to **Testing**, and add your own Google account as a test user.
2. **Android:** sign in with a Capacitor Google sign-in plugin that returns an **access token** with the scope `https://www.googleapis.com/auth/calendar`. Google blocks OAuth inside a WebView, so a native plugin is required.
3. **Browser:** sign in with **Google Identity Services (token model)**.
4. Fetch `calendarList` and the events for one week.

**Known limitation:** access tokens last about one hour. When a token expires, the app requests a new one (silently if possible, otherwise the user taps "Reconnect"). There is no refresh token and no background sync.

---

## 4. Features

### 4.1 Dashboard
- Today's lessons
- Today's events
- Next 7 days of events
- Homework due soon
- Latest timetable changes
- Last sync time + a **Sync now** button

### 4.2 Calendar
- Views: **Day, Week, Month, Agenda**
- School, Google and local events shown together, each source in its own color
- Toggle each calendar on/off
- Tap an event to open its details
- Create / edit / delete **local** events
- Create / edit / delete **Google** events (requires internet)
- **Conflict detection:** overlapping events are highlighted, with a warning on the event detail. The user decides what to do.

### 4.3 Timetable
- Subjects, teachers, classrooms, lesson times
- Changes, substitutions, cancelled lessons (highlighted)
- School holidays

### 4.4 Grades
- Grades grouped by subject, with dates
- Subject average (calculated locally if eAsistent doesn't provide one)
- Overall average

### 4.5 Homework
- List with subject, description and due date
- Mark as done (stored locally)
- Filter: upcoming / done

### 4.6 Settings
- Theme: light / dark / system
- Language: Slovenian / English
- Calendar visibility and colors
- Reminder default (5 min, 10 min, 15 min, 30 min, 1 h, 1 day)
- Connect / disconnect eAsistent
- Connect / disconnect Google
- Export / import backup
- Storage status (browser: shows whether persistent storage was granted)

---

## 5. Sync – the simple model

There is **no background sync and no offline change queue.**

### 5.1 When sync happens
- When the app opens
- When the user taps **Sync now** (or pulls to refresh)
- When the app returns to the foreground, at most every 15 minutes

### 5.2 How sync works
1. Download fresh data from the source.
2. In **one transaction**, replace that source's cached rows in SQLite.
3. Save the sync time and status in the `sync_state` table.
4. On failure: keep the old data, show the error, and let the user retry.

### 5.3 Ownership rules
| Data | Owner | Offline |
|---|---|---|
| Local events | SQLite | Full create / edit / delete |
| Google events | Google | **Read-only** offline. Edits require internet and go straight to the Google API, followed by a re-sync. |
| eAsistent data | eAsistent | Read-only cache |
| Homework "done" status | SQLite | Full |

### 5.4 Google details
- Download events from **−1 month to +3 months**, using `singleEvents=true` so Google expands recurring events.
- Recurring events are **displayed** but can only be edited as a whole series (no "this event only" in v1).
- New events created from Autoplaner are **non-recurring** in v1.

---

## 6. Database

### 6.1 Rules
- All times are stored in **UTC ISO strings** and displayed in **Europe/Ljubljana**.
- The schema version is stored in `meta`. Migrations are numbered SQL files run at startup.
- All writes from a sync run inside one transaction.

### 6.2 Tables

```
meta            (key, value)                       -- schema_version, etc.
settings        (key, value)
calendars       (id, source, external_id, name, color, visible)
events          (id, calendar_id, source, external_id, title, description,
                 location, start_utc, end_utc, all_day, recurring, updated_at)
subjects        (id, external_id, name, short_name, color)
lessons         (id, subject_id, teacher, classroom, start_utc, end_utc,
                 status)                            -- normal | changed | substitution | cancelled
grades          (id, subject_id, value, weight, date, note, source)  -- source: easistent | manual
homework        (id, subject_id, title, description, due_date, done, source)
holidays        (id, name, start_date, end_date)
sync_state      (source, last_success_utc, last_error, status)
```

`source` is one of `local | google | easistent | manual`.

### 6.3 Indexes
- `events(start_utc)`
- `lessons(start_utc)`
- `homework(due_date)`

### 6.4 Fallback: manual school data
If eAsistent is not possible, the user can enter their weekly timetable and grades by hand (`source = manual`). The same tables and screens are used.

---

## 7. Notifications

### 7.1 Android
- Use `@capacitor/local-notifications`.
- After each sync, **reschedule** notifications for:
  - event reminders (default interval from Settings),
  - homework due tomorrow,
  - timetable changes / cancellations found in the latest sync.
- Scheduled notifications fire even when the app is closed.

### 7.2 Browser
- In-app notification banners only.
- Optionally, browser notifications while the app is open.

### 7.3 Limitation
New timetable changes are only detected when a sync runs (app opened / foreground). There is no push.

---

## 8. Backup & Restore

- **Export:** all tables to one JSON file containing `{ appVersion, schemaVersion, exportedAt, data }`.
  - Android: save with the share sheet.
  - Browser: download the file.
- **Import:** validate the structure and `schemaVersion` → show a confirmation ("This will replace all data") → replace everything in one transaction.
- Tokens and passwords are **never** included in backups.

---

## 9. Security & Privacy

- No backend. Data only goes to Google and eAsistent.
- The eAsistent password is used once to log in. **Only the session token** is stored (secure storage on Android). If the token expires, the user logs in again.
- Google access tokens are kept in memory or secure storage only.
- Tokens and passwords are never logged.
- Disconnect removes the tokens and that source's cached data.
- HTTPS only.

---

## 10. Design

- Blue and white palette, Roboto, clean and minimal
- Light, dark and system themes
- **Mobile:** bottom navigation (Dashboard, Calendar, Timetable, Grades, Homework), with Settings in the header
- **Desktop:** collapsible sidebar
- Touch-friendly controls (minimum 44 px tap targets)
- Subtle transitions only
- All text goes through i18n (`src/i18n/sl.json`, `src/i18n/en.json`)

---

## 11. Project Structure

```
autoplaner/
├── android/
├── public/
├── docs/
│   └── spikes.md
├── src/
│   ├── app/             # App shell, routing, providers
│   ├── components/      # Shared UI
│   ├── pages/           # Dashboard, Calendar, Timetable, Grades, Homework, Settings
│   ├── db/              # Connection, migrations/, repositories/
│   ├── integrations/
│   │   ├── google/
│   │   └── easistent/
│   ├── sync/            # Sync runner, sync_state handling
│   ├── notifications/
│   ├── i18n/
│   └── utils/           # Dates, conflicts, averages
├── .github/workflows/ci.yml
├── capacitor.config.ts
├── vite.config.ts
└── package.json
```

**Rule:** pages never call integrations directly. They only read from repositories. Integrations only write to the database through the sync runner.

---

## 12. Roadmap

| Phase | Goal | Done when |
|---|---|---|
| **0. Spikes** | Verify eAsistent + Google | `docs/spikes.md` written, decisions made |
| **1. Foundation** | Vite, Tailwind, Capacitor, PWA, SQLite + migrations, i18n, themes, navigation | Empty app runs on Android and in the browser; data persists across restarts |
| **2. Local calendar** | FullCalendar views, local events CRUD, conflict detection, dashboard | Fully usable offline personal calendar |
| **3. Google** | Sign-in, calendar list, events, CRUD, sync | Google events show next to local events |
| **4. School** | eAsistent (or manual fallback): timetable, grades, homework, holidays | School data shows on all screens |
| **5. Notifications & backup** | Local notifications, export / import | Reminders fire with app closed; a backup round-trip works |
| **6. Polish** | Bug fixes, testing on a real phone, GitHub Pages deploy | MVP criteria below pass |

---

## 13. Testing

**Unit tests (Vitest)** for the logic most likely to break:
- conflict detection,
- grade averages,
- UTC ↔ Ljubljana conversion (including DST change days),
- backup validation.

**Manual checklist** before each release:
- App starts in airplane mode with cached data.
- Data survives an app restart and an APK update.
- Sync failure keeps the old data and shows an error.
- The PWA installs from GitHub Pages.

**GitHub Actions:** install → lint → test → build web → build debug APK (uploaded as an artifact).

---

## 14. MVP Done Criteria

- [ ] APK installs and runs on Android
- [ ] PWA installs from GitHub Pages
- [ ] Data persists on both platforms
- [ ] App works offline with cached data
- [ ] Day, week, month and agenda views
- [ ] Local events: create / edit / delete
- [ ] Conflicts are highlighted
- [ ] Google Calendar connected, events shown and editable
- [ ] School timetable, grades and homework shown (eAsistent or manual)
- [ ] Android reminders work with the app closed
- [ ] Backup export + import work
- [ ] Slovenian + English
- [ ] Light, dark and system themes

---

## 15. Later (not in v1)

Background sync, an offline queue for Google edits, editing single recurring instances, recurring local events, morning summary, alternative-time suggestions for conflicts, encrypted database, password-protected backups, multiple Google accounts.

---

## 16. Development standards

These standards apply to all Autoplaner code and documentation. The detailed
agent workflow is maintained in [`agent.md`](agent.md).

### 16.1 Naming and file structure

- Use lowercase kebab-case for folders and non-component files:
  `sync-runner.ts`, `calendar-repository.ts`.
- Use PascalCase for React components and their files:
  `CalendarPage.tsx`, `EventForm.tsx`.
- Use camelCase for functions, variables, hooks, and repository methods.
- Use PascalCase for TypeScript types, interfaces, and classes.
- Use singular names for domain entities and repositories.
- Keep tests beside the code they test with `.test.ts` or `.test.tsx`.
- Keep one primary responsibility per file.

### 16.2 TypeScript and architecture

- Use strict TypeScript and explicit domain types at system boundaries.
- Avoid `any`, broad type assertions, and non-null assertions used only to
  silence type errors.
- Prefer small pure functions for date conversion, conflict detection,
  averages, validation, and API response mapping.
- Use `async`/`await`; handle errors explicitly and never silently swallow
  failures.
- Validate external data before writing it to SQLite.
- Keep pages and components independent from integration and database details.
- Pages read through repositories or focused hooks; integrations write through
  the sync runner.

### 16.3 Sharing and reuse

- Share behavior through focused utilities, hooks, repositories, and domain
  services rather than mutable global state.
- Do not duplicate SQL, date formatting, source checks, or sync replacement
  logic.
- Prefer composition and small explicit interfaces over inheritance and
  speculative generic abstractions.
- Extract shared code when multiple real callers share the same invariant.

### 16.4 UI and localization

- Put pages in `src/pages/` and reusable UI in `src/components/`.
- Route all user-visible text through i18n; do not hard-code JSX text.
- Provide accessible labels, keyboard support, semantic HTML, and minimum
  44 px touch targets.
- Make loading, empty, offline, and error states explicit for every data view.

### 16.5 Tests, commits, and sharing

- Test business rules and failure paths before visual details.
- Add regression tests for fixed bugs involving data, dates, sync, or
  permissions.
- Use descriptive behavior-focused test names.
- Keep commits small and single-purpose with imperative subjects.
- Do not mix formatting-only changes with behavior changes.
- Before sharing a branch or pull request, run applicable checks and
  `git diff --check`.
- Never share secrets, credentials, tokens, private school data, or generated
  authentication files.
- Preserve required third-party copyright and license notices when using
  external code.
