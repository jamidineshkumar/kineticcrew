const BASE=new URL(self.registration.scope).pathname.replace(/\/?$/,'/');
const CACHE='kinetic-crew-shell-v2';
const SHELL=['','index.html','login.html','styles.css','mobile.css','app.js','config.js','supabase-client.js','manifest.webmanifest','icon.svg'].map(p=>BASE+p);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));return response;}).catch(()=>caches.match(req).then(cached=>cached||caches.match(BASE+'index.html'))));return;}
 if(SHELL.includes(url.pathname))event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));return response;})));
});