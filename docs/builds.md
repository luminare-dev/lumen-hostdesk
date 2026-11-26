# Native builds

CI builds and tests the web version only. The Android and iOS apps are built with
[EAS Build](https://docs.expo.dev/build/introduction/); `eas.json` is prepared, but no build has
been made yet, because the accounts below do not exist yet.

## What is needed

| What | For | Notes |
|---|---|---|
| Expo account and an access token (`EXPO_TOKEN`) | EAS Build and Submit | `npx eas-cli init` once links the project and writes `extra.eas.projectId` into `app.json`; the token goes into a repository secret if builds should run from CI |
| Apple Developer Program membership | iOS builds on devices, TestFlight, public release | EAS can create the certificates and provisioning profiles; the app record in Apple's developer console gives the `ascAppId` for `eas.json` |
| Google Play Console developer account | Android release | The first upload of an app has to be made by hand in the console; later ones with a service account key (`eas submit`) |
| Final app identifiers | Android and iOS | `tech.luminare.hostdesk` in `app.json` is provisional; it cannot change after the first upload |

## Profiles in eas.json

- `development`: a development client for testing on a device (`expo-dev-client` has to be added
  for it).
- `preview`: an internal build (Android APK, iOS ad hoc) to install directly.
- `production`: release builds with the build number counted up by EAS.

`submit.production.ios.ascAppId` holds the placeholder `APP_STORE_CONNECT_APP_ID` until Apple's
app record exists.

## Commands

```bash
npx eas-cli login
npx eas-cli init                                  # once: links the project
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform all
npx eas-cli submit --profile production --platform ios
```

## Before a public release

- The listings need a privacy policy URL: the app sends data only to the server you add, keeps
  the key on the device and has no analytics.
- Name and listing text: "… for KeyHelp" with the not-affiliated line; never the KeyHelp logo.
- Test the background check on real devices (see [alerts.md](alerts.md)).
