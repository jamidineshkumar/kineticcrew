const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAD7NPmnSrMZv4DzqtSy0Vu9fYddGZoKYc",
  authDomain: "kinetic-crew.firebaseapp.com",
  projectId: "kinetic-crew",
  storageBucket: "kinetic-crew.firebasestorage.app",
  messagingSenderId: "797058143037",
  appId: "1:797058143037:web:f39507213d6e53dd082b54"
};
const VAPID_KEY = "BFyIdRmTPz0zDLmX9785gBdLZcXePRPyANtGSA8_MwZjiIvqSI248jIC45HraqzarkahcdqBVMi1CmWPrMQDzgc";
let messagingPromise;
let foregroundListenerReady = false;
async function getMessaging() {
  if (!messagingPromise) messagingPromise = (async () => {
    const [{ initializeApp, getApps }, { getMessaging, getToken, onMessage }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js")
    ]);
    const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    return { messaging: getMessaging(app), getToken, onMessage };
  })();
  return messagingPromise;
}
async function invoke(action, extra = {}) {
  const client = window.kcSupabase;
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const response = await fetch(window.KC_CONFIG.supabaseUrl + "/functions/v1/send-crew-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: window.KC_CONFIG.supabaseAnonKey, Authorization: "Bearer " + token },
    body: JSON.stringify({ action, ...extra })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Push notification request failed.");
  return result;
}
let nativePushReady = false;
let localNotificationActionReady = false;
function openNotificationTarget(target) {
  let url;
  try { url = new URL(String(target || "/?kc_notification_view=notifications"), window.location.origin); if (url.origin !== window.location.origin) throw new Error("External notification URL blocked"); }
  catch { url = new URL("/?kc_notification_view=notifications", window.location.origin); }
  window.location.assign(url.href);
}
async function enableNativePush() {
  const { PushNotifications } = await import("https://esm.sh/@capacitor/push-notifications@7.0.2");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") throw new Error("Allow notification permission for Kinetic Crew in Android settings.");
  try {
    const { LocalNotifications } = await import("https://esm.sh/@capacitor/local-notifications@7.0.2");
    if (window.Capacitor?.getPlatform?.() === "android") {
      await LocalNotifications.createChannel({
        id: "crew_updates",
        name: "Kinetic Crew updates",
        description: "Event, rehearsal and important crew alerts",
        importance: 5,
        sound: "default",
        vibration: true
      });
    }
  } catch (error) { console.warn("Could not prepare Android notification channel:", error); }
  if (!nativePushReady) {
    nativePushReady = true;
    await PushNotifications.addListener("registration", async token => {
      try { const result = await invoke("register", { token: token.value, platform: "android" }); console.info(result.message); }
      catch (error) { console.error("Could not register Android push token:", error); }
    });
    await PushNotifications.addListener("registrationError", error => console.error("FCM registration failed:", error));
    await PushNotifications.addListener("pushNotificationReceived", async notification => {
      const title = notification.title || "Kinetic Crew";
      const body = notification.body || "You have a new crew update.";
      console.info("Crew push received in foreground:", title);
      window.dispatchEvent(new CustomEvent("kc:notification", { detail: { title, body, target: notification.data?.url?.includes("gram-chat") ? "gram-chat" : notification.data?.url?.includes("chat") ? "chat" : "notifications", conversationId: notification.data?.conversationId || "", messageId: notification.data?.messageId || "" } }));
      try {
        const { LocalNotifications } = await import("https://esm.sh/@capacitor/local-notifications@7.0.2");
        const permission = await LocalNotifications.checkPermissions();
        if (permission.display === "granted") {
          await LocalNotifications.schedule({ notifications: [{
            title, body,
            id: Math.max(1, Date.now() % 2147483647),
            channelId: "crew_updates",
            schedule: { at: new Date(Date.now() + 300) },
            smallIcon: "ic_stat_notification",
            largeIcon: "ic_launcher",
            extra: { ...(notification.data || {}), url: notification.data?.url || "/?kc_notification_view=notifications" }
          }] });
        }
      } catch (error) {
        console.warn("Could not show foreground Android notification:", error);
      }
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", action => {
      openNotificationTarget(action.notification?.data?.url);
    });
    if (!localNotificationActionReady) {
      localNotificationActionReady = true;
      const { LocalNotifications } = await import("https://esm.sh/@capacitor/local-notifications@7.0.2");
      await LocalNotifications.addListener("localNotificationActionPerformed", action => {
        openNotificationTarget(action.notification?.extra?.url);
      });
    }
  }
  await PushNotifications.register();
  return { ok: true, message: "Android push registration started. This device will receive crew alerts after Firebase registration completes." };
}
async function installForegroundListener(messaging, onMessage) {
  if (foregroundListenerReady) return;
  foregroundListenerReady = true;
  onMessage(messaging, async payload => {
    const title = payload.notification?.title || "Kinetic Crew";
    const body = payload.notification?.body || "You have a new crew update.";
    const url = payload.data?.url || "/";
    window.dispatchEvent(new CustomEvent("kc:notification", {
      detail: { title, body, target: url.includes("gram-chat") ? "gram-chat" : url.includes("chat") ? "chat" : "notifications", conversationId: payload.data?.conversationId || "", messageId: payload.data?.messageId || "" }
    }));
    if ("Notification" in window && Notification.permission === "granted") {
      const options = {
        body,
        icon: window.KC_NOTIFICATION_ICON_URL || window.kcPath("icon.svg"),
        ...(payload.notification?.image ? { image: payload.notification.image } : {}),
        badge: window.kcPath("kc-notification-badge.svg"),
        tag: payload.data?.notificationId || payload.data?.id || "kinetic-crew-update",
        renotify: false,
        data: { url }
      };
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
      } catch {
        try { new Notification(title, options); }
        catch (error) { console.warn("Foreground system notification unavailable:", error); }
      }
    }
  });
}
async function syncExistingPermission() {
  if (window.Capacitor?.isNativePlatform?.()) {
    const { PushNotifications } = await import("https://esm.sh/@capacitor/push-notifications@7.0.2");
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== "granted") return { ok: true, skipped: true, message: "Notification permission is not enabled for this app." };
    return enableNativePush();
  }
  if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) {
    return { ok: true, skipped: true };
  }
  const registration = await navigator.serviceWorker.register(window.kcPath("sw.js"), { scope: window.kcPath("") });
  const { messaging, getToken, onMessage } = await getMessaging();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return a device token.");
  const result = await invoke("register", { token, platform: "web" });
  await installForegroundListener(messaging, onMessage);
  localStorage.setItem("kc-push-enabled", "yes");
  return result;
}
async function enable() {
  if (window.Capacitor?.isNativePlatform?.()) return enableNativePush();
  if (!("Notification" in window) || !("serviceWorker" in navigator)) throw new Error("Push notifications are not supported in this browser.");
  if (!window.isSecureContext) throw new Error("Push notifications require HTTPS.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const registration = await navigator.serviceWorker.register(window.kcPath("sw.js"), { scope: window.kcPath("") });
  const { messaging, getToken, onMessage } = await getMessaging();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return a device token. Check the Firebase Web Push certificate.");
  const result = await invoke("register", { token, platform: "web" });
  await installForegroundListener(messaging, onMessage);
  localStorage.setItem("kc-push-enabled", "yes");
  return result;
}
async function invokeEmail(title, body, audience, emailKey, emailType) {
  const client = window.kcSupabase;
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const response = await fetch(window.KC_CONFIG.supabaseUrl + "/functions/v1/send-crew-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: window.KC_CONFIG.supabaseAnonKey, Authorization: "Bearer " + token },
    body: JSON.stringify({ title, body, audience, emailKey, emailType })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Crew email delivery failed.");
  return result;
}
async function send(title, body, audience = "all", options = {}) {
  const imageUrl = String(options?.imageUrl || '').trim();
  const pushResult = await invoke("send", { title, body, audience, imageUrl, url: options?.url || "/?kc_notification_view=notifications" });
  if (options?.sendEmail === true) {
    const emailKey = String(options.emailKey || "").trim();
    if (!emailKey) throw new Error("Email could not be sent because the release key is missing.");
    const emailResult = await invokeEmail(title, body, audience, emailKey, options.emailType || "crew-update");
    return { ...pushResult, email: emailResult };
  }
  return pushResult;
}
window.kcPush = { enable, send, syncExistingPermission };
window.dispatchEvent(new Event('kc:push-ready'));
