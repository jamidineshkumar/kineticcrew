const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'public', 'kinetic-crew-logo.jpg');
  const out = path.join(root, 'assets');
  if (!fs.existsSync(source)) throw new Error('Official Kinetic Crew logo missing: ' + source);
  fs.mkdirSync(out, { recursive: true });

  // Use the supplied official crew logo as-is; only fit it onto the required
  // square native-icon canvas. No replacement mark or text is invented.
  const logo = await sharp(source).rotate().resize(820, 820, {
    fit: 'contain',
    background: { r: 238, g: 237, b: 247, alpha: 0 }
  }).png().toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#eeedf7' }
  }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(path.join(out, 'icon-only.png'));

  await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: '#eeedf7' }
  }).composite([{
    input: await sharp(source).rotate().resize(1200, 1200, { fit: 'contain' }).png().toBuffer(),
    gravity: 'centre'
  }]).png().toFile(path.join(out, 'splash.png'));

  console.log('Generated native icon and splash assets from the official Kinetic Crew logo.');
}
main().catch(error => { console.error(error); process.exit(1); });
