# LockBox for iPhone and Android

The App Store and Google Play versions of LockBox. It's a native shell
([Capacitor](https://capacitorjs.com) 8) around the live site: the app opens
**https://app.bookiebullies.com** in a full-screen web view, so every change
to `picks-app/` shows up in the app the moment it deploys, with no store
update. Only what has to be native is native:

| | Where |
|---|---|
| Push notifications (APNs on iPhone, FCM on Android) | `@capacitor/push-notifications`; the server side is `picks-app/src/nativepush.js` |
| Launch screen: the crest on navy (#0a1228) | `@capacitor/splash-screen`, images from `assets/` |
| Status bar text light on dark looks, dark on Light | `@capacitor/status-bar` |
| A light tap when a pick locks | `@capacitor/haptics` |
| Android's back button: closes a sheet, goes back, then leaves | `@capacitor/app` |
| Off-site links (www.bookiebullies.com, a player's link) in an in-app browser | `@capacitor/browser` |
| "No connection" page with Try again when the site can't load | `www/offline.html` (`server.errorPath`) |

The page side of all that is the block at the end of `picks-app/public/app.js`
(it runs only when `window.Capacitor` says it's the app) and the end of
`picks-app/public/style.css`. Capacitor adds `LockBoxApp` to the user agent,
so the server leaves out its Get the app prompts (`ctx.isNativeApp`; never
trusted for anything else).

**When the app asks for notifications:** never on first launch. It asks after
the player follows a game, or when they tap Turn on for this device (the
notifications page, or the game alerts sheet). The token goes to the server
with `POST /push/native`; the first signed-out page after Log out sends
`POST /push/native/remove`, so the phone stops getting that player's alerts.

## What's here

```
capacitor.config.js   app id com.bookiebullies.lockbox, name LockBox, server.url, plugins
www/                  the offline page (and an index.html Capacitor insists on)
assets/               icon and splash sources (1024 icon, 2732 splash, the crest)
android/              the Android Studio project (committed; Gradle builds it)
ios/                  the Xcode project (committed; Swift Package Manager, no CocoaPods)
test/                 checks on the settings that are easy to break (npm test)
store/                store screenshots, the Google Play feature graphic and icon, and the scripts that made them
STORE.md              the listing text, age rating, privacy answers, review notes, and the owner's steps
```

## Building

Needs Node 22.

```
cd mobile
npm ci
npm test               # the settings checks
npx cap sync           # copies the config and plugins into android/ and ios/
```

**Android** (any computer; Android Studio, or JDK 21 and the Android SDK):
```
npx cap sync android
cd android && ./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```
or `npx cap open android` and press Run.

**iPhone** (a Mac with Xcode 16 or newer):
```
npx cap sync ios
npx cap open ios       # then pick a simulator or your phone and press Run
```
There's no `pod install`: the project uses Swift Package Manager, and Xcode
fetches the packages itself (from `ios/App/CapApp-SPM`, which points into
`node_modules`, so run `npm ci` first).

**Without a Mac or Android Studio:** GitHub Actions builds both (below).

**Against a local server:** `LOCKBOX_URL=http://10.0.2.2:3000 npx cap sync android`
points a dev build at `npm run demo` on your computer (10.0.2.2 is the
computer, from the Android emulator; on iPhone simulator use
`http://localhost:3000`). Sync again without it before any real build.

**Icons and splash** come from `assets/` through `npm run assets`
(@capacitor/assets). The sources were made from `picks-app/public/icon-512.png`:
the crest cut out of its dark square (`assets/crest-transparent.png`), put
on navy for the icon (1024, no transparency, as Apple requires) and the splash
(2732), and on transparent for Android's adaptive icon foreground. After
`npm run assets`, the splash PNGs were shrunk to 256 colors (Pillow) to keep
the repo small, and the template's old `splash-2732x2732*.png` files deleted.
A sharper 1024 master of the crest would make a sharper icon: the only one in
the repo is 512, so the icon is upscaled 2x. The Android notification icon
(`android/app/src/main/res/drawable-*/ic_stat_lockbox.png`) is a white
silhouette of the crest, as Android requires.

## CI

| Workflow | When | What |
|---|---|---|
| `.github/workflows/mobile-android.yml` | PRs touching `mobile/`, or by hand | Settings checks, `cap sync`, `./gradlew assembleDebug`, uploads **lockbox-debug-apk**. By hand with **release** ticked: a signed **lockbox-release-aab** for Google Play, once the signing secrets exist (skips with a note until then). |
| `.github/workflows/mobile-ios.yml` | By hand only (macOS minutes cost 10x on a private repo) | `cap sync`, then an unsigned simulator build (`CODE_SIGNING_ALLOWED=NO`) to prove it compiles. With **release** ticked: archive with automatic signing through the App Store Connect API key and upload to App Store Connect (TestFlight), once those secrets exist. |

Each store build takes its version name from the run's input (1.0.0 by
default) and its build number from the run number, so every upload is
higher than the last.

## Credentials, later

None of these exist yet (the LLC and D-U-N-S number come first). Nothing
breaks without them: the server logs "native push off" once and keeps the
apps' tokens for when the keys arrive, and the release jobs skip.
`STORE.md` → "Your steps, in order" has how to get each one.

| What | Where it goes | Never in git |
|---|---|---|
| APNs key (`AuthKey_XXXX.p8`), its Key ID, the Team ID | The server: `/etc/bookie-bullies-app/` and `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_FILE` in `/etc/bookie-bullies-app.env` (`picks-app/README.md`) | yes |
| Firebase service account JSON | The server: `FCM_SERVICE_ACCOUNT_FILE` | yes |
| Firebase `google-services.json` | `android/app/google-services.json` for local builds (gitignored); GitHub secret `GOOGLE_SERVICES_JSON` for CI | yes |
| Android upload keystore and passwords | GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (`*.jks` and `*.keystore` are gitignored) | yes |
| App Store Connect API key, Team ID | GitHub secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `APPLE_TEAM_ID` | yes |

**Android push needs `google-services.json` in the build.** Without it,
`capacitor.config.js` leaves `LockBoxPush` out of the Android user agent and
the page never offers notifications there (registering without Firebase would
fail). Add the file, `npx cap sync android`, build again.

**iPhone push** needs the Push Notifications capability on the App ID
(step 4 in STORE.md); the project already has the `aps-environment`
entitlement (`ios/App/App/App.entitlements`), and Xcode's signing switches it
to production for TestFlight and App Store builds. Builds run from Xcode
on a phone use Apple's sandbox: set `APNS_SANDBOX=1` on a test server for
those, never on the real one.

## Things to know

- The **offline page** shows whenever the first page fails to load, which
  includes the server answering an error (Capacitor treats an HTTP error on
  the main page the same way). Try again reloads the board.
- On older Android WebViews (Chromium before 140) the app pads the page
  around the status bar; on newer ones the page draws edge to edge and the
  header pads itself (`.native .top` in style.css).
- **Permissions in Info.plist:** the camera (taking a profile or cover photo)
  and adding to Photos (Share as image → Save Image). Nothing else is
  asked for. No background modes: plain alerts don't need one.
- iPhone only, portrait, for version 1 (`TARGETED_DEVICE_FAMILY = 1`). iPad
  later means iPad screenshots and checking the layout there.
- Updating Capacitor: `npm i @capacitor/core@latest @capacitor/cli@latest …`
  for every `@capacitor/*` package, then `npx cap sync`. Read Capacitor's
  upgrade guide for a new major first; it sometimes changes the native
  projects.
