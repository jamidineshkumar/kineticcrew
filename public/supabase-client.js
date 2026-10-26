(function () {
  const cfg = window.KC_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').trim();
  const key = String(cfg.supabaseAnonKey || '').trim();
  const base = String(cfg.basePath || '/').replace(/\/?$/, '/');
  window.kcBasePath = base;
  window.kcPath = function (path) { return base + String(path || '').replace(/^\/+/, ''); };
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.KC_CONFIG_ERROR = 'Supabase client failed to load. Refresh the page or check your internet connection.'; return;
  }
  if (!url || !key || key.includes('REPLACE_ME')) {
    window.KC_CONFIG_ERROR = 'Supabase is not configured. Edit public/config.js and add your project URL and publishable key.'; return;
  }
  try { window.kcSupabase = window.supabase.createClient(url, key, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); }
  catch (error) { window.KC_CONFIG_ERROR = 'Could not start Supabase: ' + (error && error.message ? error.message : 'invalid configuration'); }
})();
