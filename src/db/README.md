# Database

SQLite migrations are applied in numeric order when the app starts. The
currently installed schema version is stored in `meta` under
`schema_version`.

All timestamps use UTC ISO-8601 strings. Calendar dates use ISO-8601
`YYYY-MM-DD` strings. Sync implementations must replace their source-owned
cache rows in one transaction and update `sync_state` only after a successful
commit.

