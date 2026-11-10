# Google Calendar — OAuth client setup (maintainer, one-time, ~5 minutes)

The app talks to Google Calendar directly from the device — there is no
backend. Authentication uses OAuth 2.0 Authorization Code + PKCE, which needs
a free **Google Cloud OAuth client ID**. The client ID is public by design
(no secret is embedded in the app).

**End users never do this.** The client ID ships inside the app
(`src/integrations/google/embedded-client-id.ts`), so users just press
**Connect** in Settings and grant consent. The maintainer registers ONE
client for the whole app — this file documents that one-time registration.

## Steps (maintainer, once)

1. Open <https://console.cloud.google.com/> and create a project (e.g.
   `autoplaner`).
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `Autoplaner`
   - **Publish the app** (do not stay in *Testing* mode — Testing caps
     sign-ins at 100 test users, which would block everyone else).
   - Until Google verifies the app, users see a one-time "unverified app"
     screen (*Advanced → Go to Autoplaner*) — expected and harmless.
     Verification (removes the warning) needs a privacy-policy URL on a
     domain you own; the GitHub Pages deploy can host that later.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Android**
   - Package name: `com.jero009.autoplaner`
   - Add **both** SHA-1 fingerprints (release and debug build):

   | Build | SHA-1 |
   |---|---|
   | Release | `15:1E:9E:E6:B3:79:18:AE:85:19:AB:B3:1C:7C:60:41:6C:AC:64:B2` |
   | Debug | `B2:DB:80:9D:7D:93:7D:6B:4A:E8:82:90:D6:F6:3B:F7:AA:07:97:D8` |

5. Copy the client ID (`xxxxxxxx.apps.googleusercontent.com`) and paste it
   into `src/integrations/google/embedded-client-id.ts`, then cut a new
   release. Every user can now connect with zero setup.

## Why no redirect URI setup is needed (Android)

Google auto-registers the reverse-client-ID custom scheme
`com.googleusercontent.apps.<CLIENT_ID_WITHOUT_SUFFIX>:/oauth2redirect` for
Android OAuth clients — the ID is embedded WITHOUT its
`.apps.googleusercontent.com` part. The app builds this in
`redirectUriFor()` (sending the full ID yields `redirect_uri_mismatch`), so
the client ID stays runtime-configurable — no rebuild after creating it.

## Browser / PWA

The Calendar API works from a browser (unlike eAsistent, it is CORS-enabled),
but the PWA needs its deployed origin (`https://…/oauth2redirect`) registered
as a second redirect URI on a **Web application** client. Skip this until the
GitHub Pages deploy exists.

## Notes

- The refresh token is stored locally in the app's SQLite settings table and
  is **never included in backups** (redacted, same as the eAsistent password).
- Disconnecting (Settings → Disconnect) deletes the token and all synced
  Google events from the device. The Google account itself is untouched.
- Scope requested: `https://www.googleapis.com/auth/calendar` (read; write
  support comes later with Google-event editing).
