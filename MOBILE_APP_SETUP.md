# Kinetic Crew Android app

The Android app packages the existing `public/` web application with Capacitor. It keeps the current Supabase backend and does not require a separate API or database migration.

## Build a test APK

1. Open GitHub → Actions → **Build Kinetic Crew Android APK**.
2. Select **Run workflow** on the `main` branch.
3. Wait for the Android job to finish.
4. Download the `kinetic-crew-debug-apk` artifact and extract `app-debug.apk`.
5. Transfer it to an Android phone and install it. Android may ask you to allow installs from the browser or file manager used to open the APK.

The debug APK is for device testing. It is not the final distributable release build.

## Build a signed release APK for sharing

A release APK must be signed with a persistent Android keystore. Generate the keystore once and keep a secure backup. **Never commit the keystore or passwords to Git.** Losing the keystore means you cannot publish seamless updates signed with the same app identity.

Configure these GitHub Actions repository secrets:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded keystore file
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_ALIAS`: key alias
- `ANDROID_KEY_PASSWORD`: key password

After adding all four secrets, run the same workflow again. It will produce the `kinetic-crew-signed-release-apk` artifact. Share that APK through WhatsApp or host it on the Kinetic Crew website. Future APK updates must use the same keystore and application ID.

## Generate a keystore securely

Run locally on a computer with Java installed (replace the alias and validity details as desired):

```bash
keytool -genkeypair -v -keystore kinetic-crew-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias kineticcrew
```

Convert it to Base64 for the GitHub secret:

- macOS/Linux: `base64 -w 0 kinetic-crew-release.jks`
- Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("kinetic-crew-release.jks"))`

Store the original `.jks` file and passwords somewhere safe and private. Do not send them in chat.

## Existing backend and hosting

- Supabase Auth, database, storage and existing Edge Functions remain the backend.
- The existing public Supabase URL and publishable key remain in `public/config.js`.
- Cloudflare continues to host the web app.
- Native APK distribution does not require Google Play Console registration.

## Push notifications

The current web app's in-app notifications and Android push notifications are different. Native background/closed-app push requires Firebase Cloud Messaging configuration, secure device-token registration, server-side delivery, and real-device testing. The workflow can install `google-services.json` from the `GOOGLE_SERVICES_JSON_BASE64` secret when configured. Do not announce native push as active until end-to-end tests pass.
