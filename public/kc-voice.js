(() => {
  "use strict";

  const PREF_KEY = "kc_voice_preferences_v1";
  const WAKE_RE = /\bhey\s+(?:k\s*c|kc|kay\s*see|kinetic\s*crew)\b/i;
  const LANGUAGES = {
    "en-IN": "English (India)",
    "hi-IN": "Hindi",
    "te-IN": "Telugu"
  };
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let enabled = false;
  let armed = false;
  let recognition = null;
  let restartTimer = null;
  let commandTimer = null;
  let hideTimer = null;
  let line = null;
  let previousSettingsMarkup = "";
  let speaking = false;
  let recognitionBlocked = false;
  let lastStart = 0;

  function preferences() {
    try {
      const value = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      return {
        enabled: value.enabled === true,
        language: LANGUAGES[value.language] ? value.language : "en-IN",
        voice: value.voice !== false
      };
    } catch {
      return { enabled: false, language: "en-IN", voice: true };
    }
  }

  function savePreferences(next) {
    const current = preferences();
    const value = { ...current, ...next };
    localStorage.setItem(PREF_KEY, JSON.stringify(value));
    return value;
  }

  function ensureLine() {
    if (line && line.isConnected) return line;
    line = document.createElement("div");
    line.id = "kcVoiceAmbientLine";
    line.setAttribute("aria-hidden", "true");
    line.innerHTML = '<span></span>';
    document.body.appendChild(line);
    return line;
  }

  function setLine(state) {
    const node = ensureLine();
    node.className = state ? "kc-voice-line is-" + state : "kc-voice-line";
    node.hidden = !state;
    if (state) node.removeAttribute("hidden");
    else node.setAttribute("hidden", "");
  }

  function injectStyles() {
    if (document.getElementById("kcVoiceStyles")) return;
    const style = document.createElement("style");
    style.id = "kcVoiceStyles";
    style.textContent = [
      "#kcVoiceAmbientLine{position:fixed;left:0;right:0;bottom:0;height:3px;z-index:99999;pointer-events:none;opacity:0;overflow:hidden;background:transparent;transition:opacity .18s ease}",
      "#kcVoiceAmbientLine.is-listening,#kcVoiceAmbientLine.is-processing{opacity:1}",
      "#kcVoiceAmbientLine span{display:block;width:34%;height:100%;margin-left:-36%;border-radius:999px;background:linear-gradient(90deg,transparent,#43d8ff 35%,#d8fbff 50%,#43d8ff 70%,transparent);box-shadow:0 0 10px #36cfff,0 0 22px #36cfff;animation:kcVoiceSweep 1.35s ease-in-out infinite}",
      "#kcVoiceAmbientLine.is-processing span{width:48%;animation:kcVoiceProcess .72s ease-in-out infinite alternate;background:linear-gradient(90deg,transparent,#8b8cff,#f4eaff,#8b8cff,transparent)}",
      "@keyframes kcVoiceSweep{0%{transform:translateX(0)}100%{transform:translateX(410%)}}",
      "@keyframes kcVoiceProcess{from{transform:translateX(0);opacity:.55}to{transform:translateX(205%);opacity:1}}",
      "@media(prefers-reduced-motion:reduce){#kcVoiceAmbientLine span{animation:none;width:100%;margin:0;opacity:.8}}",
      ".kc-voice-settings-note{font-size:12px;color:var(--muted,#9297a8);line-height:1.65;margin:8px 0 0}",
      ".kc-voice-settings-card{margin-top:14px}",
      ".kc-voice-settings-card select{min-width:150px;padding:9px 12px;border:1px solid var(--line,#303444);border-radius:9px;background:var(--surface-2,#0d1017);color:inherit}"
    ].join("");
    document.head.appendChild(style);
  }

  function appSnapshot() {
    try { return window.KC_SEARCH_API?.snapshot?.() || {}; }
    catch { return {}; }
  }

  function speak(message, done) {
    const prefs = preferences();
    if (!prefs.voice || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      if (done) done();
      return;
    }
    try {
      speaking = true;
      stopRecognition();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = prefs.language;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = utterance.onerror = () => {
        speaking = false;
        if (done) done();
        scheduleRecognition();
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      speaking = false;
      if (done) done();
      scheduleRecognition();
    }
  }

  function finish(message) {
    clearTimeout(commandTimer);
    armed = false;
    setLine("processing");
    if (message) {
      speak(message, () => {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setLine(""), 350);
      });
    } else {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setLine(""), 650);
    }
  }

  function deny(message) {
    finish(message || "Sorry, you don't have permission to perform that action. Please contact an administrator.");
  }

  function openView(view) {
    const api = window.KC_SEARCH_API;
    if (!api || typeof api.openView !== "function") {
      finish("That section is not available right now.");
      return;
    }
    api.openView(view);
    finish("Opening " + ({
      overview: "home", events: "events", calendar: "calendar", attendance: "attendance", "new-event": "the event creation form",
      profile: "your profile", settings: "app settings", notifications: "notifications",
      meet: "KC Meet", feed: "the crew feed", leave: "leave requests",
      memories: "KC Memories", auditions: "auditions", "member-requests": "member requests"
    }[view] || view) + ".");
  }

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim();
  }

  function includesAny(text, values) {
    return values.some(value => text.includes(value));
  }

  function runCommand(raw) {
    const text = normalize(raw);
    const data = appSnapshot();
    const role = String(data.role || "member").toLowerCase();
    const isAdmin = role === "admin" || role === "super_admin";

    if (!text) {
      finish("I didn't catch that. Please try again.");
      return;
    }

    const deniedEdit = includesAny(text, [
      "edit event", "change event", "update event",
      "कार्यक्रम बदल", "इवेंट बदल", "ఈవెంట్ మార్చ", "ఈవెంట్ ఎడిట్"
    ]);
    if (deniedEdit && !isAdmin) {
      deny("Sorry, you don't have permission to edit events. Please contact an administrator for assistance.");
      return;
    }
    if (deniedEdit && isAdmin) {
      window.KC_SEARCH_API?.openView?.("events");
      finish("You have permission to edit events. Voice editing is not enabled yet, so I have opened the event list for you.");
      return;
    }

    const deniedDelete = includesAny(text, [
      "delete event", "remove event", "कार्यक्रम हट", "ఈవెంట్ తొలగ"
    ]);
    if (deniedDelete && !isAdmin) {
      deny("Sorry, you don't have permission to delete events. Please contact an administrator.");
      return;
    }
    if (deniedDelete && isAdmin) {
      finish("Event deletion is not enabled through voice yet. Please use the event controls.");
      return;
    }

    if (includesAny(text, ["create event", "add event", "new event", "नया इवेंट", "कार्यक्रम बन", "కొత్త ఈవెంట్", "ఈవెంట్ సృష్ట"])) {
      if (!isAdmin) {
        deny("Sorry, you don't have permission to create events. Please contact an administrator.");
        return;
      }
      openView("new-event");
      return;
    }

    if (includesAny(text, ["upcoming events", "show events", "list events", "आने वाले कार्यक्रम", "आगामी इवेंट", "రాబోయే ఈవెంట్లు", "ఈవెంట్లు చూప"])) {
      const events = Array.isArray(data.events) ? data.events : [];
      const upcoming = events
        .filter(event => event && event.starts_at && new Date(event.starts_at).getTime() >= Date.now())
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
        .slice(0, 3);
      if (!upcoming.length) {
        finish("There are no upcoming events listed right now.");
        return;
      }
      const summary = upcoming.map(event => {
        const date = new Date(event.starts_at).toLocaleDateString([], { day: "numeric", month: "short" });
        return String(event.title || "Untitled event") + " on " + date;
      }).join(". ");
      finish("Your upcoming events are: " + summary + ".");
      return;
    }

    if (includesAny(text, ["my role", "what is my role", "मेरा रोल", "मेरी भूमिका", "నా రోల్", "నా పాత్ర"])) {
      const roleNames = { super_admin: "Super Admin", admin: "Admin", member: "Member", audition_participant: "Audition Participant" };
      finish("Your Kinetic Crew role is " + (roleNames[role] || "Member") + ".");
      return;
    }

    if (includesAny(text, ["open home", "go home", "homepage", "होम खोल", "होम पेज", "హోమ్ ఓపెన్", "హోమ్ కి"])) { openView("overview"); return; }
    if (includesAny(text, ["open events", "go to events", "इवेंट खोल", "कार्यक्रम खोल", "ఈవెంట్స్ ఓపెన్", "ఈవెంట్లు తెర"])) { openView("events"); return; }
    if (includesAny(text, ["open attendance", "attendance page", "उपस्थिति खोल", "హాజరు తెర", "అటెండెన్స్ ఓపెన్"])) { openView("attendance"); return; }
    if (includesAny(text, ["open calendar", "calendar खोल", "कैलेंडर खोल", "క్యాలెండర్ ఓపెన్"])) { openView("calendar"); return; }
    if (includesAny(text, ["open profile", "my profile", "प्रोफाइल खोल", "నా ప్రొఫైల్"])) { openView("profile"); return; }
    if (includesAny(text, ["open settings", "app settings", "सेटिंग खोल", "సెట్టింగ్స్ ఓపెన్"])) { openView("settings"); return; }
    if (includesAny(text, ["open notifications", "notifications", "सूचनाएं खोल", "నోటిఫికేషన్స్"])) { openView("notifications"); return; }
    if (includesAny(text, ["open meet", "kc meet", "मीटिंग खोल", "మీట్ ఓపెన్"])) { openView("meet"); return; }
    if (includesAny(text, ["open crew feed", "open feed", "फीड खोल", "ఫీడ్ ఓపెన్"])) { openView("feed"); return; }
    if (includesAny(text, ["open leave", "leave requests", "छुट्टी अनुरोध", "లీవ్ రిక్వెస్ట్"])) { openView("leave"); return; }
    if (includesAny(text, ["open memories", "kc memories", "यादें खोल", "మెమరీస్ ఓపెన్"])) { openView("memories"); return; }
    if (includesAny(text, ["member requests", "open member requests", "सदस्य अनुरोध", "మెంబర్ రిక్వెస్ట్స్"])) {
      if (!isAdmin) { deny("Sorry, you don't have permission to view member requests."); return; }
      openView("member-requests");
      return;
    }

    if (includesAny(text, ["help", "what can you do", "मदद", "क्या कर सकते", "సహాయం", "ఏం చేయగలవు"])) {
      finish("I can open app sections, list upcoming events, tell you your crew role, and open the event creation form for authorized administrators.");
      return;
    }

    finish("I understood the request, but that voice command is not available yet. You can say open events, open attendance, show upcoming events, or ask for your role.");
  }

  function armForCommand() {
    armed = true;
    setLine("listening");
    clearTimeout(commandTimer);
    commandTimer = setTimeout(() => finish("I didn't hear a command. Say Hey KC whenever you need me."), 9000);
  }

  function handleTranscript(transcript) {
    const clean = normalize(transcript);
    if (!armed) {
      const match = WAKE_RE.exec(clean);
      if (!match) return;
      const remainder = clean.slice(match.index + match[0].length).trim();
      armForCommand();
      if (remainder.length > 1) runCommand(remainder);
      return;
    }
    if (clean) runCommand(clean);
  }

  function stopRecognition() {
    if (recognition) {
      const current = recognition;
      recognition = null;
      try { current.onend = null; current.stop(); } catch {}
    }
  }

  function scheduleRecognition() {
    clearTimeout(restartTimer);
    if (!enabled || document.hidden || speaking || recognitionBlocked) return;
    restartTimer = setTimeout(startRecognition, 500);
  }

  function startRecognition() {
    if (!enabled || document.hidden || speaking || recognitionBlocked || recognition || !Recognition) return;
    const prefs = preferences();
    const instance = new Recognition();
    recognition = instance;
    instance.lang = prefs.language;
    instance.continuous = true;
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    instance.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal && result[0]?.transcript) handleTranscript(result[0].transcript);
      }
    };
    instance.onerror = event => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        recognitionBlocked = true;
        enabled = false;
        savePreferences({ enabled: false });
        stopRecognition();
        setLine("");
      }
    };
    instance.onend = () => {
      if (recognition === instance) recognition = null;
      scheduleRecognition();
    };
    try {
      lastStart = Date.now();
      instance.start();
    } catch {
      recognition = null;
      scheduleRecognition();
    }
  }

  function setEnabled(value) {
    enabled = !!value;
    recognitionBlocked = false;
    savePreferences({ enabled });
    if (!enabled) {
      armed = false;
      clearTimeout(commandTimer);
      clearTimeout(restartTimer);
      stopRecognition();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      speaking = false;
      setLine("");
      return;
    }
    if (!Recognition) {
      enabled = false;
      savePreferences({ enabled: false });
      const toggle = document.getElementById("kcVoiceEnabled");
      if (toggle) toggle.checked = false;
      window.alert("Wake-word voice recognition is not supported by this browser. Please use an updated Chrome browser.");
      return;
    }
    startRecognition();
  }

  function settingsPage() {
    const prefs = preferences();
    return '<div class="welcome"><div><div class="eyebrow">APP PREFERENCES <span class="muted">/ VOICE</span></div><h1>KC Voice</h1><p>Hands-free commands for Kinetic Crew. Say “Hey KC” to activate.</p></div><button type="button" class="outline" data-kc-voice-back>← Back to settings</button></div>' +
      '<section class="surface settings-card kc-voice-settings-card">' +
      '<span class="settings-kicker">VOICE ASSISTANT</span><h3>Wake-word activation</h3>' +
      '<label class="settings-toggle"><span><b>Enable Hey KC</b><small>Keep voice activation available while Kinetic Crew is open and active.</small></span><input id="kcVoiceEnabled" type="checkbox" ' + (prefs.enabled ? "checked" : "") + '></label>' +
      '<label class="settings-toggle"><span><b>Command language</b><small>Select the language you will speak after the wake phrase.</small></span><select id="kcVoiceLanguage">' +
      Object.keys(LANGUAGES).map(code => '<option value="' + code + '" ' + (prefs.language === code ? "selected" : "") + '>' + LANGUAGES[code] + '</option>').join("") + '</select></label>' +
      '<label class="settings-toggle"><span><b>Spoken responses</b><small>KC speaks a short response after carrying out a command.</small></span><input id="kcVoiceResponses" type="checkbox" ' + (prefs.voice ? "checked" : "") + '></label>' +
      '<p class="kc-voice-settings-note">Wake-word detection runs only while the app is open and active. Your browser may use its speech-recognition service to transcribe audio; Kinetic Crew does not save microphone recordings. You can disable voice activation here at any time.</p>' +
      '<p class="kc-voice-settings-note">Available commands currently include app navigation, upcoming-event summaries, role lookup and opening the event form for authorized administrators. Editing, deleting and broadcasting by voice are not enabled yet.</p>' +
      '</section>';
  }

  function addSettingsTile() {
    const hub = document.querySelector("#app .kc-settings-hub");
    if (!hub || hub.querySelector("[data-kc-voice-settings]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kc-settings-tile";
    button.setAttribute("data-kc-voice-settings", "");
    button.innerHTML = '<span class="kc-settings-tile-icon" aria-hidden="true">⌁</span><span class="kc-settings-tile-copy"><b>KC Voice</b><small>Hands-free voice assistant</small></span><span class="kc-settings-tile-arrow" aria-hidden="true">↗</span>';
    hub.appendChild(button);
  }

  function showSettings() {
    const app = document.getElementById("app");
    if (!app) return;
    previousSettingsMarkup = app.innerHTML;
    app.innerHTML = settingsPage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function restoreSettings() {
    const app = document.getElementById("app");
    if (!app || !previousSettingsMarkup) return;
    app.innerHTML = previousSettingsMarkup;
    previousSettingsMarkup = "";
  }

  function bindSettings() {
    document.addEventListener("click", event => {
      if (event.target.closest("[data-kc-voice-settings]")) {
        event.preventDefault();
        showSettings();
        return;
      }
      if (event.target.closest("[data-kc-voice-back]")) {
        event.preventDefault();
        restoreSettings();
      }
    });
    document.addEventListener("change", event => {
      if (event.target.id === "kcVoiceEnabled") setEnabled(event.target.checked);
      if (event.target.id === "kcVoiceLanguage") {
        savePreferences({ language: event.target.value });
        if (enabled) {
          stopRecognition();
          scheduleRecognition();
        }
      }
      if (event.target.id === "kcVoiceResponses") savePreferences({ voice: event.target.checked });
    });
  }

  function init() {
    injectStyles();
    ensureLine();
    const observer = new MutationObserver(addSettingsTile);
    const app = document.getElementById("app");
    if (app) observer.observe(app, { childList: true, subtree: true });
    addSettingsTile();
    bindSettings();
    const prefs = preferences();
    if (prefs.enabled && !document.hidden) {
      enabled = true;
      startRecognition();
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        clearTimeout(restartTimer);
        stopRecognition();
        armed = false;
        setLine("");
      } else if (enabled) {
        scheduleRecognition();
      }
    });
    window.addEventListener("pagehide", () => {
      clearTimeout(restartTimer);
      stopRecognition();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();