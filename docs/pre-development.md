# Pre-development readiness

This checklist defines what must be ready before feature implementation starts.
It is intentionally separate from the product roadmap: roadmap phases describe
what gets built, while this document records the prerequisites and their status.

## Ready now

- [x] Product scope is local-first, single-user, Android-primary, and has no
      backend.
- [x] Product name, Android application ID, APK artifact naming, and versioning
      are defined in `requirements.md`.
- [x] Technology choices and source layout are defined in `requirements.md`.
- [x] Database migration rules and UTC timestamp rules are defined in
      `agent.md`.
- [x] Backup format includes `appVersion`, `schemaVersion`, `exportedAt`, and
      `data`; credentials are excluded.
- [x] UI language, theme, navigation, accessibility, and platform roles are
      defined.

## Required before integration code

- [ ] Complete `docs/spikes.md` using a real Android test build and record the
      eAsistent login, timetable, grades, and homework results.
- [ ] Confirm whether eAsistent browser requests work with CORS. If not, keep
      eAsistent Android-only and define the manual/PWA fallback.
- [ ] Create the Google Cloud OAuth clients and record the allowed redirect
      URIs without committing credentials or secrets.
- [ ] Verify Google authentication and calendar permissions on Android and in
      the browser.
- [ ] Choose the secure-storage plugin and verify token deletion on disconnect.

## Required before the first release build

- [ ] Create the Vite/React/TypeScript, Capacitor, Android, PWA, test, lint, and
      CI scaffold.
- [ ] Verify `com.jero009.autoplaner` on a real Android device.
- [ ] Configure debug signing locally and document release signing without
      storing the keystore or passwords in Git.
- [ ] Add GitHub Actions for install, lint, test, web build, and debug APK
      artifact upload.
- [ ] Run the manual release checklist from `requirements.md` on a real phone.

## Decision rule

Local calendar and database foundation work may begin immediately. Google and
eAsistent integration work must wait until their corresponding spike entries
are no longer `Pending`. If an integration cannot be verified, implement the
documented fallback instead of adding an untested network dependency.
