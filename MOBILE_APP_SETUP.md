# Kinetic Crew native app setup

The existing Kinetic Crew web app remains in `public/` and continues to use the existing Supabase project. Capacitor packages that same web app into Android and iOS native containers.

## Local setup

Requirements:
- Node.js 22+
- Android Studio + Android SDK for Android
- macOS + Xcode for iOS device builds

Install and generate native projects:

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android
```

For iOS, on a Mac:

```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```

After changing files in `public/`, run `npx cap sync` before rebuilding native apps.

## Automated builds

GitHub Actions workflow `.github/workflows/mobile-build.yml` builds:
- Android debug APK (installable for internal testing; not a signed production release)
- iOS Simulator app (for simulator testing only)

Run it from GitHub → Actions → Build Kinetic Crew mobile apps → Run workflow. Download the artifacts from the completed workflow run.

## Release distribution

### Android
A production APK/AAB must be signed with an Android upload/release keystore. Keep the keystore and passwords in GitHub Actions secrets, never in this repository. For Play Store distribution, create an AAB and configure Play App Signing in Google Play Console. Direct sharing to members can use a signed APK.

### iOS
A real iPhone-installable build and App Store/TestFlight distribution require an Apple Developer account, a registered bundle identifier, signing certificates and provisioning profiles. The simulator artifact is not installable on a physical iPhone. Configure signing securely in the macOS build pipeline before distributing.

## Existing backend

The app continues to use the existing Supabase Auth, database and Edge Function configuration in `public/config.js`. Never put Supabase service-role keys, APNs keys, FCM service-account JSON, or signing credentials in browser files or Git.

## Push notifications

The current web app has in-app notifications only. Background/closed-app push is not complete just by packaging the website. It requires:
- Supabase table and server-side delivery function for device tokens
- Firebase Cloud Messaging configuration for Android
- APNs key and Apple Developer configuration for iOS
- Permission prompts and native registration handling

Do not announce push delivery as active until both platforms have been configured and real-device tests pass.
