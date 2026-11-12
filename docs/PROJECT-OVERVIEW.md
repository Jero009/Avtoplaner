# Autoplaner — Project Overview

## What the app does

Autoplaner (also published as **Avtoplaner** on Google Play) is a personal calendar
application for Android, with a complementary Progressive Web App (PWA) frontend.
It combines three sources of events into a single offline-capable local database:

1. **Local calendar events** — manually added or imported events stored directly in
   SQLite. FullCalendar views, CRUD with conflict detection, theming, and sl/en
   i18n.

2. **eAsistent integration** — fetches a user's school timetable, substitutions/
   cancellations, homework, and announced tests from the unofficial eAsistent API.
   The data is synced into the local database and displayed alongside local events
   and Google Calendar events. On Android, synced entries can also be written into
   the native Android device calendar via the `DeviceCalendarPlugin`. The browser/PWA
   cannot call the eAsistent API due to CORS restrictions — it only shows an
   explanatory note.

3. **Google Calendar connection** — OAuth 2.0 Authorization Code + PKCE with an
   app-wide embedded client ID. Any user can connect their Google account without
   setting up a Cloud project (the ID is overrideable per user in Settings). Synced
   Google calendars and events are displayed in a single "Google" bucket alongside
   local and eAsistent events. The browser/PWA has no deep-link redirect for this
   flow.

Optional features that are not yet implemented: grades and closed-app
notifications.

The app is **offline-first, local-only, single-user**. It has no backend server,
no hosted database, no accounts, and no analytics. All data stays on the device.


## Full tech stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React 19 + TypeScript | `src/` directory; `main.tsx` entry |
| **Build tooling** | Vite 8+ | `npm run build` produces `dist/`; `tailwindcss` JIT CSS |
| **Styling** | Tailwind CSS 4.3.5 | `@tailwindcss/vite` Vite plugin |
| **PWA** | `vite-plugin-pwa` 2.0.0 | Web app manifest, workbox runtime caching |
| **Capacitor** | `@capacitor/core` 8.6.0 + Android 8.6.0 | Bridge between web and native |
| **SQLite (web)** | `sql.js` 1.11.0 | In-browser SQLite via WASM |
| **SQLite (Android)** | `@capacitor-community/sqlite` 8.1.1 | Capacitor plugin; `androidIsEncryption: false` in `capacitor.config.ts` |
| **Background sync** | `@transistorsoft/capacitor-background-fetch` 8.1.4 | WorkManager / JobScheduler-driven daily fetch; silent failures land in `sync_state` |
| **i18n** | `i18next` 26.7.2 + `react-i18next` 17.1.13 | Slovenian (sl) and English (en) locales; `src/i18n/index.ts` |
| **UI icons** | `lucide-react` 1.70.0 | Icon component library |
| **Date handling** | `date-fns` 4.4.0 + `date-fns-tz` 3.2.0 | UTC ISO-8601 storage; Ljubljana timezone display |
| **Testing** | Vitest 5.1.0 | `npx vitest run`; unit tests in `src/**/*.test.{ts,tsx}` |

### Android-native layer

| Component | Technology |
|---|---|
| Language | Kotlin |
| Build system | Gradle 8.13.0 |
| SDK | compileSdk 36, minSdk 24, targetSdk 36 |
| AndroidX | appcompat 1.7.1, coordinatorlayout 1.3.0, core-splashscreen, fragment 1.8.9 |
| Google Services | `google-services` 4.4.4 plugin (optional, from `google-services.json`) |
| Signing | Keystore in `keystore/autoplaner.jks`; passwords from `keystore/keystore.properties` (gitignored) |
| Embedded OAuth client ID | `30079128182-d7r0tnmm083hhr2u02jbv0ik9tr9bjau.apps.googleusercontent.com` (see `src/integrations/google/embedded-client-id.ts`) |
| Version | `versionCode: 14`, `versionName: "1.4.4"` (in `android/app/build.gradle`) |

### Database

- SQLite via `@capacitor-community/sqlite` and `sql.js` (WASM)
- Migrations under `src/db/migrations/` applied in numeric order
- Timestamps stored as UTC ISO-8601; displayed in `Europe/Ljubljana`
- Calendar dates stored as `YYYY-MM-DD` ISO-8601 strings
- Schema version tracked in `meta.schema_version`
- Credentials (eAsistent password, Google refresh token) **excluded** from backup export/import

### Key plugins

- `@capacitor-community/sqlite` — SQLite bridge; encryption disabled (`androidIsEncryption: false`)
- `@transistorsoft/capacitor-background-fetch` — daily background fetch interval (1440 min)
- `DeviceCalendarPlugin` (native Java) — writes synced events to Android CalendarProvider; idempotent via `device_calendar_map` mapping table
- `@capacitor/app` — app lifecycle events


## eAsistent integration

The eAsistent client is implemented in `src/integrations/easistent/`. It is **not a
direct dependency of JEA** (the `chocoearly44/JEA` repository) nor does it bundle
JEA source code or depend on its Maven artifact. The integration was independently
implemented, but the `chocoearly44/JEA` repository was used as a research reference
for understanding the unofficial eAsistent API authentication flow and data
retrieval patterns.

- **Upstream reference:** <https://github.com/chocoearly44/JEA> (MIT licensed,
  Android-focused). It was selected because it is the closest match for
  Autoplaner's Android platform and serves as an implementation reference for
  authentication and timetable scraping.

- **Endpoints used:**
  - `POST https://www.easistent.com/m/login` — login with username/password;
    returns JWT access token and user child ID. Request includes headers
    `x-client-platform: web`, `x-client-version: 13`, `x-app-name: null`.
  - `GET https://www.easistent.com/m/timetable/events?from=YYYY-MM-DD&to=YYYY-MM-DD` —
    timetable fetch. The endpoint rejects ranges longer than 14 days (HTTP 400).
    Response includes `events` and `schedule` arrays. Results are chunked into
    ≤14-day windows transparently and deduped on overlap.
  - All requests include `authorization: Bearer <token>` and `x-child-id: <id>`
    headers.

- **Token expiry:** The access token expires after ~24 hours, so every sync
  re-logs in. Credentials (username/password) are stored only in the platform
  secure-storage mechanism and are never included in backups, logs, or error
  messages.

- **Browser limitation:** The browser/PWA cannot reach the eAsistent API because
  CORS headers are not sent from the eAsistent server for WebView-origin requests.
  The user sees a clear error message: *"Request failed before reaching eAsistent.
  In a browser/PWA the eAsistent API is blocked by CORS — use the Android app to
  sync."* Sync is Android-only for the eAsistent integration.


## Google Calendar OAuth summary

- **Authentication method:** OAuth 2.0 Authorization Code + PKCE, entirely
  client-side. No backend, no embedded secret.
- **Embedded client ID:** `30079128182-d7r0tnmm083hhr2u02jbv0ik9tr9bjau.apps.googleusercontent.com`
  (defined in `src/integrations/google/embedded-client-id.ts`). This is a
  publicly readable ID — no client secret is embedded.
- **How it works:** Any user can press **Connect** in Settings. The app initiates
  PKCE flow through the system browser (Custom Tabs on Android, native Safari on
  iOS). The redirect uses the reverse-client-ID custom scheme
  `com.googleusercontent.apps.<id>:/oauth2redirect`, which Google auto-registers
  for Android clients.
- **Permissions:** Read-only scope `https://www.googleapis.com/auth/calendar`.
  Write support is not implemented.
- **Per-user override:** Users can enter their own Google Cloud client ID in
  Settings if they wish to use a custom project.
- **Token storage:** The refresh token is stored locally in the app's SQLite
  settings table, **excluded from backups**. Disconnecting (Settings → Google
  Calendar → Disconnect) deletes the token and all synced Google events from the
  device. The Google account itself is untouched.
- **Browser/PWA:** The Calendar API works from a browser (CORS-enabled), but the
  PWA OAuth flow requires a deployed origin registered as a redirect URI. This is
  pending until a GitHub Pages deploy exists.
- **No backend:** The entire flow is peer-to-peer between the app and Google.


## Build / release pipeline summary

| Step | Command | What it does |
|---|---|---|
| **1. Install deps** | `npm ci` | Installs exact versions from `package-lock.json` |
| **2. Copy SQLite WASM** | `node scripts/copy-sqlite-wasm.mjs` | Copes `sql-wasm.wasm` and `sql-wasm.worker.js` into `public/` |
| **3. Build Vite** | `npm run build` | `tsc --noEmit` + `vite build` → `dist/` |
| **4. Sync to Android** | `npx cap sync android` | Copies `dist/assets/` into `android/app/src/main/assets/public/`; **mandatory after every build** |
| **5. Build native APK** | `cd android && ./gradlew assembleRelease` | Produces `app-release.apk` in `app/build/outputs/apk/release/` |
| **6. Signing** | Keystore in `keystore/autoplaner.jks` | Passwords from `keystore/keystore.properties` (gitignored). Release builds sign if the properties file exists; debug builds use debug keystore. |
| **7. Verify** | `./gradlew --no-daemon assembleHermesDebug assembleIrisDebug` + lint + unit tests | Full verification matrix (Hermes and Iris flavors) |
| **8. Publish** | `gh release create vX.Y.Z app-release.apk --title "vX.Y.Z" --notes "<changes>"` | New GitHub release with APK asset; versionCode incremented; `versionName` synchronized with `package.json` |

**Version conventions:**
- `package.json` `version`: semantic e.g. `1.4.4`
- `android/app/build.gradle` `versionCode`: integer, incremented by 1 each release
- `android/app/build.gradle` `versionName`: same string as `package.json` `version`

**Mandatory Capacitor sync:** `npx cap sync android` must be run after every
`npm run build`. The Gradle build packages `android/app/src/main/assets/public/`,
**not** `dist/`. Skipping this step ships a stale web bundle (regression from v1.4.1).

**Release commit message convention:**
```
chore(release): bump version to X.Y.Z / versionCode N
```

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs on push and pull request:
`npm ci` → copy-sqlite-wasm → lint → typecheck → test → build → upload `dist`
artifact. Releases go straight to `main`; CI is not a release blocker.