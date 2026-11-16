const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const androidRoot = path.join(root, 'android', 'app', 'src', 'main');
  const source = path.join(root, 'public', 'kc-notification-badge.svg');
  const drawable = path.join(androidRoot, 'res', 'drawable');
  const manifest = path.join(androidRoot, 'AndroidManifest.xml');

  if (!fs.existsSync(source)) throw new Error('KC notification mark is missing: ' + source);
  if (!fs.existsSync(manifest)) throw new Error('Capacitor AndroidManifest.xml is missing. Run npx cap add android first.');
  fs.mkdirSync(drawable, { recursive: true });

  // Android status-bar icons must be a white glyph on transparent pixels.
  await sharp(source).resize(96, 96, { fit: 'contain' }).png().toFile(path.join(drawable, 'ic_stat_notification.png'));

  let xml = fs.readFileSync(manifest, 'utf8');
  const marker = 'com.google.firebase.messaging.default_notification_icon';
  if (!xml.includes(marker)) {
    const meta = '        <meta-data android:name="' + marker + '" android:resource="@drawable/ic_stat_notification" />';
    if (!xml.includes('</application>')) throw new Error('Could not locate the application element in AndroidManifest.xml.');
    xml = xml.replace('</application>', meta + '\n    </application>');
    fs.writeFileSync(manifest, xml);
  }

  console.log('Configured the KC monochrome notification icon for Firebase Android notifications.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
