package com.jero009.autoplaner;

import android.Manifest;
import android.content.ContentProviderOperation;
import android.content.ContentProviderResult;
import android.content.OperationApplicationException;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.RemoteException;
import android.provider.CalendarContract;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Minimal CalendarProvider (Android device calendar) CRUD plugin.
 *
 * Purpose-built instead of using @capacitor-community/calendar (not
 * published on npm). Everything goes through CalendarProvider, so it works
 * with any calendar app the user has (Fossify Calendar, DAVx⁵-synced
 * Radicale calendars, …) — no Google API involved.
 *
 * - checkPermissions/requestPermissions: inherited from Plugin, backed by
 *   the READ/WRITE_CALENDAR aliases below.
 * - listWritableCalendars: calendars with access level >= CONTRIBUTOR.
 * - createCalendar: a LOCAL account calendar named "Avtoplaner" (synced by
 *   nothing, owned by this app).
 * - applyChanges: one batched, transactional apply of create/update/delete
 *   ops. Deletes and updates are always scoped to (_id, calendar_id) so we
 *   can never modify an event this app does not own.
 *
 * Idempotency lives in the JS layer (SQLite mapping table); this plugin is
 * a dumb, safe executor.
 */
@CapacitorPlugin(
    name = "DeviceCalendar",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CALENDAR }, alias = "readCalendar"),
        @Permission(strings = { Manifest.permission.WRITE_CALENDAR }, alias = "writeCalendar")
    }
)
public class DeviceCalendarPlugin extends Plugin {

    private static final String LOCAL_ACCOUNT = "Avtoplaner";

    @PluginMethod
    public void listWritableCalendars(PluginCall call) {
        if (!hasCalendarPermissions()) {
            call.reject("calendar-permission");
            return;
        }
        JSArray result = new JSArray();
        String[] projection = new String[] {
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.ACCOUNT_NAME,
        };
        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= ?",
            new String[] { String.valueOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) },
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME
        )) {
            while (cursor != null && cursor.moveToNext()) {
                JSObject calendar = new JSObject();
                calendar.put("id", cursor.getLong(0));
                calendar.put("name", cursor.getString(1));
                calendar.put("accountName", cursor.isNull(2) ? null : cursor.getString(2));
                result.put(calendar);
            }
        } catch (SecurityException e) {
            call.reject("calendar-permission", e);
            return;
        } catch (Exception e) {
            call.reject("list-calendars-failed: " + e.getMessage(), e);
            return;
        }
        JSObject payload = new JSObject();
        payload.put("calendars", result);
        call.resolve(payload);
    }

    /**
     * Create a dedicated local (non-synced) calendar and return its id.
     * Calendar deletion is reserved for sync adapters, so "removing" our
     * data later only deletes events — the calendar itself stays.
     */
    @PluginMethod
    public void createCalendar(PluginCall call) {
        if (!hasCalendarPermissions()) {
            call.reject("calendar-permission");
            return;
        }
        String displayName = call.getString("name", LOCAL_ACCOUNT);
        // NAME must be globally unique; DISPLAY_NAME is what the user sees.
        String uniqueName = "autoplaner-" + UUID.randomUUID();
        android.content.ContentValues values = new android.content.ContentValues();
        values.put(CalendarContract.Calendars.ACCOUNT_NAME, LOCAL_ACCOUNT);
        values.put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
        values.put(CalendarContract.Calendars.NAME, uniqueName);
        values.put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, displayName);
        values.put(CalendarContract.Calendars.CALENDAR_COLOR, 0xFF2563EB);
        values.put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER);
        values.put(CalendarContract.Calendars.SYNC_EVENTS, 1);
        values.put(CalendarContract.Calendars.VISIBLE, 1);
        values.put(CalendarContract.Calendars.OWNER_ACCOUNT, LOCAL_ACCOUNT);
        values.put(CalendarContract.Calendars.CALENDAR_TIME_ZONE, "Europe/Ljubljana");

        Uri calendarUri;
        try {
            calendarUri = CalendarContract.Calendars.CONTENT_URI.buildUpon()
                .appendQueryParameter("caller_is_syncadapter", "true")
                .appendQueryParameter("account_name", LOCAL_ACCOUNT)
                .appendQueryParameter("account_type", CalendarContract.ACCOUNT_TYPE_LOCAL)
                .build();
            Uri resultUri = getContext().getContentResolver().insert(calendarUri, values);
            if (resultUri == null) {
                call.reject("create-calendar-failed");
                return;
            }
        } catch (SecurityException e) {
            call.reject("calendar-permission", e);
            return;
        } catch (Exception e) {
            call.reject("create-calendar-failed: " + e.getMessage(), e);
            return;
        }

        // Resolve the stable _ID from the inserted row (the insert URI is
        // the Calendars content URI; query our unique NAME back).
        Long id = findCalendarIdByName(uniqueName);
        if (id == null) {
            call.reject("create-calendar-failed: not found after insert");
            return;
        }
        JSObject payload = new JSObject();
        payload.put("id", Long.toString(id));
        call.resolve(payload);
    }

    /**
     * Apply a batch of event operations atomically.
     * ops: [{op: "create"|"update"|"delete", calendarId, nativeId?, title?,
     * description?, location?, startMs?, endMs?, allDay?}]
     * Resolves with { createdIds: number[] } aligned with the create ops.
     */
    @PluginMethod
    public void applyChanges(PluginCall call) {
        if (!hasCalendarPermissions()) {
            call.reject("calendar-permission");
            return;
        }
        JSArray ops = call.getArray("ops");
        if (ops == null) {
            call.reject("ops required");
            return;
        }

        ArrayList<ContentProviderOperation> batch = new ArrayList<>();
        List<Integer> createIndexes = new ArrayList<>();

        try {
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.getJSONObject(i);
                String kind = op.getString("op");
                long calendarId = Long.parseLong(op.getString("calendarId"));
                if ("create".equals(kind)) {
                    createIndexes.add(batch.size());
                    batch.add(ContentProviderOperation.newInsert(CalendarContract.Events.CONTENT_URI)
                        .withValues(eventValues(op, null))
                        .withValue(CalendarContract.Events.CALENDAR_ID, calendarId)
                        .build());
                } else if ("update".equals(kind)) {
                    long nativeId = op.getLong("nativeId");
                    batch.add(ContentProviderOperation
                        .newUpdate(CalendarContract.Events.CONTENT_URI)
                        .withValues(eventValues(op, null))
                        .withSelection(
                            CalendarContract.Events._ID + "=? AND "
                                + CalendarContract.Events.CALENDAR_ID + "=?",
                            new String[] { String.valueOf(nativeId), String.valueOf(calendarId) })
                        .build());
                } else if ("delete".equals(kind)) {
                    long nativeId = op.getLong("nativeId");
                    batch.add(ContentProviderOperation
                        .newDelete(CalendarContract.Events.CONTENT_URI)
                        .withSelection(
                            CalendarContract.Events._ID + "=? AND "
                                + CalendarContract.Events.CALENDAR_ID + "=?",
                            new String[] { String.valueOf(nativeId), String.valueOf(calendarId) })
                        .build());
                } else {
                    call.reject("unknown op: " + kind);
                    return;
                }
            }
        } catch (JSONException e) {
            call.reject("invalid ops: " + e.getMessage(), e);
            return;
        }

        ContentProviderResult[] results;
        try {
            results = getContext().getContentResolver()
                .applyBatch(CalendarContract.AUTHORITY, batch);
        } catch (SecurityException e) {
            call.reject("calendar-permission", e);
            return;
        } catch (RemoteException | OperationApplicationException e) {
            call.reject("apply-changes-failed: " + e.getMessage(), e);
            return;
        }

        JSArray createdIds = new JSArray();
        for (int index : createIndexes) {
            Uri uri = results[index].uri;
            long id = uri == null ? -1 : Long.parseLong(uri.getLastPathSegment());
            createdIds.put(id);
        }
        JSObject payload = new JSObject();
        payload.put("createdIds", createdIds);
        call.resolve(payload);
    }

    private static android.content.ContentValues eventValues(JSONObject op, @Nullable Void unused) {
        android.content.ContentValues values = new android.content.ContentValues();
        values.put(CalendarContract.Events.TITLE, op.optString("title"));
        values.put(CalendarContract.Events.DESCRIPTION, optNullable(op, "description"));
        values.put(CalendarContract.Events.EVENT_LOCATION, optNullable(op, "location"));
        values.put(CalendarContract.Events.DTSTART, op.optLong("startMs"));
        values.put(CalendarContract.Events.DTEND, op.optLong("endMs"));
        // EVENT_TIME_ZONE constant is not visible on Events in compileSdk 36;
        // "eventTimezone" is its CalendarContract column name.
        values.put("eventTimezone", "UTC");
        values.put(CalendarContract.Events.ALL_DAY, op.optBoolean("allDay") ? 1 : 0);
        // SYNC_DATA1 is sync-adapter-only (IllegalArgumentException otherwise);
        // ownership is tracked in the app's SQLite mapping table instead.
        return values;
    }

    private static @Nullable String optNullable(JSONObject object, String key) {
        return object.isNull(key) ? null : object.optString(key, null);
    }

    private boolean hasCalendarPermissions() {
        int read = getContext().checkCallingOrSelfPermission(Manifest.permission.READ_CALENDAR);
        int write = getContext().checkCallingOrSelfPermission(Manifest.permission.WRITE_CALENDAR);
        return read == PackageManager.PERMISSION_GRANTED && write == PackageManager.PERMISSION_GRANTED;
    }

    private @Nullable Long findCalendarIdByName(String name) {
        try (Cursor cursor = getContext().getContentResolver().query(
            CalendarContract.Calendars.CONTENT_URI,
            new String[] { CalendarContract.Calendars._ID },
            CalendarContract.Calendars.NAME + "=?",
            new String[] { name },
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getLong(0);
            }
        }
        return null;
    }
}
