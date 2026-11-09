# Release process

This is the exact procedure for building and publishing an Autoplaner
Android release. Every release is a new version — never modify or replace
an existing release.

## 1. Bump versions (both places)

| File                   | Field         | Rule                                  |
| ---------------------- | ------------- | ------------------------------------- |
| `package.json`         | `version`     | Semantic version, e.g. `1.4.3`        |
| `android/app/build.gradle` | `versionCode` | Integer, increment by 1            |
| `android/app/build.gradle` | `versionName` | Same string as `package.json`     |

## 2. Build the web bundle and sync it into Android

```sh
npm run build
npx cap sync android
```

**`npx cap sync android` is mandatory after every `npm run build`.** Gradle
packages `android/app/src/main/assets/public/`, not `dist/`. Skipping this
step ships a stale web bundle inside the APK — this actually happened in
v1.4.1 (the APK contained the v1.4.0 bundle).

Verify freshness before building:

```sh
grep -r "androidIsEncryption" android/app/src/main/assets/capacitor.config.json
ls android/app/src/main/assets/public/assets/index-*.js   # hash must match dist/assets/
```

## 3. Build the signed APK

```sh
cd android && ./gradlew assembleRelease
# output: app/build/outputs/apk/release/app-release.apk
```

The signing key lives in `keystore/` and is wired through
`android/app/build.gradle`. Never commit or share the keystore password.

## 4. Commit and publish

```sh
git add -A
git commit -m "chore(release): bump version to X.Y.Z / versionCode N"
git push origin main
gh release create vX.Y.Z app-release.apk \
  --title "vX.Y.Z" --notes "<changes>"
```

There is no PR gate and no CI wait — releases go straight to `main` with
the APK attached as a GitHub release asset. CI runs on push but is not a
release blocker.

## 5. Verify the release

- `gh release view vX.Y.Z` shows the APK as an asset.
- Install the APK on a device and check
  **Settings → version** shows the new versionName.

## Version history conventions

- `feat` releases bump the minor version (`1.4.0` → `1.5.0`).
- Fixes bump the patch version (`1.4.2` → `1.4.3`).
- Each release's notes should state what changed and any migration impact.
