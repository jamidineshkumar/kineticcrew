// Dynamic PWA manifest: reads the currently selected Super Admin install icon.
const SUPABASE_URL = 'https://lkdfjiweqxshbbcadfna.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8-7_og12Zot7nA-W_tz-rw_yDS1I9cp';
const FALLBACK_ICON = '/icon.svg';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  let icon = FALLBACK_ICON;
  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/crew_get_brand_identity', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: '{}',
      cache: 'no-store'
    });
    if (response.ok) {
      const identity = await response.json();
      const candidate = identity?.assets?.pwa || identity?.logo_url;
      if (typeof candidate === 'string' &&
          /^https:\/\/lkdfjiweqxshbbcadfna\.supabase\.co\/storage\/v1\/object\/public\/crew-brand-assets\/brand\/(?:destinations\/pwa|kinetic-crew-logo)\.png(?:\?[^\s]*)?$/.test(candidate)) {
        icon = candidate;
      }
    }
  } catch (error) {
    console.warn('Using the fallback Kinetic Crew PWA icon:', error);
  }
  res.status(200).json({
    id: '/',
    name: 'Kinetic Crew',
    short_name: 'Kinetic Crew',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#05050b',
    theme_color: '#05050b',
    description: 'Kinetic Crew — crew events, updates and attendance',
    icons: [{ src: icon, sizes: '512x512', type: icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png', purpose: 'any maskable' }],
    share_target: {
      action: '/?share_target=1',
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      params: { title: 'title', text: 'text', url: 'url' }
    }
  });
}
