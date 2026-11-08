-- Autoplaner schema v3
-- Device-calendar (CalendarProvider) write support.
--
-- device_calendar_map: idempotency mapping between our stable eAsistent
-- row ids (source_key, e.g. "ea-lesson:123", "ea-hw:abc") and the native
-- CalendarProvider event ids, scoped per target calendar so a calendar
-- switch can be detected and cleaned up. content_hash lets a sync decide
-- update-in-place vs. no-op without touching the provider.
CREATE TABLE device_calendar_map (
    source_key TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    native_event_id INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    updated_utc TEXT NOT NULL,
    PRIMARY KEY (source_key, calendar_id),
    UNIQUE (calendar_id, native_event_id)
);

CREATE INDEX idx_device_calendar_map_calendar ON device_calendar_map (calendar_id);

-- Subject attribution for calendar events (used by the device-calendar
-- writer to build "<subject> — <topic>" titles). Nullable: local/manual
-- events carry no subject.
ALTER TABLE events ADD COLUMN subject_id TEXT REFERENCES subjects (id) ON DELETE SET NULL;
