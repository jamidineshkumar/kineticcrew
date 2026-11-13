(() => {
  "use strict";
  const client = window.kcSupabase;
  let room = null, livekitModule = null, isHost = false, activeCode = "", activeTitle = "";
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const sdk = async () => livekitModule || (livekitModule = await import("https://esm.sh/livekit-client@2.15.6"));
  function shell() {
    let root = $("#kcMeetLiveRoot");
    if (!root) { root = document.createElement("div"); root.id = "kcMeetLiveRoot"; document.body.append(root); }
    return root;
  }
  function showDialog(content) {
    shell().innerHTML = '<div class="kcml-backdrop"><section class="kcml-dialog" role="dialog" aria-modal="true">' + content + '</section></div>';
    shell().querySelector("[data-kcml-close]")?.addEventListener("click", closeRoom);
  }
  function showError(message) {
    const el = $("#kcml-status"); if (el) { el.textContent = message; el.hidden = false; }
    else window.alert(message);
  }
  async function issueToken(action, payload = {}) {
    if (!client) throw new Error("Kinetic Crew connection is unavailable. Reload and try again.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (sessionError || !accessToken) throw new Error("Your session expired. Sign in again.");
    const { data, error } = await client.functions.invoke("kc-meet-token", { body: { action, ...payload } });
    if (error) {
      let message = error.message || "Could not connect to the meeting service.";
      try { const body = await error.context?.json?.(); if (body?.error) message = body.error; } catch {}
      throw new Error(message);
    }
    if (!data?.token || !data?.serverUrl) throw new Error(data?.error || "Meeting service returned an incomplete response.");
    return data;
  }
  function tile(participant, track, local = false, publication = null) {
    const id = "kcml-p-" + String(participant.identity).replace(/[^a-zA-Z0-9_-]/g, "_");
    let card = document.getElementById(id);
    if (!card) {
      card = document.createElement("article"); card.className = "kcml-participant"; card.id = id;
      card.innerHTML = '<div class="kcml-video"></div><div class="kcml-person"><span class="kcml-avatar">' + esc((participant.name || participant.identity || "KC").slice(0,2).toUpperCase()) + '</span><b>' + esc(participant.name || "Crew member") + (local ? ' <small>(You)</small>' : '') + '</b></div>';
      $("#kcml-grid")?.append(card);
    }
    const video = card.querySelector(".kcml-video");
    if (track?.kind === "video") {
      const element = track.attach();
      element.autoplay = true; element.playsInline = true;
      video.replaceChildren(element);
    }
    if (track?.kind === "audio") {
      const element = track.attach(); element.autoplay = true; element.style.display = "none";
      card.append(element);
      if (isHost && !local && publication?.trackSid && !card.querySelector("[data-kcml-mute]")) {
        const mute = document.createElement("button");
        mute.type = "button"; mute.dataset.kcmlMute = "1"; mute.className = "kcml-mute";
        mute.textContent = "Mute participant";
        mute.onclick = async () => {
          mute.disabled = true;
          try { await issueToken("mute", { code: activeCode, identity: participant.identity, trackSid: publication.trackSid }); mute.textContent = "Muted"; }
          catch (error) { mute.disabled = false; showError(error?.message || "Could not mute participant."); }
        };
        card.querySelector(".kcml-person")?.append(mute);
      }
    }
  }
  function appendChat(name, message, own) {
    const log = $("#kcml-chat-log"); if (!log) return;
    const row = document.createElement("p"); row.className = own ? "kcml-chat-own" : "";
    const author = document.createElement("b"); author.textContent = name;
    const text = document.createElement("span"); text.textContent = message;
    row.append(author, text); log.append(row); log.scrollTop = log.scrollHeight;
  }
  function removeTrack(track) {
    track.detach().forEach(element => element.remove());
  }
  async function connect(action, payload) {
    const data = await issueToken(action, payload);
    isHost = !!data.isHost; activeCode = data.code || payload.code || ""; activeTitle = data.title || "Kinetic Crew Meeting";
    const { Room, RoomEvent, Track } = await sdk();
    room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 1280, height: 720 }, facingMode: "user" } });
    showDialog('<header class="kcml-head"><div><span>KINETIC CREW / LIVE</span><h2>' + esc(activeTitle) + '</h2><small>Meeting code: <b>' + esc(activeCode) + '</b></small></div><button data-kcml-close aria-label="Leave meeting">×</button></header><div id="kcml-status" class="kcml-status" hidden></div><div class="kcml-layout"><div id="kcml-grid" class="kcml-grid"><div class="kcml-connecting">Connecting to your crew…</div></div><aside class="kcml-chat"><b>Meeting chat</b><div id="kcml-chat-log" aria-live="polite"><p>Messages are visible to everyone in this meeting.</p></div><form id="kcml-chat-form"><input id="kcml-chat-input" maxlength="1000" placeholder="Message your crew…" autocomplete="off"><button type="submit">Send</button></form></aside></div><footer class="kcml-controls"><button data-kcml-mic>Mute mic</button><button data-kcml-camera>Turn camera off</button><button data-kcml-screen>Share screen</button><button data-kcml-copy>Copy invite code</button><button data-kcml-leave class="kcml-leave">' + (isHost ? 'End meeting' : 'Leave') + '</button></footer>');
    const grid = $("#kcml-grid");
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => tile(participant, track, false, publication));
    room.on(RoomEvent.TrackUnsubscribed, track => removeTrack(track));
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        if (message.type !== "chat" || typeof message.text !== "string") return;
        appendChat(participant?.name || "Crew member", message.text, false);
      } catch {}
    });
    room.on(RoomEvent.ParticipantConnected, participant => { const empty = $(".kcml-connecting"); if (empty) empty.remove(); tile(participant); });
    room.on(RoomEvent.ParticipantDisconnected, participant => document.getElementById("kcml-p-" + participant.identity.replace(/[^a-zA-Z0-9_-]/g, "_"))?.remove());
    room.on(RoomEvent.Disconnected, () => { if ($("#kcMeetLiveRoot .kcml-dialog")) closeRoom(false); });
    await room.connect(data.serverUrl, data.token);
    $(".kcml-connecting")?.remove();
    try { await room.localParticipant.setCameraEnabled(true); } catch (e) { showError("Camera is unavailable or permission was denied. You can still listen and join."); }
    try { await room.localParticipant.setMicrophoneEnabled(true); } catch (e) { showError("Microphone permission was denied. Check your browser or device settings."); }
    room.localParticipant.videoTrackPublications.forEach(pub => { if (pub.track) tile(room.localParticipant, pub.track, true); });
    room.remoteParticipants.forEach(participant => participant.trackPublications.forEach(pub => { if (pub.track) tile(participant, pub.track, false, pub); }));
    if (!grid.children.length) grid.innerHTML = '<div class="kcml-connecting">You are first in the room. Share the code to invite your crew.</div>';
    $("#kcml-grid")?.classList.add("ready");
    $("#kcMeetLiveRoot").querySelector("#kcml-chat-form").onsubmit = async e => {
      e.preventDefault();
      const input = $("#kcml-chat-input"), text = input.value.trim();
      if (!text || !room) return;
      try {
        await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"chat",text})), { reliable: true });
        appendChat("You", text, true); input.value = "";
      } catch { showError("Message could not be sent. Check your connection."); }
    };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-mic]").onclick = async e => { const enabled = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!enabled); e.currentTarget.textContent = enabled ? "Unmute mic" : "Mute mic"; };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-camera]").onclick = async e => { const enabled = room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(!enabled); e.currentTarget.textContent = enabled ? "Turn camera on" : "Turn camera off"; };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-screen]").onclick = async e => { try { const enabled = room.localParticipant.isScreenShareEnabled; await room.localParticipant.setScreenShareEnabled(!enabled); e.currentTarget.textContent = enabled ? "Share screen" : "Stop sharing"; } catch { showError("Screen sharing is not supported in this browser or device."); } };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-copy]").onclick = async () => { await navigator.clipboard.writeText(activeCode); showError("Meeting code copied. Share it with approved crew members."); };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-leave]").onclick = async () => {
      const leaveButton = $("#kcMeetLiveRoot").querySelector("[data-kcml-leave]");
      leaveButton.disabled = true;
      try {
        if (isHost) await issueToken("end", { code: activeCode });
        await closeRoom(true);
      } catch (error) { showError(error?.message || "Could not end the meeting."); leaveButton.disabled = false; }
    };
  }
  async function closeRoom(disconnect = true) {
    const old = room; room = null;
    if (old && disconnect) { try { await old.disconnect(); } catch {} }
    isHost = false; activeCode = ""; activeTitle = "";
    shell().innerHTML = "";
  }
  document.addEventListener("click", async event => {
    const create = event.target.closest("[data-kc-meet-create]");
    const join = event.target.closest("[data-kc-meet-join]");
    if (!create && !join) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = create || join; if (button.dataset.busy === "1") return;
    button.dataset.busy = "1"; button.disabled = true;
    try {
      if (create) {
        const title = window.prompt("Meeting title", "Kinetic Crew Meeting");
        if (title === null) return;
        await connect("create", { title });
      } else {
        const code = String($("#kcMeetCode")?.value || "").trim().toUpperCase();
        if (!code) throw new Error("Enter a meeting code to continue.");
        await connect("join", { code });
      }
    } catch (error) {
      window.alert(error?.message || "KC Meet could not start. Please try again.");
    } finally { button.dataset.busy = "0"; button.disabled = false; }
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && $("#kcMeetLiveRoot .kcml-dialog")) closeRoom(); });
  window.addEventListener("beforeunload", () => { if (room) room.disconnect(); });
})();