(() => {
  "use strict";
  const client = window.kcSupabase;
  let room = null, livekitModule = null, isHost = false, activeCode = "", activeTitle = "", admissionTimer = null, waitingTimer = null;
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
    const text='Join my KC Meet: '+activeTitle+'. No event registration is required. Sign in with your approved Kinetic Crew account, open the link and request to join. '+url;
    try{
      if(navigator.share){await navigator.share({title:'KC Meet · '+activeTitle,text,url});}
      else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);showError('Meeting invite link copied. Share it with your crew.');}
      else {const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();document.execCommand('copy');input.remove();showError('Meeting invite link copied. Share it with your crew.');}
    }catch(error){if(error?.name!=='AbortError'){try{await navigator.clipboard.writeText(text);showError('Meeting invite link copied. Share it with your crew.');}catch{showError('Could not share the invite. Please copy the meeting code: '+activeCode);}}}
  }
  function showAppError(message) {
    return appDialog({title:"Something went wrong",message:String(message||"KC Meet could not start. Please try again."),confirmText:"Got it",showCancel:false});
  }
  function stopAdmissionPolling(){if(admissionTimer){clearInterval(admissionTimer);admissionTimer=null;}if(waitingTimer){clearInterval(waitingTimer);waitingTimer=null;}}
  async function refreshAdmissionRequests(){
    if(!isHost||!activeCode||!room)return;
    try{const result=await meetAction("pending",{code:activeCode}),wrap=$("#kcml-admission-list");if(!wrap)return;const requests=result.requests||[];wrap.innerHTML=requests.length?requests.map(item=>'<article class="kcml-admission-row"><span class="kcml-avatar">'+esc(String(item.participant_name||"KC").slice(0,2).toUpperCase())+'</span><span><b>'+esc(item.participant_name||"Crew member")+'</b><small>Wants to join</small></span><button type="button" data-kcml-admit="'+esc(item.id)+'">Admit</button><button type="button" data-kcml-reject="'+esc(item.id)+'" aria-label="Reject request">×</button></article>').join(''):'<p class="kcml-admission-empty">No one is waiting right now.</p>';const badge=$("#kcml-admission-count");if(badge)badge.textContent=String(requests.length);const section=$("#kcml-admission-card");if(section)section.hidden=!requests.length;}catch(error){console.warn("KC Meet waiting room refresh failed:",error);}
  }
  function startAdmissionPolling(){if(!isHost)return;refreshAdmissionRequests();if(admissionTimer)clearInterval(admissionTimer);admissionTimer=setInterval(refreshAdmissionRequests,3500);}
  function showWaitingRoom(code){
    return new Promise(resolve=>{
      const root=$("#modalRoot");if(!root){resolve(false);return;}let finished=false;
      const finish=value=>{if(finished)return;finished=true;if(waitingTimer)clearInterval(waitingTimer);waitingTimer=null;root.innerHTML="";resolve(value);};
      root.innerHTML='<div class="modalback kc-confirm-backdrop"><section class="modal kc-confirm-modal kc-meet-app-dialog kc-meet-waiting" role="dialog" aria-modal="true"><span class="kc-confirm-kicker">KINETIC CREW · MEET</span><div class="kc-meet-waiting-pulse">◉</div><h2>Waiting for the host</h2><p>Your join request has been sent. Keep this screen open; the host can admit or decline you.</p><div class="kc-meet-prejoin-code">MEETING CODE <b>'+esc(code)+'</b></div><div class="kc-meet-waiting-state" id="kcMeetWaitingState">Request sent · Waiting for approval</div><div class="kc-confirm-actions"><button type="button" class="secondary" data-kc-wait-cancel>Cancel request</button></div></section></div>';
      root.querySelector("[data-kc-wait-cancel]")?.addEventListener("click",async()=>{try{await meetAction("cancel",{code});}catch(error){console.warn("KC Meet request cancellation failed:",error);}finish(false);});let busy=false;
      const check=async()=>{if(busy||finished)return;busy=true;try{const status=await meetAction("status",{code});if(status.status==="approved"){finish(true);return;}if(status.status==="rejected"){finish(false);await showAppError("The host declined your request to join this meeting.");return;}if(status.meetingStatus==="ended"){finish(false);await showAppError("This meeting has ended.");return;}const state=$("#kcMeetWaitingState");if(state)state.textContent=status.meetingStatus==="scheduled"?"Request saved · The host will review it when the meeting opens":"Request sent · Waiting for host approval";}catch(error){const state=$("#kcMeetWaitingState");if(state)state.textContent=error.message||"Reconnecting to the waiting room…";}finally{busy=false;}};
      waitingTimer=setInterval(check,3000);check();
    });
  }
  const scheduledMeetingCache=new Map();
  function scheduleDialog(existing=null){
    const root=$("#modalRoot");if(!root)return;const editing=!!existing;
    const date=new Date(Date.now()+60*60*1000);date.setMinutes(0,0,0);
    const localValue=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16);};
    const fieldValue=value=>value?localValue(new Date(value)):localValue(date);
    const selectedIds=new Set((existing?.invite_user_ids||[]).map(String));
    root.innerHTML='<div class="modalback kc-confirm-backdrop" data-kc-schedule-backdrop><section class="modal kc-confirm-modal kc-meet-schedule" role="dialog" aria-modal="true" aria-labelledby="kcMeetScheduleTitle"><span class="kc-confirm-kicker">KINETIC CREW · EVENTS</span><h2 id="kcMeetScheduleTitle">'+(editing?'Edit meeting event':'Create a meeting event')+'</h2><p>Schedule a live KC Meet session. No event registration or ticket is required; people join using the invite link and wait for your approval.</p><form id="kcMeetScheduleForm"><label class="kc-meet-dialog-label">Meeting title<input class="kc-confirm-input" name="title" maxlength="80" required placeholder="Crew planning meeting" value="'+esc(existing?.title||'')+'"></label><label class="kc-meet-dialog-label">Description <small>Optional</small><textarea class="kc-confirm-input" name="description" rows="3" maxlength="1200" placeholder="What will this meeting cover?">'+esc(existing?.description||'')+'</textarea></label><div class="kc-meet-schedule-dates"><label class="kc-meet-dialog-label">Start date & time<input class="kc-confirm-input" type="datetime-local" name="starts_at" min="'+localValue(new Date())+'" value="'+fieldValue(existing?.starts_at)+'" required></label><label class="kc-meet-dialog-label">End date & time <small>Optional</small><input class="kc-confirm-input" type="datetime-local" name="ends_at" min="'+localValue(date)+'" value="'+(existing?.ends_at?fieldValue(existing.ends_at):'')+'"></label></div><label class="kc-meet-schedule-email"><input type="checkbox" name="send_email" '+(existing?.send_email?'checked':'')+'><span><b>Send email invitation</b><small>Email the meeting link and schedule to the selected approved crew members.</small></span></label><div class="kc-meet-invite-options" id="kcMeetInviteOptions" '+(existing?.send_email?'':'hidden')+'><label class="kc-meet-dialog-label">Send invitation to<select class="kc-confirm-input" name="invite_audience"><option value="all" '+((existing?.invite_audience||'all')==='all'?'selected':'')+'>Everyone</option><option value="admin" '+(existing?.invite_audience==='admin'?'selected':'')+'>Admins</option><option value="member" '+(existing?.invite_audience==='member'?'selected':'')+'>Members</option><option value="selected" '+(existing?.invite_audience==='selected'?'selected':'')+'>Selected crew members</option></select></label><div class="kc-meet-recipient-picker" id="kcMeetRecipientPicker" '+(existing?.invite_audience==='selected'?'':'hidden')+'><div class="kc-meet-recipient-head"><b>Select recipients</b><small id="kcMeetRecipientCount">Loading crew…</small></div><div class="kc-meet-recipient-list" id="kcMeetRecipientList"><p>Loading approved crew members…</p></div></div></div><div class="kc-confirm-actions"><button type="button" class="secondary" data-kc-schedule-cancel>Cancel</button><button type="submit" class="primary">'+(editing?'Save changes':'Schedule meeting event')+'</button></div></form></section></div>';
    const form=root.querySelector("#kcMeetScheduleForm"),sendCheck=form.querySelector('[name="send_email"]'),audience=form.querySelector('[name="invite_audience"]'),options=root.querySelector("#kcMeetInviteOptions"),picker=root.querySelector("#kcMeetRecipientPicker"),list=root.querySelector("#kcMeetRecipientList"),count=root.querySelector("#kcMeetRecipientCount");
    let recipientsLoaded=false;
    const updateVisibility=()=>{options.hidden=!sendCheck.checked;picker.hidden=audience.value!=="selected";};
    const loadRecipients=async()=>{
      if(recipientsLoaded)return;recipientsLoaded=true;
      try{const result=await meetAction("recipients"),rows=result.recipients||[];list.innerHTML=rows.length?rows.map(person=>'<label class="kc-meet-recipient-option"><input type="checkbox" name="invite_user_ids" value="'+esc(person.auth_id)+'" '+(selectedIds.has(String(person.auth_id))?'checked':'')+'><span><b>'+esc(person.name||'Crew member')+'</b><small>'+esc(person.role==='super_admin'?'Super Admin':person.role==='admin'?'Admin':'Member')+'</small></span></label>').join(''):'<p>No approved crew members found.</p>';count.textContent=rows.length+' approved crew members';list.addEventListener("change",()=>{const n=list.querySelectorAll('input:checked').length;count.textContent=n+' selected';});}catch(error){recipientsLoaded=false;list.innerHTML='<p>'+esc(error.message||'Could not load crew members. Try again.')+'</p>';count.textContent='Could not load';}
    };
    sendCheck.addEventListener("change",updateVisibility);audience.addEventListener("change",()=>{updateVisibility();if(audience.value==="selected")loadRecipients();});
    if(audience.value==="selected")loadRecipients();
    updateVisibility();
    root.querySelector("[data-kc-schedule-cancel]")?.addEventListener("click",()=>root.innerHTML="");root.querySelector("[data-kc-schedule-backdrop]")?.addEventListener("click",e=>{if(e.target===e.currentTarget)root.innerHTML="";});
    form?.addEventListener("submit",async e=>{
      e.preventDefault();const button=form.querySelector('button[type="submit"]'),d=new FormData(form),title=String(d.get("title")||"").trim(),starts_at=String(d.get("starts_at")||""),ends_at=String(d.get("ends_at")||""),sendEmail=d.get("send_email")==="on",invite_audience=String(d.get("invite_audience")||"all"),invite_user_ids=[...form.querySelectorAll('[name="invite_user_ids"]:checked')].map(el=>el.value);
      if(ends_at&&new Date(ends_at)<=new Date(starts_at)){showError("Meeting end time must be after its start time.");return;}
      if(sendEmail&&invite_audience==="selected"&&!invite_user_ids.length){showError("Select at least one crew member to receive the invitation.");return;}
      button.disabled=true;button.textContent=editing?"Saving…":"Scheduling…";
      try{
        const payload={title,description:String(d.get("description")||"").trim(),starts_at:new Date(starts_at).toISOString(),ends_at:ends_at?new Date(ends_at).toISOString():null,send_email:sendEmail,invite_audience,invite_user_ids};
        const result=await meetAction(editing?"edit":"schedule",editing?{...payload,id:existing.id}:payload);
        root.innerHTML='<div class="modalback kc-confirm-backdrop"><section class="modal kc-confirm-modal kc-meet-scheduled-success"><span class="kc-confirm-kicker">KINETIC CREW · EVENTS</span><div class="kc-meet-scheduled-check">✓</div><h2>'+(editing?'Meeting event updated':'Meeting event scheduled')+'</h2><p>'+esc(title)+' '+(editing?'has been updated.':'is now on the KC Meet schedule. No registration is needed.')+'</p><div class="kc-meet-prejoin-code">MEETING CODE <b>'+esc(result.code)+'</b></div><label class="kc-meet-dialog-label">Invitation link<input class="kc-confirm-input" readonly value="'+esc(result.inviteUrl)+'"></label><div class="kc-confirm-actions"><button type="button" class="secondary" data-kc-schedule-done>Done</button><button type="button" class="primary" data-kc-schedule-share>Share invite link</button></div></section></div>';
        root.querySelector("[data-kc-schedule-done]")?.addEventListener("click",()=>root.innerHTML="");root.querySelector("[data-kc-schedule-share]")?.addEventListener("click",async()=>{try{if(navigator.share)await navigator.share({title:"KC Meet · "+title,text:"No registration required. Request to join using this meeting link.",url:result.inviteUrl});else{await navigator.clipboard.writeText(result.inviteUrl);showError("Meeting invite link copied.");}}catch(err){if(err?.name!=="AbortError")showError("Could not share the meeting link.");}});
        if(sendEmail&&window.kcPush?.send){try{const audienceValue=invite_audience;await window.kcPush.send((editing?"Updated KC Meet event: ":"KC Meet event: ")+title,String(d.get("description")||"")+(editing?"\\n\\nThe meeting details have changed.":"")+"\\n\\nStarts: "+new Date(starts_at).toLocaleString()+"\\nNo event registration required. Open the meeting link and wait for host approval:\\n"+result.inviteUrl,audienceValue,{sendEmail:true,emailKey:"kc-meet:"+(editing?"updated:":"")+result.code+":"+result.meeting.updated_at,emailType:"event",recipientIds:invite_user_ids,url:result.inviteUrl});}catch(error){console.warn("KC Meet email invitation failed:",error);showError("The event was saved, but its email/push invitation could not be sent: "+(error.message||"delivery failed"));}}
        await loadScheduledMeetings();
      }catch(error){showError(error.message||"Could not save this meeting event.");button.disabled=false;button.textContent=editing?"Save changes":"Schedule meeting event";}
    });
  }
  async function confirmDeleteMeeting(title){
    const root=$("#modalRoot");if(!root)return false;
    return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;root.innerHTML="";resolve(value);};
      root.innerHTML='<div class="modalback kc-confirm-backdrop" data-kc-delete-backdrop><section class="modal kc-confirm-modal kc-meet-delete-confirm" role="dialog" aria-modal="true"><span class="kc-confirm-kicker">KINETIC CREW · MEET</span><h2>Delete meeting event?</h2><p><b>'+esc(title)+'</b> will be permanently removed. Its join requests and live meeting room will also be cleared. This cannot be undone.</p><div class="kc-confirm-actions"><button type="button" class="secondary" data-kc-delete-cancel>Keep event</button><button type="button" class="primary" data-kc-delete-confirm>Delete event</button></div></section></div>';
      root.querySelector("[data-kc-delete-cancel]")?.addEventListener("click",()=>finish(false));root.querySelector("[data-kc-delete-confirm]")?.addEventListener("click",()=>finish(true));root.querySelector("[data-kc-delete-backdrop]")?.addEventListener("click",e=>{if(e.target===e.currentTarget)finish(false);});
    });
  }
  function meetingCard(item){
    const when=new Date(item.starts_at).toLocaleString([],{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
    return '<article class="kcml-scheduled-card"><div class="kcml-scheduled-top"><span>◉ KC MEET EVENT</span><span class="kcml-scheduled-status '+esc(item.status)+'">'+(item.status==="active"?"LIVE":"SCHEDULED")+'</span></div><h3>'+esc(item.title)+'</h3><p>'+esc(item.description||"A live meeting with your Kinetic Crew.")+'</p><div class="kcml-scheduled-meta"><span>◷ '+esc(when)+'</span><span>NO REGISTRATION</span></div><div class="kcml-scheduled-actions">'+(item.isHost?'<button type="button" data-kcml-start="'+esc(item.code)+'" data-title="'+esc(item.title)+'">'+(item.status==="active"?"Resume meeting":"Start meeting")+'</button>':'')+'<button type="button" data-kcml-open-code="'+esc(item.code)+'">'+(item.status==="active"?"Join meeting":"Open invite")+'</button><button type="button" class="secondary" data-kcml-copy-code="'+esc(item.code)+'">Copy invite link</button>'+(item.canManage?'<button type="button" class="secondary" data-kcml-edit="'+esc(item.id)+'">Edit event</button><button type="button" class="danger" data-kcml-delete="'+esc(item.id)+'">Delete event</button>':'')+'</div></article>';
  }
  async function loadScheduledMeetings(){
    try{const result=await meetAction("list");scheduledMeetingCache.clear();(result.meetings||[]).forEach(item=>scheduledMeetingCache.set(String(item.id),item));const html=(result.meetings||[]).map(meetingCard).join('');const a=$("#kcMeetScheduledEvents"),b=$("#kcMeetEventsScheduled");if(a)a.innerHTML=html||'<p class="kcml-scheduled-empty">No upcoming meeting events. Admins can schedule one for the crew.</p>';if(b)b.innerHTML=html||'<p class="kcml-scheduled-empty">No KC Meet events are scheduled yet.</p>';}catch(error){console.warn("Could not load scheduled KC Meet events:",error);}
  }
  function showError(message) {
    const el = $("#kcml-status"); if (el) { el.textContent = message; el.hidden = false; }
    else showAppError(message);
  }
  async function meetAction(action, payload = {}) {
    if (!client) throw new Error("Kinetic Crew connection is unavailable. Reload and try again.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (sessionError || !accessToken) throw new Error("Your session expired. Sign in again.");
    const { data, error } = await client.functions.invoke("kc-meet-token", { body: { action, ...payload } });
    if (error) {
      let message = error.message || "KC Meet request failed.";
      try { const body = await error.context?.json?.(); if (body?.error) message = body.error; } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }
  async function issueToken(action, payload = {}) {
    const data = await meetAction(action, payload);
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
          try { await meetAction("mute", { code: activeCode, identity: participant.identity, trackSid: publication.trackSid }); mute.textContent = "Muted"; }
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
    const {videoEnabled=false,audioEnabled=false,preissued=null,...tokenPayload}=payload||{};
    const data = preissued || await issueToken(action, tokenPayload);
    isHost = !!data.isHost; activeCode = data.code || payload.code || ""; activeTitle = data.title || "Kinetic Crew Meeting";
    const { Room, RoomEvent, Track } = await sdk();
    room = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: { width: 1280, height: 720 }, facingMode: "user" } });
    showDialog('<header class="kcml-head"><div class="kcml-brand"><span class="kcml-brand-mark">K</span><div><span>KINETIC CREW · MEET</span><h2>' + esc(activeTitle) + '</h2><small><i class="kcml-live-dot"></i> Live meeting · Code <b>' + esc(activeCode) + '</b></small></div></div><button data-kcml-close aria-label="Leave meeting">×</button></header><div id="kcml-status" class="kcml-status" hidden></div><div class="kcml-main"><section class="kcml-stage"><div class="kcml-stage-top"><span><i class="kcml-live-dot"></i> LIVE</span><span id="kcml-participant-count">1 participant</span></div><div id="kcml-grid" class="kcml-grid"><div class="kcml-connecting">Connecting to your crew…</div></div><div class="kcml-stage-bottom"><span>Meeting details</span><span>Camera and microphone start off. Turn them on whenever you are ready.</span></div></section><aside class="kcml-sidepanel"><section class="kcml-admission-card" id="kcml-admission-card" hidden><div><b>Waiting room</b><span id="kcml-admission-count">0</span></div><div id="kcml-admission-list"></div></section><div class="kcml-panel-tabs"><button type="button" class="active" data-kcml-panel="people">People <span id="kcml-people-count">1</span></button><button type="button" data-kcml-panel="chat">In-call messages</button></div><section id="kcml-people-panel" class="kcml-panel-content"><b>In this meeting</b><div id="kcml-people-list"><p class="kcml-panel-empty">You are joining the room…</p></div></section><section id="kcml-chat-panel" class="kcml-panel-content" hidden><b>Meeting chat</b><div id="kcml-chat-log" aria-live="polite"><p>Messages are visible to everyone in this meeting.</p></div><form id="kcml-chat-form"><input id="kcml-chat-input" maxlength="1000" placeholder="Send a message to everyone" autocomplete="off"><button type="submit" aria-label="Send message">➤</button></form></section></aside></div><footer class="kcml-controls"><section class="kcml-control-card"><div class="kcml-control-heading"><b>Meeting controls</b><small>Manage your camera, microphone and presentation</small></div><div class="kcml-control-actions"><button data-kcml-mic class="'+(!audioEnabled?'is-off':'')+'" aria-label="'+(audioEnabled?'Mute microphone':'Turn microphone on')+'"><span>🎙</span><b>'+(audioEnabled?'Mute mic':'Mic off')+'</b><small>'+(audioEnabled?'Microphone is on':'Microphone is off')+'</small></button><button data-kcml-camera class="'+(!videoEnabled?'is-off':'')+'" aria-label="'+(videoEnabled?'Turn camera off':'Turn camera on')+'"><span>▣</span><b>'+(videoEnabled?'Turn camera off':'Video off')+'</b><small>'+(videoEnabled?'Camera is on':'Camera is off')+'</small></button><button data-kcml-screen aria-label="Share screen"><span>▧</span><b>Share screen</b><small>Present your screen</small></button><button type="button" data-kcml-copy class="kcml-share-card"><span>↗</span><b>Share invite link</b><small>Copy or send the meeting link</small></button></div></section><div class="kcml-call-actions"><button type="button" data-kcml-panel="people"><span>♙</span><small>People</small></button><button type="button" data-kcml-panel="chat"><span>▤</span><small>Chat</small></button><button data-kcml-leave class="kcml-leave"><span>☎</span><small>' + (isHost ? 'End meeting' : 'Leave call') + '</small></button></div></footer>');
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
    startAdmissionPolling();
    $("#kcMeetLiveRoot").addEventListener("click",async event=>{const admit=event.target.closest("[data-kcml-admit]"),reject=event.target.closest("[data-kcml-reject]");if(!admit&&!reject)return;const button=admit||reject;button.disabled=true;try{await meetAction(admit?"admit":"reject",{code:activeCode,request_id:button.dataset.kcmlAdmit||button.dataset.kcmlReject});await refreshAdmissionRequests();}catch(error){showError(error.message||"Could not update the waiting-room request.");button.disabled=false;}});
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
    $("#kcMeetLiveRoot").querySelector("[data-kcml-mic]").onclick = async e => { const enabled = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!enabled); e.currentTarget.querySelector("b").textContent=enabled?"Mic off":"Mute mic";e.currentTarget.querySelector("small").textContent=enabled?"Microphone is off":"Microphone is on";e.currentTarget.setAttribute("aria-label",enabled?"Turn microphone on":"Mute microphone");e.currentTarget.classList.toggle("is-off",enabled); };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-camera]").onclick = async e => { const enabled = room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(!enabled); e.currentTarget.querySelector("b").textContent=enabled?"Video off":"Turn camera off";e.currentTarget.querySelector("small").textContent=enabled?"Camera is off":"Camera is on";e.currentTarget.setAttribute("aria-label",enabled?"Turn camera on":"Turn camera off");e.currentTarget.classList.toggle("is-off",enabled); };
    $("#kcMeetLiveRoot").querySelector("[data-kcml-screen]").onclick = async e => { try { const enabled = room.localParticipant.isScreenShareEnabled; await room.localParticipant.setScreenShareEnabled(!enabled);e.currentTarget.querySelector("b").textContent=enabled?"Share screen":"Stop sharing";e.currentTarget.querySelector("small").textContent=enabled?"Present your screen":"Screen is being shared";e.currentTarget.classList.toggle("is-off",!enabled); } catch { showError("Screen sharing is not supported in this browser or device."); } };
    $("#kcMeetLiveRoot").querySelectorAll("[data-kcml-copy]").forEach(button=>button.onclick=shareInvite);
    $("#kcMeetLiveRoot").querySelector("[data-kcml-leave]").onclick = async () => {
      const leaveButton = $("#kcMeetLiveRoot").querySelector("[data-kcml-leave]");
      leaveButton.disabled = true;
      try {
        if (isHost) await meetAction("end", { code: activeCode });
        await closeRoom(true);
      } catch (error) { showError(error?.message || "Could not end the meeting."); leaveButton.disabled = false; }
    };
  }
  async function closeRoom(disconnect = true) {
    stopAdmissionPolling();
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
        const request=await meetAction("request",{code});
        if(request.status!=="approved"){const admitted=await showWaitingRoom(code);if(!admitted)return;}
        if(request.isHost&&request.scheduledMeeting){
          const hostSession=await meetAction("start",{code});
          await connect("start",{code,...setup,preissued:hostSession});
        }else{
          await connect("join", { code, ...setup });
        }
      }
    } catch (error) {
      await showAppError(error?.message || "KC Meet could not start. Please try again.");
    } finally { button.dataset.busy = "0"; button.disabled = false; }
  }, true);
  function openMeetingCode(code){
    document.dispatchEvent(new CustomEvent("kc:navigate",{detail:{view:"meet"}}));
    let attempts=0;const timer=setInterval(()=>{attempts++;const input=$("#kcMeetCode");if(input){input.value=code;clearInterval(timer);$("[data-kc-meet-join]")?.click();}else if(attempts>30)clearInterval(timer);},150);
  }
  document.addEventListener("click",async event=>{
    const schedule=event.target.closest("[data-kc-meet-schedule]");if(schedule){event.preventDefault();scheduleDialog();return;}
    const start=event.target.closest("[data-kcml-start]");
    if(start){const code=start.dataset.kcmlStart;start.disabled=true;try{const setup=await prejoinDialog({code});if(!setup){start.disabled=false;return;}const data=await meetAction("start",{code});await connect("start",{code,...setup,preissued:data});}catch(error){await showAppError(error.message||"Could not start the scheduled meeting.");start.disabled=false;}return;}
    const edit=event.target.closest("[data-kcml-edit]");if(edit){const item=scheduledMeetingCache.get(String(edit.dataset.kcmlEdit));if(item)scheduleDialog(item);return;}
    const remove=event.target.closest("[data-kcml-delete]");if(remove){const item=scheduledMeetingCache.get(String(remove.dataset.kcmlDelete));if(!item)return;const confirmed=await confirmDeleteMeeting(item.title);if(!confirmed)return;remove.disabled=true;try{await meetAction("delete",{id:item.id});await loadScheduledMeetings();}catch(error){remove.disabled=false;await showAppError(error.message||"Could not delete this meeting.");}return;}
    const open=event.target.closest("[data-kcml-open-code]");if(open){openMeetingCode(open.dataset.kcmlOpenCode);return;}
    const copy=event.target.closest("[data-kcml-copy-code]");
    if(copy){const url=new URL(window.location.href);url.searchParams.set("kc_meet",copy.dataset.kcmlCopyCode);try{if(navigator.share)await navigator.share({title:"KC Meet invitation",url:url.toString()});else{await navigator.clipboard.writeText(url.toString());showError("Meeting invitation link copied.");}}catch(err){if(err?.name!=="AbortError")showError("Could not share the meeting link.");}return;}
  });
  let lastMeetScheduleRoot=null,lastEventsScheduleRoot=null;
  const scheduledObserver=new MutationObserver(()=>{
    const meetRoot=$("#kcMeetScheduledEvents"),eventsRoot=$("#kcMeetEventsScheduled");
    if(meetRoot!==lastMeetScheduleRoot||eventsRoot!==lastEventsScheduleRoot){lastMeetScheduleRoot=meetRoot;lastEventsScheduleRoot=eventsRoot;if(meetRoot||eventsRoot)loadScheduledMeetings();}
  });
  if(document.body)scheduledObserver.observe(document.body,{childList:true,subtree:true});
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
      const inviteObserver=new MutationObserver(()=>prefill());
      inviteObserver.observe(document.body,{childList:true,subtree:true});
      document.dispatchEvent(new CustomEvent("kc:navigate",{detail:{view:"meet"}}));
      prefill();
      setTimeout(()=>inviteObserver.disconnect(),8000);
    };
    client?.auth.getSession().then(({data})=>{if(data?.session)openInvite();}).catch(()=>{});
    client?.auth.onAuthStateChange((_event,session)=>{if(session?.user)openInvite();});
  }
})();