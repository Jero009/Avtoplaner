# Autoplaner Agent Guide

This file is the working guide for coding agents contributing to Autoplaner.
The product requirements in [`requirements.md`](requirements.md) are the
source of truth for behavior and scope.

## Project principles

- Keep the implementation simple, local-first, and suitable for one user.
- Android is the primary platform; the browser PWA is the secondary platform.
- Do not add a backend, hosted database, background sync service, web push, or
  cloud credential store.
- Preserve offline behavior and cached data when a remote service fails.
- Do not expose, log, export, or commit passwords, access tokens, refresh
  tokens, OAuth client secrets, or school credentials.

## Architecture boundaries

- Pages and UI components read data through repositories; they must not call
  Google or eAsistent integrations directly.
- Integrations fetch remote data and write only through the sync runner.
- Sync replacement of a source cache must happen in one SQLite transaction.
- A failed sync must leave the previous cached rows intact and record the
  error in `sync_state`.
- Local events and homework completion are editable offline.
- Google and eAsistent data are source-owned caches. Google edits require an
  internet connection and a follow-up sync.

## Database rules

- Add numbered SQL migrations under `src/db/migrations/`; never rewrite an
  already released migration.
- Update `meta.schema_version` through the migration process.
- Store timestamps as UTC ISO-8601 strings and display them in
  `Europe/Ljubljana`.
- Store calendar dates as ISO-8601 `YYYY-MM-DD` strings.
- Keep foreign keys, source checks, and useful indexes in the schema.
- Use parameterized queries and explicit transactions.

## eAsistent integration

- Complete and record the Phase 0 spike in [`docs/spikes.md`](docs/spikes.md)
  before implementing the integration.
- Treat the API as unofficial and unstable. Fail gracefully and retain cached
  data.
- The selected research reference is
  [`chocoearly44/JEA`](https://github.com/chocoearly44/JEA), which is MIT
  licensed and Android-focused.
- Do not copy JEA code or add it as a dependency without updating
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and preserving its
  copyright and license notice.
- “eAsistent” is a trademark of eŠola d.o.o.; do not imply endorsement.

## Security and privacy

- Store credentials only in the platform secure-storage mechanism.
- Never include tokens or passwords in backups, logs, test fixtures, screenshots,
  or error messages.
- Use HTTPS for all remote requests.
- Disconnect operations must remove the relevant token and cached source data.

## Implementation workflow

1. Read the relevant section of `requirements.md` and existing code before
   editing.
2. Make the smallest complete change that follows the architecture boundaries.
3. Add or update tests for logic involving dates, conflicts, averages, backup
   validation, migrations, or sync failure behavior.
4. Run the narrowest applicable formatter, linter, type-check, and test command.
5. Run `git diff --check` and inspect the final diff before committing.
6. Never commit secrets, generated credentials, or unrelated formatting.

## Coding standards

### Naming and files

- Use lowercase kebab-case for folders and non-component files:
  `sync-runner.ts`, `calendar-repository.ts`.
- Use PascalCase for React components and their files:
  `CalendarPage.tsx`, `EventForm.tsx`.
- Use camelCase for functions, variables, hooks, and repository methods.
- Use PascalCase for TypeScript types, interfaces, and classes.
- Use singular names for domain entities and repositories:
  `event-repository.ts`, `subject.ts`.
- Keep tests beside the code they test with `.test.ts` or `.test.tsx`.
- Keep one primary responsibility per file. Split files when a module becomes
  difficult to scan or test, rather than creating large general-purpose files.

### TypeScript and code usage

- Prefer strict TypeScript and explicit domain types at boundaries.
- Do not use `any`, broad type assertions, or non-null assertions to silence
  errors. Add a guard, a parser, or a narrower type instead.
- Prefer small pure functions for date conversion, conflict detection,
  averages, validation, and mapping API responses.
- Use `async`/`await` and handle errors at the layer that can display or record
  them. Never silently swallow an error.
- Validate external data before mapping it into database records.
- Keep UTC conversion at integration/database boundaries; UI code receives
  already-normalized domain values.
- Use existing helpers before adding another implementation of the same logic.

### Sharing and reuse

- Share behavior through focused utilities, hooks, repository functions, or
  domain services—not through mutable global state.
- Do not duplicate SQL, date formatting, source checks, or sync replacement
  logic across pages.
- Components should receive data and callbacks through props or focused hooks;
  they should not know API, SQLite, or secure-storage details.
- Prefer composition over inheritance and small explicit interfaces over
  highly generic abstractions.
- Extract shared code only after there are two real callers with the same
  invariant. Avoid speculative frameworks and utility collections.

### UI and localization

- Put pages in `src/pages/` and reusable UI in `src/components/`.
- Keep page components focused on layout and user interaction; use
  repositories/hooks for data access.
- Every user-visible string goes through i18n. Do not hard-code text in JSX.
- Use accessible labels, keyboard support, semantic HTML, and minimum 44 px
  touch targets.
- Keep loading, empty, offline, and error states explicit for every data view.

### Tests and commits

- Test business rules and failure paths before visual details.
- Add regression tests for every fixed bug involving data, dates, sync, or
  permissions.
- Use descriptive test names that state the behavior:
  `keeps cached events when google sync fails`.
- Keep commits small and single-purpose. Use imperative subjects such as
  `Add local event repository`.
- Do not mix formatting-only changes with behavior changes.
- Before sharing a branch or pull request, run the relevant checks and inspect
  `git diff --check`.

## Scope control

Features explicitly deferred from v1 include background sync, offline Google
edit queues, editing individual recurring instances, recurring local events,
encrypted databases, password-protected backups, and multiple Google accounts.
