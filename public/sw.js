const BASE=new URL(self.registration.scope).pathname.replace(/\/?$/,'/');
const CACHE='kinetic-crew-shell-v59';
const CORE=['','index.html','login.html','styles.css','mobile.css','app.js','config.js','supabase-client.js','manifest.webmanifest','icon.svg','kinetic-crew-logo.svg','kinetic-crew-logo.jpg','theme.js','theme-overrides.css','stumagz-redesign.css','mobile-dock.js','push-notifications.js','crew-enhancements.js','crew-enhancements.css','app-version.json','vibe-home.css','icon.svg','founder-crown.svg','onboarding.css'];
const ASSETS=CORE.map(path=>BASE+path);
const CDN_ASSETS=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2","https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js","https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"];
const CDN_CACHE="kinetic-crew-cdn-v1";

let messaging=null;
try{
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
messaging=firebase.messaging();
}catch(error){console.warn("Push messaging unavailable in this session:",error);}
try{
if(messaging)messaging.onBackgroundMessage(payload=>{
  const title=payload.notification?.title||"Kinetic Crew";
  self.registration.showNotification(title,{
    body:payload.notification?.body||"You have a new crew update.",
    icon:BASE+"icon.svg",
    data:{url:payload.data?.url||BASE}
  });
});
}catch(error){console.warn("Background notifications disabled:",error);}
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||BASE,self.location.origin).href;
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of clients){if(client.url.startsWith(self.location.origin)&&"focus"in client){await client.navigate(target);return client.focus();}}
    return self.clients.openWindow(target);
  })());
});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.all(ASSETS.map(async url=>{try{const response=await fetch(url,{cache:"reload"});if(response.ok)await cache.put(url,response);}catch(error){console.warn("Offline asset not cached:",url);}}));
    const cdn=await caches.open(CDN_CACHE); 
    await Promise.all(CDN_ASSETS.map(async url=>{try{const response=await fetch(url,{mode:"no-cors",cache:"reload"});await cdn.put(url,response);}catch(error){console.warn("Optional library not cached:",url);}})); 
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("kinetic-crew-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin){if(CDN_ASSETS.includes(url.href)){event.respondWith((async()=>{const cache=await caches.open(CDN_CACHE);const cached=await cache.match(url.href);if(cached)return cached;const response=await fetch(request);if(response)await cache.put(url.href,response.clone());return response;})());}return;} 
  if(!url.pathname.startsWith(BASE))return;
  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      try{const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}
      catch(error){return (await caches.match(request))||(await caches.match(BASE+"index.html"))||(await caches.match(BASE+"login.html"));}
    })());
    return;
  }
  if(url.pathname===BASE+'app.js'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{const response=await fetch(request,{cache:'no-store'});if(response.ok)await cache.put(BASE+'app.js',response.clone());return response;}
      catch(error){return (await cache.match(BASE+'app.js'))||Response.error();}
    })());
    return;
  }
  if(ASSETS.includes(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=await cache.match(request,{ignoreSearch:true});
      const network=fetch(request).then(response=>{if(response.ok)cache.put(request,response.clone());return response;}).catch(()=>null);
      if(cached){network.catch(()=>{});return cached;}
      return (await network)||Response.error();
    })());
  }
});