# Kinetic Crew mobile apps

Kinetic Crew keeps one shared web codebase in `public/`, packaged with Capacitor for Android and iOS. Both native platforms use the existing Supabase backend; Cloudflare continues to host the web/PWA version. No separate API or database migration is introduced.

## Android

### Build a test APK

1. Open GitHub → Actions → **Build Kinetic Crew Mobile Apps**.
2. Select **Run workflow** on the `main` branch.
3. Wait for the Android job to finish.
4. Download the `kinetic-crew-debug-apk` artifact and extract `app-debug.apk`.
5. Transfer it to an Android phone and install it. Android may ask you to allow installs from the browser or file manager used to open the APK.

### Build a signed release APK for sharing

A release APK must be signed with a persistent Android keystore. Generate the keystore once and keep a secure backup. **Never commit the keystore or passwords to Git.** Losing the keystore means you cannot publish seamless updates signed with the same app identity.

Configure these GitHub Actions repository secrets:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded keystore file
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_ALIAS`: key alias
- `ANDROID_KEY_PASSWORD`: key password

After adding all four secrets, run the same workflow again. It produces the `kinetic-crew-signed-release-apk` artifact. Future APK updates must use the same keystore and application ID.

Windows PowerShell Base64 conversion:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\kinetic-crew-release.jks")) | Set-Clipboard
```

Store the original `.jks` file and passwords somewhere safe and private. Do not send them in chat.

## iOS

### Build for the iOS Simulator

The workflow runs on a macOS GitHub runner with Xcode, creates/syncs the Capacitor iOS project, generates the official app icons, and builds the app for the iOS Simulator. Download the `kinetic-crew-ios-simulator` artifact to inspect/run it in an iOS Simulator on a Mac.

**The simulator artifact is not an installable iPhone IPA.** A physical iPhone build must be signed by Apple.

### Build an installable iOS IPA

For ad-hoc device distribution, you need an active Apple Developer Program membership, an Apple Distribution certificate exported as a password-protected `.p12`, and an Ad Hoc provisioning profile for bundle ID `com.kineticcrew.hq` that includes the target iPhone UDIDs. Configure these GitHub Actions repository secrets:

- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`: Base64-encoded Apple Distribution `.p12`
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`: password protecting the `.p12`
- `IOS_PROVISIONING_PROFILE_BASE64`: Base64-encoded Ad Hoc `.mobileprovision`
- `IOS_TEAM_ID`: Apple Developer Team ID

When all four are present, the iOS job imports the signing assets temporarily, archives the app, exports an Ad Hoc IPA, and uploads `kinetic-crew-ios-ipa`. Keep the certificate, profile, and passwords private. The Ad Hoc IPA only installs on devices included in its provisioning profile. For TestFlight/App Store distribution, use an App Store provisioning profile and change the export method to `app-store-connect`; App Store Connect submission is a separate step.

Without these Apple signing assets, the workflow still produces the simulator build. It does not pretend to produce an installable iPhone app.

## Install the website on iPhone (PWA)

The Cloudflare-hosted website remains the no-App-Store option. On iPhone, open the HTTPS Kinetic Crew website in Safari, tap **Share**, then **Add to Home Screen**. This creates a home-screen web app using the existing web/PWA experience. It is not the same as a signed native IPA, and iOS may impose different background and push-notification limitations.

## Backend, hosting, and features

- Supabase Auth, database, storage, and existing Edge Functions remain the backend.
- The existing public Supabase URL and publishable key in `public/config.js` are not changed.
- Cloudflare continues to host the web/PWA version.
- The Capacitor iOS and Android wrappers load the same `public/` application, so existing app screens and flows are preserved.
- Native push notifications require platform-specific configuration and end-to-end testing. The presence of an iOS build does not mean native iOS push is enabled.

## Local development

```bash
npm install
npm run brand:assets
npx cap add ios
npx cap sync ios
npx cap open ios
```

iOS project generation/building requires macOS and Xcode. Android builds can be performed on Windows, macOS, or Linux with the Android toolchain.
