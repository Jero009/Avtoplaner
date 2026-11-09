# Troubleshooting

Known device-side issues, their root causes, and how to diagnose them.

## "CapacitorSQLitePlugin: null" / "Podatkovne baze ni bilo mogoče odpreti"

**Symptom:** the app opens straight to the database-error screen. The small
gray error text under the red banner literally says `null`.

**Root cause:** `@capacitor-community/sqlite` v8 defaults
`androidIsEncryption` to **true**. During plugin `load()` the Android side
builds a Keystore-backed `EncryptedSharedPreferences` store. On devices
where that store or its master key is stale or invalidated (e.g. after
device-lock credential changes or reinstalls), the constructor throws an
exception whose `getMessage()` is `null` (an NPE-style failure). The plugin
then stays `null` and every database call rejects with `null`:

```
E CapacitorSQLitePlugin: CapacitorSQLitePlugin: null
V RetHandler: *** ERROR CapacitorSQLitePlugin: null
```

The same APK works on a fresh device/emulator because its Keystore state is
clean — which makes it look like a flaky, unreproducible bug. It is not.

**Fix (shipped in v1.4.3):** `capacitor.config.ts` sets

```ts
plugins: {
  CapacitorSQLite: {
    androidIsEncryption: false,
  },
},
```

The app never uses plugin-level encryption (all databases are plaintext),
so this changes nothing about stored data — it only removes the fragile
Keystore path from plugin startup.

**Never re-enable `androidIsEncryption`** without an encryption-secret
migration plan; old installs have plaintext databases.

## Diagnosing app issues on a real device over adb (no USB needed)

1. Install adb (`android-sdk/platform-tools`) on a machine reachable from
   the phone's network (Tailscale works).
2. On the phone enable **Developer options → Wireless debugging**, then:

   ```sh
   adb connect <phone-ip>:5555    # accept the debugging dialog on the phone
   adb devices                    # must say "device", not "unauthorized"
   ```

3. If the dialog was allowed but the device stays `unauthorized`, restart
   the adb server so a fresh key handshake happens:

   ```sh
   adb kill-server && adb start-server && adb connect <phone-ip>:5555
   ```

4. Capture the app's startup errors:

   ```sh
   adb shell am force-stop com.jero009.autoplaner
   adb logcat -c
   adb shell am start -n com.jero009.autoplaner/.MainActivity
   sleep 15
   adb logcat -d | grep -iE "sqlite|CapacitorSQLite|AndroidRuntime|FATAL"
   ```

## Stale APK downloads

GitHub release asset URLs are cached aggressively by browsers and some
download managers. If a phone keeps installing an old version, delete all
previously downloaded APKs, open the release page fresh, and confirm the
downloaded file name matches the version (e.g. `autoplaner-v1.4.3.apk`).
In-app **Settings** always shows the real installed version.
