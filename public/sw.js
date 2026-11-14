const BASE=new URL(self.registration.scope).pathname.replace(/\/?$/,'/');
const CACHE='kinetic-crew-shell-v170';
const CORE=['','index.html','connect.html','login.html','styles.css','mobile.css','app.js','config.js','supabase-client.js','manifest.webmanifest','icon.svg','kinetic-crew-logo.svg','kinetic-crew-logo.jpg','theme.js','theme-overrides.css','stumagz-redesign.css','mobile-dock.js','push-notifications.js','crew-enhancements.js','crew-enhancements.css','app-version.json','kc-meet.js','kc-meet.css','vibe-home.css', 'approved-mobile-shell.css','kc-home-glass-tiles.css','kc-exact-home.css','icon.svg','founder-crown.svg','onboarding.css','more-menu-reference.css','kc-more-neumorphic.css','kc-dock-final.css','kinetic-gram-experience.css','kinetic-gram-experience.js','kc-home-featured-carousel.css','kc-profile-liquid.css','kc-header-alignment-fix.css','kc-home-header-greeting-refresh.css','kc-transition.css','kc-transition.js','student-tribe-interface.css','global-search.js','global-search.css','events-experience.css','gram-onboarding.js','gram-onboarding.css','kc-memories-sharing.css','kc-notifications-inbox.css','kc-home-logo-menu-dedupe.css','kc-profile-single-edit.css','kc-profile-flip-hint.css','kc-app-neumorphic-system.css','kc-attendance-report.css','kc-search-events-polish.css','kc-more-event-ads.css','kc-more-event-ads.js','brand-logo.js','brand-logo-admin.css','kc-admin-shortcuts.css','kc-admin-role-tools.css','kc-admin-menu-shortcuts.css','kc-admin-menu-shortcuts.js','kc-member-action-ring.css','kc-visitor-profile.css','kc-global-minimal-ui.css'];
const ASSETS=CORE.map(path=>BASE+path);
const CDN_ASSETS=["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2","https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js","https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"];
const CDN_CACHE="kinetic-crew-cdn-v1";

const BRAND_LOGO_RPC='https://lkdfjiweqxshbbcadfna.supabase.co/rest/v1/rpc/crew_get_brand_logo';
const BRAND_LOGO_KEY='sb_publishable_8-7_og12Zot7nA-W_tz-rw_yDS1I9cp';
async function getBrandLogo(){try{const response=await fetch(BRAND_LOGO_RPC,{method:'POST',headers:{apikey:BRAND_LOGO_KEY,Authorization:'Bearer '+BRAND_LOGO_KEY,'Content-Type':'application/json'},body:'{}',cache:'no-store'});if(!response.ok)return null;const value=await response.json();return typeof value==='string'&&value.startsWith('https://lkdfjiweqxshbbcadfna.supabase.co/storage/v1/object/public/crew-brand-assets/brand/kinetic-crew-logo.png')?value:null;}catch{return null;}}
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
if(messaging)messaging.onBackgroundMessage(async payload=>{
  const title=payload.notification?.title||"Kinetic Crew";
  const logo=await getBrandLogo();
  self.registration.showNotification(title,{
    body:payload.notification?.body||"You have a new crew update.",
    // `icon` is the compact app mark; `image` gives Android a large,
    // full-colour crew logo in the expanded notification.
    icon:logo||BASE+"kinetic-crew-logo.jpg",
    image:logo||BASE+"kinetic-crew-logo.jpg",
    badge:logo||BASE+"kinetic-crew-logo.jpg",
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
    const essential=["","index.html","login.html","styles.css","app.js","config.js","supabase-client.js","app-version.json"];
    await Promise.all(essential.map(async path=>{
      const url=BASE+path;
      try{const response=await fetch(url,{cache:"reload"});if(response.ok)await cache.put(url,response);}
      catch(error){console.warn("Essential offline asset not refreshed:",path);}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith("kinetic-crew-shell-")&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin){
    if(CDN_ASSETS.includes(url.href)){
      event.respondWith((async()=>{
        const cache=await caches.open(CDN_CACHE);
        const cached=await cache.match(url.href);
        const network=fetch(request).then(response=>{if(response&&response.ok)cache.put(url.href,response.clone()).catch(()=>{});return response;});
        if(cached){event.waitUntil(network.catch(()=>{}));return cached;}
        return network;
      })());
    }
    return;
  }
  if(!url.pathname.startsWith(BASE))return;
  const cacheable=url.pathname===BASE+"app.js"||ASSETS.includes(url.pathname);
  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await Promise.race([fetch(request,{cache:"no-store"}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("navigation timeout")),8000))]);
        if(response&&response.ok)cache.put(request,response.clone()).catch(()=>{});
        return response;
      }catch(error){
        return (await cache.match(request))||(await cache.match(BASE+"index.html"))||(await cache.match(BASE+"login.html"))||Response.error();
      }
    })());
    return;
  }
  if(cacheable){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const key=url.pathname;
      try{
        const response=await Promise.race([fetch(request,{cache:"no-store"}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("asset timeout")),8000))]);
        if(response&&response.ok)cache.put(key,response.clone()).catch(()=>{});
        return response;
      }catch(error){
        return (await cache.match(key))||Response.error();
      }
    })());
  }
});
