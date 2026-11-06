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

## Scope control

Features explicitly deferred from v1 include background sync, offline Google
edit queues, editing individual recurring instances, recurring local events,
encrypted databases, password-protected backups, and multiple Google accounts.

