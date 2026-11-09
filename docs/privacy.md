# Privacy Policy — Avtoplaner

Last updated: 2026-11-09

Avtoplaner is an offline-first personal calendar app for Android. This policy
describes how it handles your data.

## Summary

**All of your data stays on your device.** Avtoplaner has no backend server,
no accounts and no analytics. We do not collect, transmit, sell or share any
of your personal data.

## Local data

Everything you store in Avtoplaner (events, eAsistent timetable, homework,
grades, settings) is saved in a local database on your device only. Backups
are exported by you to a file you choose; they are redacted to exclude
secrets such as the stored eAsistent password and Google refresh token.

## Google account (optional feature)

If you connect a Google account, Avtoplaner:

- reads only the Google Calendars you choose, to display their events inside
  the app;
- stores a long-lived Google "refresh token" locally on your device so the
  sync can refresh itself. This token never leaves your device (it is
  excluded from backups) and is sent only to Google's own OAuth endpoints;
- does not write to, modify or delete anything in your Google account
  (read-only today).

You can disconnect at any time in the app (Settings → Google Calendar →
Disconnect), which deletes the token and all synced Google events from the
device. You can also revoke Avtoplaner's access at
https://myaccount.google.com/connections

## eAsistent (optional feature)

If you configure eAsistent, your credentials are stored locally on your
device and used only to talk to the official eAsistent API. They are never
included in backups.

## Network access

The app contacts only:

- Google's OAuth and Calendar API endpoints (when connected),
- the official eAsistent API (when configured).

It contains no advertising, tracking or analytics SDKs.

## Children's privacy

Avtoplaner does not knowingly collect any personal data from anyone,
including children under 13, because it does not collect data at all.

## Changes

Changes to this policy will be published in this repository with an updated
date above.

## Contact

Questions: jero009-projects@gmail.com
