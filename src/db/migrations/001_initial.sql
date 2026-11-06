-- Autoplaner schema v1
-- All timestamps are UTC ISO-8601 strings. Dates are ISO-8601 calendar dates.

PRAGMA foreign_keys = ON;

CREATE TABLE meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT INTO meta (key, value) VALUES ('schema_version', '1');

CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE calendars (
    id TEXT PRIMARY KEY NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('local', 'google', 'easistent', 'manual')),
    external_id TEXT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    UNIQUE (source, external_id)
);

CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    calendar_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('local', 'google', 'easistent', 'manual')),
    external_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_utc TEXT NOT NULL,
    end_utc TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
    recurring INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0, 1)),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE CASCADE,
    CHECK (end_utc > start_utc),
    UNIQUE (source, external_id)
);

CREATE TABLE subjects (
    id TEXT PRIMARY KEY NOT NULL,
    external_id TEXT,
    name TEXT NOT NULL,
    short_name TEXT,
    color TEXT,
    UNIQUE (external_id)
);

CREATE TABLE lessons (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT NOT NULL,
    teacher TEXT,
    classroom TEXT,
    start_utc TEXT NOT NULL,
    end_utc TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'normal'
        CHECK (status IN ('normal', 'changed', 'substitution', 'cancelled')),
    FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
    CHECK (end_utc > start_utc)
);

CREATE TABLE grades (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT NOT NULL,
    value TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
    date TEXT NOT NULL,
    note TEXT,
    source TEXT NOT NULL CHECK (source IN ('easistent', 'manual')),
    FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE
);

CREATE TABLE homework (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    source TEXT NOT NULL CHECK (source IN ('easistent', 'manual')),
    FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE SET NULL
);

CREATE TABLE holidays (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    CHECK (end_date >= start_date)
);

CREATE TABLE sync_state (
    source TEXT PRIMARY KEY NOT NULL
        CHECK (source IN ('google', 'easistent', 'manual')),
    last_success_utc TEXT,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'syncing', 'success', 'error'))
);

CREATE INDEX idx_events_start_utc ON events (start_utc);
CREATE INDEX idx_lessons_start_utc ON lessons (start_utc);
CREATE INDEX idx_homework_due_date ON homework (due_date);
CREATE INDEX idx_events_calendar_id ON events (calendar_id);
CREATE INDEX idx_lessons_subject_id ON lessons (subject_id);
CREATE INDEX idx_grades_subject_id ON grades (subject_id);
CREATE INDEX idx_homework_subject_id ON homework (subject_id);

