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
async function getNotificationBrandLogo() {
  try {
    const response = await fetch("https://lkdfjiweqxshbbcadfna.supabase.co/rest/v1/rpc/crew_get_brand_identity", {
      method: "POST",
      headers: { apikey: "sb_publishable_8-7_og12Zot7nA-W_tz-rw_yDS1I9cp", Authorization: "Bearer sb_publishable_8-7_og12Zot7nA-W_tz-rw_yDS1I9cp", "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store"
    });
    if (!response.ok) return null;
    const identity = await response.json();
    const url = identity?.logo_url;
    return identity?.targets?.notifications === true && typeof url === "string" && url.startsWith("https://lkdfjiweqxshbbcadfna.supabase.co/storage/v1/object/public/crew-brand-assets/brand/kinetic-crew-logo.png") ? url : null;
  } catch { return null; }
}
messaging.onBackgroundMessage(async (payload) => {
  const title = payload.notification?.title || "Kinetic Crew";
  const notificationLogo = await getNotificationBrandLogo();
  const options = {
    body: payload.notification?.body || "You have a new crew update.",
    icon: notificationLogo || "/icon.svg",
    ...(payload.notification?.image ? { image: payload.notification.image } : {}),
    badge: "/kc-notification-badge.svg",
    tag: payload.data?.notificationId || "kinetic-crew",
    renotify: false,
    data: { url: payload.data?.url || "/?kc_notification_view=notifications" }
  };
  self.registration.showNotification(title, options);
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data?.url || "/?kc_notification_view=notifications", self.location.origin); if (target.origin !== self.location.origin) throw new Error("External notification target blocked"); }
  catch { target = new URL("/?kc_notification_view=notifications", self.location.origin); }
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.navigate(target.href); return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
