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
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Kinetic Crew";
  const options = {
    body: payload.notification?.body || "You have a new crew update.",
    icon: "/icon.svg",
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
  let target;\n  try { target = new URL(event.notification.data?.url || "/?kc_notification_view=notifications", self.location.origin); if (target.origin !== self.location.origin) throw new Error("External notification target blocked"); }\n  catch { target = new URL("/?kc_notification_view=notifications", self.location.origin); }
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
