const BASE=new URL(self.registration.scope).pathname.replace(/\/?$/,'/');
const CACHE='kinetic-crew-shell-v6';
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyAD7NPmnSrMZv4DzqtSy0Vu9fYddGZoKYc",
  authDomain: "kinetic-crew.firebaseapp.com",
  projectId: "kinetic-crew",
  storageBucket: "kinetic-crew.firebasestorage.app",
  messagingSenderId: "797058143037",
  appId: "1:797058143037:web:f39507213d6e53dd082b54"
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "Kinetic Crew";
  self.registration.showNotification(title, {
    body: payload.notification?.body || "You have a new crew update.",
    icon: BASE + "kinetic-crew-logo.jpg",
    data: { url: payload.data?.url || BASE }
  });
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || BASE, self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of open) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.navigate(target); return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
const SHELL=['','index.html','login.html','styles.css','mobile.css','app.js','config.js','supabase-client.js','manifest.webmanifest','icon.svg','glass-ui.css','kinetic-ui.css','theme.js','kinetic-crew-logo.jpg'].map(p=>BASE+p);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));return response;}).catch(()=>caches.match(req).then(cached=>cached||caches.match(BASE+'index.html'))));return;}
 if(SHELL.includes(url.pathname))event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));return response;})));
});