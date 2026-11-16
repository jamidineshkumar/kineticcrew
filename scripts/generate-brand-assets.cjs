const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const fallback = path.join(root, 'public', 'kinetic-crew-logo.svg');
  const out = path.join(root, 'assets');
  if (!fs.existsSync(fallback)) throw new Error('Official Kinetic Crew fallback logo missing: ' + fallback);
  fs.mkdirSync(out, { recursive: true });

  // Native launcher icons are baked into the APK/IPA at build time.
  // Pull the currently published PWA/install icon from the public brand identity
  // RPC so a fresh mobile build uses the Super Admin's selected logo.
  let source = fallback;
  try {
    const configText = fs.readFileSync(path.join(root, 'public', 'config.js'), 'utf8');
    const supabaseUrl = configText.match(/supabaseUrl:\s*'([^']+)'/)?.[1];
    const anonKey = configText.match(/supabaseAnonKey:\s*'([^']+)'/)?.[1];
    if (supabaseUrl && anonKey) {
      const response = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/crew_get_brand_identity', {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (response.ok) {
        const identity = await response.json();
        const logoUrl = identity?.logo_url;
        const allowed = identity?.targets?.pwa === true &&
          typeof logoUrl === 'string' &&
          /^https:\/\/lkdfjiweqxshbbcadfna\.supabase\.co\/storage\/v1\/object\/public\/crew-brand-assets\/brand\/kinetic-crew-logo\.png(?:\?.*)?$/.test(logoUrl);
        if (allowed) {
          const imageResponse = await fetch(logoUrl, { cache: 'no-store' });
          if (!imageResponse.ok) throw new Error('Published install icon could not be downloaded: HTTP ' + imageResponse.status);
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const metadata = await sharp(imageBuffer).metadata();
          if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw new Error('Published install icon must be PNG, JPG or WebP.');
          source = imageBuffer;
          console.log('Using the currently published Kinetic Crew install icon from Supabase.');
        } else {
          console.log('Installed app icon destination is not enabled; using the repository fallback icon.');
        }
      } else {
        console.warn('Could not read the published brand identity; using the repository fallback icon.');
      }
    }
  } catch (error) {
    console.warn('Could not load the published install icon; using the repository fallback:', error.message);
  }

  // Fit the official logo onto the square native-icon canvas without cropping it.
  const logo = await sharp(source).rotate().resize(820, 820, {
    fit: 'contain',
    background: { r: 5, g: 5, b: 11, alpha: 0 }
  }).png().toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#05050b' }
  }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(path.join(out, 'icon-only.png'));

  await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: '#05050b' }
  }).composite([{
    input: await sharp(source).rotate().resize(1200, 1200, { fit: 'contain' }).png().toBuffer(),
    gravity: 'centre'
  }]).png().toFile(path.join(out, 'splash.png'));

  console.log('Generated native icon and splash assets.');
}
main().catch(error => { console.error(error); process.exit(1); });
