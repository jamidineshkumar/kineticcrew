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
async function enableNativePush() {
  const { PushNotifications } = await import("https://esm.sh/@capacitor/push-notifications@7.0.2");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") throw new Error("Allow notification permission for Kinetic Crew in Android settings.");
  if (!nativePushReady) {
    nativePushReady = true;
    await PushNotifications.addListener("registration", async token => {
      try { const result = await invoke("register", { token: token.value, platform: "android" }); console.info(result.message); }
      catch (error) { console.error("Could not register Android push token:", error); }
    });
    await PushNotifications.addListener("registrationError", error => console.error("FCM registration failed:", error));
    await PushNotifications.addListener("pushNotificationReceived", notification => {
      console.info("Crew push received:", notification.title || "Kinetic Crew");
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", action => {
      const target = action.notification?.data?.url || "/";
      window.location.href = window.kcPath(target.replace(/^\//, ""));
    });
  }
  await PushNotifications.register();
  return { ok: true, message: "Android push registration started. This device will receive crew alerts after Firebase registration completes." };
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
  onMessage(messaging, payload => {
    const title = payload.notification?.title || "Kinetic Crew";
    const body = payload.notification?.body || "You have a new crew update.";
    if (Notification.permission === "granted") new Notification(title, { body, icon: window.kcPath("kinetic-crew-logo.svg"), tag: payload.data?.id || "kinetic-crew-update" });
    try {
      const session = window.kcSupabase.auth.getSession();
      session.then(({data}) => {
        const userId = data?.session?.user?.id || "guest";
        const prefs = JSON.parse(localStorage.getItem("kc-notification-prefs:" + userId) || "{}");
        if (prefs.sound !== false) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          const ctx = new Audio(), now = ctx.currentTime;
          [660, 880].forEach((hz, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = "sine"; osc.frequency.value = hz;
            gain.gain.setValueAtTime(.0001, now + i * .12);
            gain.gain.exponentialRampToValueAtTime(.09, now + i * .12 + .025);
            gain.gain.exponentialRampToValueAtTime(.0001, now + i * .12 + .2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now + i * .12); osc.stop(now + i * .12 + .22);
          });
          setTimeout(() => ctx.close(), 700);
        }
      }).catch(() => {});
    } catch {}
  });
  localStorage.setItem("kc-push-enabled", "yes");
  return result;
}
async function send(title, body, audience = "all") {
  return invoke("send", { title, body, audience });
}
window.kcPush = { enable, send };
