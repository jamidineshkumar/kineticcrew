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
  function appDialog({title="Kinetic Crew",message="",inputValue=null,confirmText="Continue",cancelText="Cancel",showCancel=true}={}) {
    return new Promise(resolve => {
      const root = $("#modalRoot");
      if (!root) { resolve(inputValue === null ? undefined : null); return; }
      let settled = false;
      const cancelValue = inputValue === null ? undefined : null;
      const finish = value => { if (settled) return; settled = true; root.innerHTML = ""; document.removeEventListener("keydown", onKey); resolve(value); };
      const onKey = event => {
        if (event.key === "Escape") { event.preventDefault(); finish(cancelValue); }
        if (event.key === "Enter" && inputValue !== null) { event.preventDefault(); root.querySelector("[data-kc-dialog-ok]")?.click(); }
      };
      root.innerHTML = '<div class="modalback kc-confirm-backdrop" data-kc-dialog-backdrop><section class="modal kc-confirm-modal kc-meet-app-dialog" role="dialog" aria-modal="true" aria-labelledby="kcMeetDialogTitle" aria-describedby="kcMeetDialogMessage" tabindex="-1"><span class="kc-confirm-kicker">KINETIC CREW · KC MEET</span><h2 id="kcMeetDialogTitle">'+esc(title)+'</h2><p id="kcMeetDialogMessage">'+esc(message)+'</p>' +
        (inputValue !== null ? '<label class="kc-meet-dialog-label" for="kcMeetDialogInput">Meeting title</label><input id="kcMeetDialogInput" class="kc-confirm-input" type="text" maxlength="80" autocomplete="off" value="'+esc(inputValue)+'" placeholder="Enter meeting title">' : '') +
        '<div class="kc-confirm-actions">'+(showCancel?'<button type="button" class="secondary" data-kc-dialog-cancel>'+esc(cancelText)+'</button>':'')+'<button type="button" class="primary" data-kc-dialog-ok>'+esc(confirmText)+'</button></div></section></div>';
      const input = root.querySelector("#kcMeetDialogInput");
      root.querySelector("[data-kc-dialog-cancel]")?.addEventListener("click",()=>finish(cancelValue));
      root.querySelector("[data-kc-dialog-ok]")?.addEventListener("click",()=>{
        if (inputValue !== null) { const value=String(input?.value||"").trim(); if(!value){input?.focus();return;} finish(value); }
        else finish(true);
      });
      root.querySelector("[data-kc-dialog-backdrop]")?.addEventListener("click",event=>{if(event.target===event.currentTarget)finish(cancelValue);});
      document.addEventListener("keydown",onKey);
      requestAnimationFrame(()=>{if(input){input.focus();input.select();}else root.querySelector(".kc-meet-app-dialog")?.focus();});
    });
  }
  function prejoinDialog({create=false, code=""}={}) {
    return new Promise(resolve => {
      const root=$("#modalRoot");
      if(!root){resolve(null);return;}
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;root.innerHTML="";resolve(value);};
      root.innerHTML='<div class="modalback kc-confirm-backdrop"><section class="modal kc-confirm-modal kc-meet-app-dialog kc-meet-prejoin" role="dialog" aria-modal="true" aria-labelledby="kcMeetSetupTitle"><span class="kc-confirm-kicker">KINETIC CREW · KC MEET</span><h2 id="kcMeetSetupTitle">'+(create?'Set up your meeting':'Ready to join?')+'</h2><p>'+(create?'Choose your meeting name and decide how you want to join.':'Check your camera and microphone before entering the room.')+'</p>'+
        (create?'<label class="kc-meet-dialog-label" for="kcMeetDialogInput">Meeting name</label><input id="kcMeetDialogInput" class="kc-confirm-input" type="text" maxlength="80" autocomplete="off" value="Kinetic Crew Meeting" placeholder="Enter meeting title">':'<div class="kc-meet-prejoin-code">MEETING CODE <b>'+esc(code)+'</b></div>')+
        '<div class="kc-meet-prejoin-options"><label class="kc-meet-prejoin-option"><span class="kc-meet-prejoin-icon">▣</span><span><b>Camera</b><small>Join with video</small></span><input id="kcMeetPrejoinVideo" type="checkbox"><i></i></label><label class="kc-meet-prejoin-option"><span class="kc-meet-prejoin-icon">♬</span><span><b>Microphone</b><small>Join with audio</small></span><input id="kcMeetPrejoinAudio" type="checkbox"><i></i></label></div>'+
        '<small class="kc-meet-prejoin-privacy">Both are off by default. You can turn them on anytime during the meeting.</small><div class="kc-confirm-actions"><button type="button" class="secondary" data-kc-setup-cancel>Cancel</button><button type="button" class="primary" data-kc-setup-continue>'+(create?'Create meeting':'Join meeting')+'</button></div></section></div>';
      root.querySelector('[data-kc-setup-cancel]')?.addEventListener('click',()=>finish(null));
      root.querySelector('[data-kc-setup-continue]')?.addEventListener('click',()=>{
        const title=String(root.querySelector('#kcMeetDialogInput')?.value||'Kinetic Crew Meeting').trim();
        if(create&&!title){root.querySelector('#kcMeetDialogInput')?.focus();return;}
        finish({title,videoEnabled:!!root.querySelector('#kcMeetPrejoinVideo')?.checked,audioEnabled:!!root.querySelector('#kcMeetPrejoinAudio')?.checked});
      });
      root.querySelector('.kc-confirm-backdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)finish(null);});
      requestAnimationFrame(()=>root.querySelector('#kcMeetDialogInput')?.focus());
    });
  }
  function inviteUrl(){
    const url=new URL(window.location.href);
    url.searchParams.set('kc_meet',activeCode);
    return url.toString();
  }
  async function shareInvite(){
    const url=inviteUrl();
    const text='Join my KC Meet: '+activeTitle+'. Sign in to Kinetic Crew with your approved crew account, then open KC Meet. '+url;
    try{
      if(navigator.share){await navigator.share({title:'KC Meet · '+activeTitle,text,url});}
      else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);showError('Meeting invite link copied. Share it with your crew.');}
      else {const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();document.execCommand('copy');input.remove();showError('Meeting invite link copied. Share it with your crew.');}
    }catch(error){if(error?.name!=='AbortError'){try{await navigator.clipboard.writeText(text);showError('Meeting invite link copied. Share it with your crew.');}catch{showError('Could not share the invite. Please copy the meeting code: '+activeCode);}}}
  }
  function showAppError(message) {
    return appDialog({title:"Something went wrong",message:String(message||"KC Meet could not start. Please try again."),confirmText:"Got it",showCancel:false});
  }
  function showError(message) {
    const el = $("#kcml-status"); if (el) { el.textContent = message; el.hidden = false; }
    else showAppError(message);
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
  function renderPeople(){const list=$("#kcml-people-list");if(!list||!room)return;const people=[room.localParticipant,...room.remoteParticipants.values()];const count=$("#kcml-participant-count"),badge=$("#kcml-people-count");if(count)count.textContent=people.length+(people.length===1?" participant":" participants");if(badge)badge.textContent=String(people.length);list.innerHTML=people.map(p=>'<div class="kcml-person-row"><span class="kcml-avatar">'+esc((p.name||p.identity||"KC").slice(0,2).toUpperCase())+'</span><span><b>'+esc(p.name||"Crew member")+(p===room.localParticipant?' (You)':'')+'</b><small>'+(p===room.localParticipant?'You':'Participant')+'</small></span></div>').join('');}
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
    const {videoEnabled=false,audioEnabled=false,...tokenPayload}=payload||{};
    const data = await issueToken(action, tokenPayload);
    isHost = !!data.isHost; activeCode = data.code || payload.code || ""; activeTitle = data.title || "Kinetic Crew Meeting";
    const { Room, RoomEvent, Track } = await sdk();
    room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 1280, height: 720 }, facingMode: "user" } });
    showDialog('<header class="kcml-head"><div class="kcml-brand"><span class="kcml-brand-mark">K</span><div><span>KINETIC CREW · MEET</span><h2>' + esc(activeTitle) + '</h2><small><i class="kcml-live-dot"></i> Live meeting · Code <b>' + esc(activeCode) + '</b></small></div></div><button data-kcml-close aria-label="Leave meeting">×</button></header><div id="kcml-status" class="kcml-status" hidden></div><div class="kcml-main"><section class="kcml-stage"><div class="kcml-stage-top"><span><i class="kcml-live-dot"></i> LIVE</span><span id="kcml-participant-count">1 participant</span><button type="button" data-kcml-copy>Share invite link</button></div><div id="kcml-grid" class="kcml-grid"><div class="kcml-connecting">Connecting to your crew…</div></div><div class="kcml-stage-bottom"><span>Meeting details</span><span>Camera and microphone start off. Turn them on whenever you are ready.</span></div></section><aside class="kcml-sidepanel"><div class="kcml-panel-tabs"><button type="button" class="active" data-kcml-panel="people">People <span id="kcml-people-count">1</span></button><button type="button" data-kcml-panel="chat">In-call messages</button></div><section id="kcml-people-panel" class="kcml-panel-content"><b>In this meeting</b><div id="kcml-people-list"><p class="kcml-panel-empty">You are joining the room…</p></div></section><section id="kcml-chat-panel" class="kcml-panel-content" hidden><b>Meeting chat</b><div id="kcml-chat-log" aria-live="polite"><p>Messages are visible to everyone in this meeting.</p></div><form id="kcml-chat-form"><input id="kcml-chat-input" maxlength="1000" placeholder="Send a message to everyone" autocomplete="off"><button type="submit" aria-label="Send message">➤</button></form></section></aside></div><footer class="kcml-controls"><div class="kcml-control-group"><button data-kcml-mic class="'+(!audioEnabled?'is-off':'')+'" aria-label="'+(audioEnabled?'Mute microphone':'Turn microphone on')+'"><span>🎙</span><small>'+(audioEnabled?'Mute':'Mic off')+'</small></button><button data-kcml-camera class="'+(!videoEnabled?'is-off':'')+'" aria-label="'+(videoEnabled?'Turn camera off':'Turn camera on')+'"><span>▣</span><small>'+(videoEnabled?'Camera':'Video off')+'</small></button><button data-kcml-screen aria-label="Share screen"><span>▧</span><small>Present</small></button></div><div class="kcml-control-group"><button type="button" data-kcml-panel="people"><span>♙</span><small>People</small></button><button type="button" data-kcml-panel="chat"><span>▤</span><small>Chat</small></button><button type="button" data-kcml-copy><span>↗</span><small>Share link</small></button></div><button data-kcml-leave class="kcml-leave"><span>☎</span><small>' + (isHost ? 'End meeting' : 'Leave call') + '</small></button></footer>');
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
    room.on(RoomEvent.ParticipantConnected, participant => { const empty = $(".kcml-connecting"); if (empty) empty.remove(); tile(participant); renderPeople(); });
    room.on(RoomEvent.ParticipantDisconnected, participant => { document.getElementById("kcml-p-" + participant.identity.replace(/[^a-zA-Z0-9_-]/g, "_"))?.remove(); renderPeople(); });
    room.on(RoomEvent.Disconnected, () => { if ($("#kcMeetLiveRoot .kcml-dialog")) closeRoom(false); });
    await room.connect(data.serverUrl, data.token);
    $(".kcml-connecting")?.remove();
    try { await room.localParticipant.setCameraEnabled(!!videoEnabled); } catch (e) { showError("Camera is unavailable or permission was denied. You can still join with video off."); }
    try { await room.localParticipant.setMicrophoneEnabled(!!audioEnabled); } catch (e) { showError("Microphone permission was denied. You can still join with your mic off."); }
    room.localParticipant.videoTrackPublications.forEach(pub => { if (pub.track) tile(room.localParticipant, pub.track, true); });
    room.remoteParticipants.forEach(participant => participant.trackPublications.forEach(pub => { if (pub.track) tile(participant, pub.track, false, pub); }));
    if (!grid.children.length) grid.innerHTML = '<div class="kcml-connecting">You are first in the room. Share the code to invite your crew.</div>';
    $("#kcml-grid")?.classList.add("ready");
    renderPeople();
    $("#kcMeetLiveRoot").querySelectorAll("[data-kcml-panel]").forEach(button=>button.addEventListener("click",()=>{const panel=button.dataset.kcmlPanel;const people=$("#kcml-people-panel"),chat=$("#kcml-chat-panel");if(people)people.hidden=panel!=="people";if(chat)chat.hidden=panel!=="chat";$("#kcMeetLiveRoot").querySelectorAll("[data-kcml-panel]").forEach(b=>b.classList.toggle("active",b.dataset.kcmlPanel===panel));}));
    $("#kcMeetLiveRoot").querySelector("#kcml-chat-form").onsubmit = async e => {
      e.preventDefault();
      const input = $("#kcml-chat-input"), text = input.value.trim();
      if (!text || !room) return;
      try {
        await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({type:"chat",text})), { reliable: true });
        appendChat("You", text, true); input.value = "";
      } catch { showError("Message could not be sent. Check your connection."); }
    };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-mic]").onclick = async e => { const enabled = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!enabled); e.currentTarget.querySelector("small").textContent = enabled ? "Mic on" : "Mic off";e.currentTarget.setAttribute("aria-label",enabled?"Turn microphone on":"Mute microphone");e.currentTarget.classList.toggle("is-off",enabled); };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-camera]").onclick = async e => { const enabled = room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(!enabled); e.currentTarget.querySelector("small").textContent = enabled ? "Video on" : "Video off";e.currentTarget.setAttribute("aria-label",enabled?"Turn camera on":"Turn camera off");e.currentTarget.classList.toggle("is-off",enabled); };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-screen]").onclick = async e => { try { const enabled = room.localParticipant.isScreenShareEnabled; await room.localParticipant.setScreenShareEnabled(!enabled); e.currentTarget.textContent = enabled ? "Share screen" : "Stop sharing"; } catch { showError("Screen sharing is not supported in this browser or device."); } };
    $("#kcMeetLiveRoot").querySelectorAll("[data-kcml-copy]").forEach(button=>button.onclick=shareInvite);
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
        const setup=await prejoinDialog({create:true});
        if(!setup)return;
        await connect("create",setup);
      } else {
        const code = String($("#kcMeetCode")?.value || "").trim().toUpperCase();
        if (!code) throw new Error("Enter a meeting code to continue.");
        const setup=await prejoinDialog({code});
        if(!setup)return;
        await connect("join", { code, ...setup });
      }
    } catch (error) {
      await showAppError(error?.message || "KC Meet could not start. Please try again.");
    } finally { button.dataset.busy = "0"; button.disabled = false; }
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && $("#kcMeetLiveRoot .kcml-dialog")) closeRoom(); });
  window.addEventListener("beforeunload", () => { if (room) room.disconnect(); });
  const inviteCode=new URLSearchParams(window.location.search).get("kc_meet");
  if(inviteCode&&/^KC-[A-HJ-NP-Z2-9]{6}$/i.test(inviteCode)){
    let inviteOpened=false;
    const prefill=()=>{
      const input=$("#kcMeetCode");
      if(!input)return false;
      input.value=inviteCode.toUpperCase();
      input.dataset.invitePrefilled="1";
      return true;
    };
    const openInvite=()=>{
      if(inviteOpened)return;
      inviteOpened=true;
      document.dispatchEvent(new CustomEvent("kc:navigate",{detail:{view:"meet"}}));
      if(prefill())return;
      const inviteObserver=new MutationObserver(()=>{if(prefill())inviteObserver.disconnect();});
      inviteObserver.observe(document.body,{childList:true,subtree:true});
    };
    client?.auth.getSession().then(({data})=>{if(data?.session)openInvite();}).catch(()=>{});
    client?.auth.onAuthStateChange((_event,session)=>{if(session?.user)openInvite();});
  }
})();