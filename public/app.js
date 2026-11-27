(() => {
'use strict';
const client=window.kcSupabase, auth=client&&client.auth, $=s=>document.querySelector(s);
window.KC_APP_VERSION='1.7.02';
let kcUpdatePending=false,kcUpdateReloading=false,kcPendingVersion='';
const KC_UPDATE_GUARD='kc_update_reload_guard_v1';
function kcReloadAlreadyUsed(version=''){try{return sessionStorage.getItem(KC_UPDATE_GUARD)===String(version||'service-worker');}catch{return new URL(location.href).searchParams.has('kc_refresh');}}
function kcMarkReloadUsed(version=''){try{sessionStorage.setItem(KC_UPDATE_GUARD,String(version||'service-worker'));}catch{}}
function kcSafeToReload(){const el=document.activeElement;if(el&&(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||el.isContentEditable))return false;return !document.querySelector('#modalRoot .modal, #modalRoot [role="dialog"], .kc-modal:not([hidden])');}
function kcApplyPendingUpdate(){if(!kcUpdatePending||kcUpdateReloading||!kcSafeToReload())return;const url=new URL(location.href);const version=kcPendingVersion||url.searchParams.get('kc_refresh_version')||'pending';if(kcReloadAlreadyUsed(version)){kcUpdatePending=false;return;}kcUpdateReloading=true;kcMarkReloadUsed(version);try{savePageState();}catch{}url.searchParams.set('kc_refresh',String(Date.now()));url.searchParams.set('kc_refresh_version',version);location.replace(url.toString());}
async function kcCheckAppVersion(){if(!navigator.onLine||kcUpdateReloading)return;try{const response=await fetch(window.kcPath('app-version.json')+'?check='+Date.now(),{cache:'no-store',credentials:'same-origin'});if(!response.ok)return;const data=await response.json();if(data?.version&&data.version!==window.KC_APP_VERSION){if(kcReloadAlreadyUsed(data.version))return;const nextVersion=String(data.version);if(kcPendingVersion!==nextVersion){kcPendingVersion=nextVersion;notice('Kinetic Crew v'+nextVersion+' is ready. Updating now…');}kcUpdatePending=true;kcApplyPendingUpdate();}}catch{}}
function kcRegisterAutoUpdates(){if(!('serviceWorker'in navigator))return;const hadController=!!navigator.serviceWorker.controller;navigator.serviceWorker.register(window.kcPath('sw.js')+'?v=20261126-desktop-parity-refresh2',{scope:window.kcPath(''),updateViaCache:'none'}).then(async registration=>{const check=()=>{if(navigator.onLine)registration.update().catch(()=>{});};check();window.addEventListener('focus',check);window.addEventListener('pageshow',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)kcApplyPendingUpdate();});document.addEventListener('focusout',()=>setTimeout(kcApplyPendingUpdate,250));
setInterval(()=>{if(!document.hidden)kcCheckAppVersion();},5*60*1000);
}).catch(error=>console.warn('Kinetic Crew service worker registration failed:',error));
}
window.addEventListener('load',()=>{kcCheckAppVersion();kcRegisterAutoUpdates();},{once:true});
const S={user:null,promotionalUpdatesEnabled:true,customAlertImageUrl:'',customAlertImagePath:'',view:'overview',aboutData:null,aboutDataLoading:false,aboutDataLoaded:false,aboutDataError:'',navOpen:'overview',selectedEvent:null,events:[],announcements:[],members:[],pendingMembers:[],rejectedMembers:[],pendingPoll:null,pendingPollBusy:false,pendingAlertIds:[],pendingAlertTimer:null,profileSetupRedirected:false,publicMembers:[],memberFavorites:[],blockedMemberIds:[],featureItems:{},pollScreen:'home',selectedPoll:null,pollSummary:[],pollRespondents:[],socialPosts:[],socialLikes:[],socialComments:[],onlineCrew:[],profileDashboard:null,profileAchievements:[],profileTab:'uploads',roster:null,rosterEvent:'',attendanceAudit:[],attendanceQuery:'',attendanceSection:'home',error:'',peopleQuery:'',eventsFilter:'all',eventQuery:'',editingEventId:null,sharedDraft:null,qrStream:null,qrScanning:false,qrProcessing:false,profileHistoryPinStatus:null,profileHistoryData:null,profileHistoryUnlocked:false,historyMembers:[],historyTargetId:'',historyLoading:false,profileHistoryPinSession:'',historyBiometricRegistered:false,historyBiometricReason:'',profileReminders:[]};
window.KC_SEARCH_API={
 snapshot:()=>({events:S.events||[],announcements:S.announcements||[],members:S.publicMembers||[],posts:S.socialPosts||[],role:S.user?.role||'member'}),
 load:async()=>{const jobs=[];if(!S.publicMembers?.length)jobs.push(rpc('crew_profile_directory',{}).then(({data,error})=>{if(error)throw error;S.publicMembers=Array.isArray(data)?data:[];}));if(!S.socialPosts?.length)jobs.push(loadSocialFeed());await Promise.all(jobs);},
 openEvent:id=>{S.selectedEvent=id;const item=(S.events||[]).find(event=>String(event.id)===String(id));S.eventMode=isRehearsalEvent(item)?'rehearsals':'events';go('event-detail');},
 openProfile:id=>{S.selectedProfileId=id;go('public-profile');},
 openPost:id=>{go('feed').then(()=>requestAnimationFrame(()=>document.querySelector('[data-social-post="'+CSS.escape(String(id))+'"]')?.scrollIntoView({behavior:'smooth',block:'center'})));},
 openView:view=>go(view),
 voice:{
  canManage:()=>admin(),
  getSnapshot:()=>({events:S.events||[],announcements:S.announcements||[],role:S.user?.role||'member',name:S.user?.name||'Crew Member',email:S.user?.email||''}),
  async createEvent(input){
   if(!admin())throw Error('Admin access required to create events.');
   const title=String(input?.title||'').trim(),startsAt=new Date(input?.starts_at||'');
   if(!title)throw Error('Please provide an event name.');
   if(Number.isNaN(startsAt.getTime()))throw Error('Please provide a valid event date and time.');
   const category=['Auditions','Performances','Workshops','Community','Rehearsals','Other'].includes(input?.category)?input.category:'Community';
   const payload={p_event_id:null,p_title:title,p_description:String(input?.description||''),p_location:String(input?.location||''),p_starts_at:startsAt.toISOString(),p_capacity:Math.max(1,Math.min(10000,Number(input?.capacity)||40)),p_category:category,p_cover_url:null,p_featured:false,p_ticket_email_enabled:false,p_redirect_url:null,p_show_countdown:true};
   const {data,error}=await rpc('crew_event_save',payload);if(error)throw error;
   const id=String(data.id),status=await rpc('crew_event_set_status',{p_event_id:id,p_status:'scheduled'});if(status.error)throw status.error;
   await refresh();return {id,title,message:data.message||'Event published.'};
  },
  async updateEvent(id,changes){
   if(!admin())throw Error('Admin access required to edit events.');
   const event=(S.events||[]).find(item=>String(item.id)===String(id));if(!event)throw Error('Event not found.');
   const merged={...event,...changes},startsAt=new Date(merged.starts_at||event.starts_at);
   if(Number.isNaN(startsAt.getTime()))throw Error('Please provide a valid event date and time.');
   const payload={p_event_id:event.id,p_title:String(merged.title||event.title),p_description:String(merged.description||''),p_location:String(merged.location||''),p_starts_at:startsAt.toISOString(),p_capacity:Math.max(1,Math.min(10000,Number(merged.capacity)||40)),p_category:['Auditions','Performances','Workshops','Community','Rehearsals','Other'].includes(merged.category)?merged.category:'Community',p_cover_url:merged.cover_url||null,p_featured:!!merged.featured,p_ticket_email_enabled:!!merged.ticket_email_enabled,p_redirect_url:merged.redirect_url||null,p_show_countdown:merged.show_countdown!==false};
   const {data,error}=await rpc('crew_event_save',payload);if(error)throw error;
   if(merged.event_status&&merged.event_status!==event.event_status){const status=await rpc('crew_event_set_status',{p_event_id:event.id,p_status:merged.event_status});if(status.error)throw status.error;}
   await refresh();return {id:String(event.id),title:payload.p_title,message:data.message||'Event updated.'};
  },
  async deleteEvent(id){
   if(!admin())throw Error('Admin access required to delete events.');
   const result=await api('delete-event','DELETE',{eventId:id});await refresh();return result;
  },
  async setEventStatus(id,status){
   if(!admin())throw Error('Admin access required to change event status.');
   const {data,error}=await rpc('crew_event_set_status',{p_event_id:id,p_status:status});if(error)throw error;
   await refresh();return data;
  },
  async publishAnnouncement(input){
   if(!admin())throw Error('Admin access required to publish crew announcements.');
   const title=String(input?.title||'').trim(),body=String(input?.body||'').trim(),audience=String(input?.audience||'all');
   if(!title||!body)throw Error('An announcement headline and message are required.');
   if(!['all','member','admin','super_admin'].includes(audience))throw Error('Choose a valid announcement audience.');
   const result=await api('announcements','POST',{title,body,audience});
   try{await window.kcPush?.send?.(title,body,audience);}catch(error){console.warn('Voice announcement saved; push delivery failed:',error);}
   await refresh();return result;
  },
  async registerForEvent(eventId){
   const event=(S.events||[]).find(item=>String(item.id)===String(eventId));if(!event)throw Error('Event not found.');
   if(event.registered)throw Error('You are already registered for this event.');
   const result=await api('register','POST',{eventId});
   await refresh();return result;
  },
  async getAttendance(eventId){
   if(!admin())throw Error('Admin access required to view the attendance roster.');
   return await api('attendance?eventId='+encodeURIComponent(eventId));
  },
  async setAttendance(eventId,memberId,status){
   if(!admin())throw Error('Admin access required to update attendance.');
   if(!['present','absent','not_attending'].includes(status))throw Error('Invalid attendance status.');
   const {data,error}=await rpc('crew_set_attendance_status',{p_event_id:eventId,p_member_id:memberId,p_status:status});if(error)throw error;
   const roster=await api('attendance?eventId='+encodeURIComponent(eventId));return {result:data,roster};
  },
  async finalizeAttendance(eventId){
   if(!admin())throw Error('Admin access required to finalize attendance.');
   const {data,error}=await rpc('crew_finalize_attendance',{p_event_id:eventId});if(error)throw error;return data;
  }
 },
 scanQr:async raw=>{const value=String(raw||'').trim();if(value.startsWith('KC_EVENT_ATTENDANCE:')){const parts=value.split(':'),eventId=parts[1],memberEmail=parts.slice(2).join(':');if(!eventId||!memberEmail)throw Error('This event QR code is incomplete.');if(admin()){const result=await api('qr-attendance','POST',{eventId,memberEmail});if(String(S.rosterEvent)===String(eventId))S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));notice(result.message||'Attendance marked from QR code.');return;}const found=S.events.find(x=>String(x.id)===String(eventId));if(found){S.selectedEvent=eventId;go('event-detail');return;}throw Error('This QR code belongs to an event that is not in your list.');}let url;try{url=new URL(value);}catch{throw Error('QR detected, but it is not a supported Kinetic Crew link.');}if(!['http:','https:'].includes(url.protocol))throw Error('This QR code is not a secure web link.');location.assign(url.href);}
};
if('scrollRestoration'in history)history.scrollRestoration='manual';try{history.replaceState({...history.state,kcApp:true,kcView:S.view,kcRoot:true},'',location.href);}catch{}
const PAGE_STATE_KEY='kinetic-crew-page-state-v1';
function readPageState(){try{const raw=localStorage.getItem(PAGE_STATE_KEY)||sessionStorage.getItem(PAGE_STATE_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
function savePageState(){if(!S.user)return;try{const state=JSON.stringify({view:S.view,selectedEvent:S.selectedEvent,selectedProfileId:S.selectedProfileId,navOpen:S.navOpen,scrollX:window.scrollX||0,scrollY:window.scrollY||0,userId:S.user.auth_id||S.user.id||''});localStorage.setItem(PAGE_STATE_KEY,state);sessionStorage.setItem(PAGE_STATE_KEY,state);}catch{}}
function restorePageScroll(state){if(!state)return;const restore=()=>window.scrollTo({left:Number(state.scrollX)||0,top:Number(state.scrollY)||0,behavior:'auto'});requestAnimationFrame(()=>requestAnimationFrame(restore));setTimeout(restore,180);}
window.addEventListener('pagehide',savePageState);

function withTimeout(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label||'Request timed out. Check your connection and retry.')),ms);})]).finally(()=>clearTimeout(timer));}
let kcAccessGuard={userId:'',checkedAt:0};
async function rpc(name,args){
 const userId=S.user?.auth_id||S.user?.id||'';
 const guardFresh=userId&&kcAccessGuard.userId===userId&&(Date.now()-kcAccessGuard.checkedAt)<30000;
 if(!guardFresh){
  const guard=await withTimeout(client.rpc('crew_assert_not_blocked',{}),18000,'The crew access check timed out. Check your connection and retry.');
  if(guard.error&&!/could not find the function|schema cache|PGRST202|404/i.test(guard.error.message||'')){
   if(/blocked|suspended/i.test(guard.error.message||'')){kcAccessGuard={userId:'',checkedAt:0};try{await auth.signOut({scope:'local'});}catch{}location.replace(window.kcPath('login.html'));throw Error(guard.error.message);}
   throw Error(guard.error.message||'Crew access check failed.');
  }
  kcAccessGuard={userId,checkedAt:Date.now()};
 }
 window.KC_CURRENT_ROLE=String(S.user?.role||'unknown');
 try{const result=await withTimeout(client.rpc(name,args),25000,'The crew service is taking too long. Your connection may be weak; retry when it stabilizes.');if(!result.error&&window.KCOfflineVault)window.KCOfflineVault.putRpc(name,args,result.data).catch(()=>{});return result;}catch(error){if(window.KCOfflineVault){const cached=await window.KCOfflineVault.getRpc(name,args);if(cached)return {data:cached.data,error:null,offline:true,updated:cached.updated};}throw error;}
}
const role=r=>({super_admin:'Super Admin',admin:'Admin',member:'Member',audition_participant:'Audition Participant'}[r]||'Member');
const memberDescriptor=m=>String(m?.crew_title||m?.occupation||role(m?.role)||'Member').trim();
const admin=()=>['admin','super_admin'].includes(String(S.user?.role||'')), superadmin=()=>S.user&&S.user.role==='super_admin';
window.KC_MORE_ADS_ADMIN={isAdmin:()=>!!admin(),isSuperAdmin:()=>!!superadmin()};
const profileIsComplete=u=>Boolean(u&&u.name&&u.username&&u.date_of_birth&&u.registration_number);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=s=>String(s||'KC').trim().split(/\s+/).map(p=>p[0]||'').join('').slice(0,2).toUpperCase()||'KC';
const dt=s=>{let d=new Date(s);return Number.isNaN(+d)?'Date TBA':d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
const ds=s=>{let d=new Date(s);return Number.isNaN(+d)?'TBA':d.toLocaleDateString([],{month:'short',day:'2-digit'});};
async function api(path,method='GET',body){
 if(!client)throw Error(window.KC_CONFIG_ERROR||'Supabase is not configured.');
 const url=new URL(path,location.href);
 const action=url.pathname.split('/').filter(Boolean).pop();
 const payload={...(body||{})};
 if(action==='attendance'&&url.searchParams.has('eventId'))payload.eventId=url.searchParams.get('eventId');
 if(action==='profile'&&method==='PATCH'){const extended=await rpc('crew_update_profile',{p_name:payload.name,p_username:payload.username||'',p_bio:payload.bio||'',p_avatar_url:payload.avatar_url||null,p_banner_url:payload.banner_url||null,p_date_of_birth:payload.date_of_birth||null,p_instagram_username:payload.instagram_username||'',p_profession:'',p_designation:'',p_registration_number:payload.registration_number||''});if(!extended.error)return extended.data;const message=extended.error.message||'';if(/could not find the function|schema cache|PGRST202/i.test(message)){const basic=await rpc('crew_update_profile',{p_name:payload.name});if(basic.error)throw Error(basic.error.message||'Profile update failed.');return {...(basic.data||{}),name:basic.data?.name||payload.name,bio:payload.bio||'',avatar_url:payload.avatar_url||S.user?.avatar_url||null,_profileLimited:true};}throw Error(message||'Profile update failed.');}
 const rpcMap={'qr-attendance':['crew_mark_qr_attendance',{p_event_id:payload.eventId,p_member_email:payload.memberEmail}],'finalize-attendance':['crew_finalize_attendance',{p_event_id:payload.eventId}],'delete-event':['crew_delete_event',{p_event_id:payload.eventId}]};
 if(rpcMap[action]){const {data,error}=await rpc(rpcMap[action][0],rpcMap[action][1]);if(error)throw Error(error.message||'Crew operation failed.');return data;}
 if(action==='attendance'&&method==='GET'){const {data,error}=await rpc('crew_attendance_roster',{p_event_id:payload.eventId});if(error)throw Error(error.message||'Attendance roster failed.');return data;}
 const {data,error}=await rpc('crew_api',{p_action:action,p_method:method,p_payload:payload});
 if(error)throw Error(error.message||error.details||'Crew service request failed.');
 return data;
}
const featureKeys=['leave','memories','auditions','polls','chat','expenses','achievements','rehearsals','leaderboard'];
const featureLabels={leave:'Leave requests',memories:'KC Memories',auditions:'Auditions',polls:'Polls & voting',chat:'Crew chat',expenses:'Crew expenses',achievements:'Crew achievements',rehearsals:'Rehearsals',leaderboard:'Leaderboard'};
const FEATURE_ALIASES={'leave request':'leave','leave requests':'leave','kc memories':'memories','audition portal':'auditions','polls & voting':'polls','crew chat':'chat','crew expenses':'expenses','crew achievements':'achievements','crew rehearsals':'rehearsals','rehearsal':'rehearsals','practice session':'rehearsals','practice sessions':'rehearsals'};
function normalizeFeatureKey(value,payload){
 const raw=String(value??payload?.feature??'').trim().toLowerCase();
 return FEATURE_ALIASES[raw]||raw.replace(/\s+/g,'_');
}
async function loadMemories(){
 const {data,error}=await rpc('crew_memories_list',{});
 if(error)throw error;
 const rows=Array.isArray(data)?data:(Array.isArray(data?.items)?data.items:[]);
 const memoryStoragePath=item=>{const d=item?.data&&typeof item.data==='object'?item.data:{};return String(d.storage_path||d.storagePath||d.file_path||d.media_path||d.photo_path||d.image_path||'').replace(/^[/]+/, '');};
 const paths=[...new Set(rows.map(memoryStoragePath).filter(Boolean))];
 const signedByPath=new Map();
 if(paths.length){
  const {data:signedRows,error:signedError}=await client.storage.from('crew-memories').createSignedUrls(paths,3600);
  if(signedError)console.warn('KC Memories image signing failed:',signedError);
  else (signedRows||[]).forEach(item=>{const url=item?.signedUrl||item?.signedURL||item?.signed_url;if(item?.path&&url)signedByPath.set(item.path,url);});
  for(const path of paths){if(signedByPath.has(path))continue;try{const {data:single,error:singleError}=await client.storage.from('crew-memories').createSignedUrl(path,3600);if(!singleError&&single?.signedUrl)signedByPath.set(path,single.signedUrl);}catch(signError){console.warn('KC Memories fallback signing failed:',signError);}}
 }
 S.featureItems.memories=await Promise.all(rows.map(async item=>{
  const itemData=item?.data&&typeof item.data==='object'?item.data:{};
  const storagePath=memoryStoragePath(item);
  const signedUrl=storagePath?signedByPath.get(storagePath)||'':'';
  const mediaUrl=signedUrl||itemData.signed_media_url||itemData.media_url||itemData.image_url||itemData.photo_url||itemData.image||itemData.photo||'';
  let social={likes:0,liked:false,comments:[]};
  try{const {data:socialData,error:socialError}=await rpc('crew_memory_social',{p_action:'summary',p_memory_id:item.id,p_body:null});if(!socialError&&socialData)social=socialData;}catch(e){console.warn('Memory reactions unavailable:',e);}
  return {...item,social,data:{...itemData,storage_path:storagePath,signed_media_url:mediaUrl}};
 }));
 return S.featureItems.memories;
}
async function featureApi(action,feature,payload){
 const operation=String(action||'').trim().toLowerCase(),cleanPayload=payload&&typeof payload==='object'?payload:{};
 const currentFeature=featureKeys.includes(S.view)?S.view:'';
 const requested=normalizeFeatureKey(String(feature||cleanPayload.feature||currentFeature||'').trim(),cleanPayload);
 if(operation!=='leaderboard'&&!requested)throw Error('Kinetic Crew could not identify which feature to open. Please return to the page and try again.');
 if(operation!=='leaderboard'&&!featureKeys.includes(requested))throw Error('Unsupported crew feature "'+requested+'" for action "'+operation+'". Please reload Kinetic Crew and try again.');
 const {data,error}=await rpc('crew_features',{p_action:operation,p_feature:operation==='leaderboard'?null:requested,p_payload:cleanPayload});
 if(error){const m=error.message||'Feature request failed.';if(/could not find the function|schema cache/i.test(m))throw Error('The crew feature service is not ready. Reload the app; if this continues, contact the Super Admin.');throw Error(m);}
 return data;
}
async function loadRehearsalItems(){
 const [itemsResult,registrationResult]=await Promise.all([
  featureApi('list','rehearsals',{}),
  rpc('crew_rehearsal_registration_summary',{})
 ]);
 const rows=Array.isArray(itemsResult)?itemsResult:(itemsResult?.data||[]);
 const registrations=registrationResult.error?[]:(Array.isArray(registrationResult.data)?registrationResult.data:[]);
 const byId=new Map(registrations.map(row=>[String(row.id),row]));
 return rows.map(item=>({...item,registered:byId.has(String(item.id)),registration_count:Number(byId.get(String(item.id))?.registration_count||0)}));
}
function notice(text){const t=$('#toast');if(!t){console.warn('Kinetic Crew toast container is missing:',text);return;}t.textContent=String(text??'');t.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.remove('show'),3000);}

function kcTypeToConfirmDialog({title='Confirm permanent removal',message='This action cannot be undone.',requiredText='DELETE',confirmText='Permanently remove',entityName='this member'}={}){
 return new Promise(resolve=>{
  const root=$('#modalRoot');if(!root){resolve(false);return;}
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;root.innerHTML='';document.body.classList.remove('kc-confirm-open');document.removeEventListener('keydown',onKey);resolve(value);};
  const onKey=event=>{if(event.key==='Escape'){event.preventDefault();finish(false);}if(event.key==='Enter'&&event.target?.id==='kcDeleteConfirmInput'){event.preventDefault();root.querySelector('[data-kc-delete-confirm]')?.click();}};
  document.body.classList.add('kc-confirm-open');document.addEventListener('keydown',onKey);
  root.innerHTML='<div class="modalback kc-confirm-backdrop" data-kc-confirm-backdrop><section class="modal kc-confirm-modal kc-confirm-delete" role="alertdialog" aria-modal="true" aria-labelledby="kcConfirmTitle" aria-describedby="kcConfirmMessage" tabindex="-1"><div class="kc-confirm-mark" aria-hidden="true">!</div><span class="kc-confirm-kicker">KINETIC CREW</span><h2 id="kcConfirmTitle">'+esc(title)+'</h2><p id="kcConfirmMessage">'+esc(message)+'</p><div class="kc-confirm-target">'+esc(entityName)+'</div><label class="kc-confirm-input-label" for="kcDeleteConfirmInput">Type <b>'+esc(requiredText)+'</b> to confirm</label><input id="kcDeleteConfirmInput" class="kc-confirm-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Type '+esc(requiredText)+'"><p class="kc-confirm-error" aria-live="polite"></p><div class="kc-confirm-actions"><button type="button" class="secondary" data-kc-confirm-cancel>Cancel</button><button type="button" class="kc-confirm-danger" data-kc-delete-confirm disabled>'+esc(confirmText)+'</button></div></section></div>';
  const input=root.querySelector('#kcDeleteConfirmInput'),ok=root.querySelector('[data-kc-delete-confirm]'),error=root.querySelector('.kc-confirm-error');
  input?.addEventListener('input',()=>{ok.disabled=input.value.trim().toUpperCase()!==requiredText;error.textContent='';});
  ok?.addEventListener('click',()=>{if(input.value.trim().toUpperCase()!==requiredText){error.textContent='Enter '+requiredText+' exactly to continue.';return;}finish(true);});
  root.querySelector('[data-kc-confirm-cancel]')?.addEventListener('click',()=>finish(false));
  root.querySelector('[data-kc-confirm-backdrop]')?.addEventListener('click',event=>{if(event.target===event.currentTarget)finish(false);});
  requestAnimationFrame(()=>input?.focus());
 });
}

function kcConfirmDialog({title='Are you sure?',message='This action cannot be undone.',confirmText='Confirm',cancelText='Cancel',danger=true}={}){
 return new Promise(resolve=>{
  const root=$('#modalRoot');if(!root){resolve(false);return;}
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;root.innerHTML='';document.body.classList.remove('kc-confirm-open');document.removeEventListener('keydown',onKey);resolve(value);};
  const onKey=event=>{if(event.key==='Escape'){event.preventDefault();finish(false);}};
  document.body.classList.add('kc-confirm-open');document.addEventListener('keydown',onKey);
  root.innerHTML='<div class="modalback kc-confirm-backdrop" data-kc-confirm-backdrop><section class="modal kc-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="kcConfirmTitle" aria-describedby="kcConfirmMessage" tabindex="-1"><div class="kc-confirm-mark" aria-hidden="true"><span>!</span></div><span class="kc-confirm-kicker">KINETIC CREW · CONFIRM ACTION</span><h2 id="kcConfirmTitle">'+esc(title)+'</h2><p id="kcConfirmMessage">'+esc(message)+'</p><div class="kc-confirm-actions"><button type="button" class="secondary kc-confirm-cancel" data-kc-confirm-cancel>'+esc(cancelText)+'</button><button type="button" class="'+(danger?'kc-confirm-danger':'primary')+'" data-kc-confirm-ok>'+esc(confirmText)+'</button></div></section></div>';
  root.querySelector('[data-kc-confirm-cancel]')?.addEventListener('click',()=>finish(false));
  root.querySelector('[data-kc-confirm-ok]')?.addEventListener('click',()=>finish(true));
  root.querySelector('[data-kc-confirm-backdrop]')?.addEventListener('click',event=>{if(event.target===event.currentTarget)finish(false);});
  root.querySelector('.kc-confirm-modal')?.focus();
 });
}


window.kcConfirmDialog=kcConfirmDialog;

/* Multi-account menu: store account identifiers only; never persist passwords or refresh tokens. */
const KC_ACCOUNT_LIST_KEY='kc_saved_account_emails_v1';
function kcRememberSignedInAccount(user){
 if(!user?.email)return;
 try{
  const list=JSON.parse(localStorage.getItem(KC_ACCOUNT_LIST_KEY)||'[]');
  const email=String(user.email).trim().toLowerCase();
  const next=[email,...list.filter(item=>String(item).toLowerCase()!==email)].slice(0,8);
  localStorage.setItem(KC_ACCOUNT_LIST_KEY,JSON.stringify(next));
 }catch(error){console.warn('Could not save account list:',error);}
}
function kcOpenAccountSwitcher(){
 const root=$('#modalRoot');if(!root||!S.user)return;
 let accounts=[];
 try{const parsed=JSON.parse(localStorage.getItem(KC_ACCOUNT_LIST_KEY)||'[]');accounts=Array.isArray(parsed)?parsed:[];}catch{}
 const current=String(S.user.email||'').trim().toLowerCase();
 const valid=accounts.map(value=>String(value||'').trim().toLowerCase()).filter(email=>email.includes('@')&&email.split('@')[1]?.includes('.'));
 const rows=[...new Set([current,...valid].filter(Boolean))];
 localStorage.setItem(KC_ACCOUNT_LIST_KEY,JSON.stringify(rows));
 root.innerHTML='<div class="modalback" id="kcAccountBackdrop"><section class="modal kc-account-modal" role="dialog" aria-modal="true" aria-labelledby="kcAccountTitle"><button type="button" class="icon-button" id="kcAccountClose" aria-label="Close">×</button><span class="kc-confirm-kicker">KINETIC CREW / ACCOUNTS</span><h2 id="kcAccountTitle">Switch profile</h2><p class="hint">Choose an account or add another crew account. For security, enter its password when switching.</p><div class="kc-account-list">'+rows.map(email=>'<div class="kc-account-entry"><button type="button" class="kc-account-row" data-kc-account-email="'+esc(email)+'"><span class="kc-account-avatar">'+esc(initials(email.split('@')[0]))+'</span><span><b>'+esc(email===current?(S.user.name||email):email)+'</b><small>'+esc(email)+'</small></span><i>'+(email===current?'CURRENT':'↗')+'</i></button>'+(email!==current?'<button type="button" class="kc-account-remove" data-kc-remove-account="'+esc(email)+'" aria-label="Remove '+esc(email)+' from saved profiles" title="Remove saved profile">Remove</button>':'')+'</div>').join('')+'</div><button type="button" class="primary full" id="kcAddAccount">＋ Add profile</button><form id="kcAccountLogin" class="kc-account-login" hidden><label class="field">Email address<input name="email" type="email" autocomplete="username" required></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit" class="primary full">Continue to profile →</button><button type="button" class="outline full" id="kcAccountCancel">Cancel</button><p class="hint" id="kcAccountError" role="alert"></p></form></section></div>';
 const close=()=>{root.innerHTML='';};
 const form=$('#kcAccountLogin'),emailInput=form?.elements.namedItem('email');
 const showLogin=email=>{form.hidden=false;emailInput.value=email||'';emailInput.readOnly=!!email;form.elements.namedItem('password').value='';form.querySelector('input[type="password"]')?.focus();};
 $('#kcAccountClose')?.addEventListener('click',close);
 $('#kcAccountBackdrop')?.addEventListener('click',event=>{if(event.target.id==='kcAccountBackdrop')close();});
 root.querySelectorAll('[data-kc-remove-account]').forEach(button=>button.addEventListener('click',async event=>{
  event.preventDefault();event.stopPropagation();
  const email=String(button.dataset.kcRemoveAccount||'').trim().toLowerCase();
  if(!email||email===current)return;
  if(!await kcConfirmDialog({title:'Remove saved profile?',message:'Remove '+email+' from saved profiles on this device? The actual Kinetic Crew account will not be deleted.',confirmText:'Remove profile',danger:true}))return;
  const saved=rows.filter(item=>item!==email);
  try{localStorage.setItem(KC_ACCOUNT_LIST_KEY,JSON.stringify(saved));}catch(error){console.warn('Could not remove saved account:',error);}
  kcOpenAccountSwitcher();
 }));
 root.querySelectorAll('[data-kc-account-email]').forEach(button=>button.addEventListener('click',()=>{
  const email=button.dataset.kcAccountEmail;
  if(email===current){close();go('profile');return;}
  showLogin(email);
 }));
 $('#kcAddAccount')?.addEventListener('click',()=>showLogin(''));
 $('#kcAccountCancel')?.addEventListener('click',()=>{form.hidden=true;});
 form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=form.querySelector('button[type="submit"]'),errorNode=$('#kcAccountError');
  const email=String(emailInput.value||'').trim().toLowerCase(),password=String(form.elements.namedItem('password').value||'');
  if(!email||!password)return;
  submit.disabled=true;submit.textContent='Signing in…';errorNode.textContent='';
  try{
   const result=await auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   kcRememberSignedInAccount(result.data?.user||{email});
   close();S.profileDashboard=null;S.profileSocial=null;
   await refresh();
   notice('Switched to '+(S.user?.name||email)+'.');
  }catch(error){errorNode.textContent=error.message||'Could not sign in to this profile.';}
  finally{if(submit.isConnected){submit.disabled=false;submit.textContent='Continue to profile →';}}
 });
}
let kcProfileLongPressTimer=null,kcProfileLongPressFired=false;
document.addEventListener('pointerdown',event=>{
 const profile=event.target.closest('.sidebottom .profile');
 if(!profile||event.target.closest('#logout'))return;
 kcProfileLongPressFired=false;
 clearTimeout(kcProfileLongPressTimer);
 kcProfileLongPressTimer=setTimeout(()=>{kcProfileLongPressFired=true;kcOpenAccountSwitcher();},520);
},{passive:true});
['pointerup','pointercancel','pointerleave'].forEach(type=>document.addEventListener(type,()=>clearTimeout(kcProfileLongPressTimer),{passive:true}));
document.addEventListener('contextmenu',event=>{if(event.target.closest('.sidebottom .profile'))event.preventDefault();});
document.addEventListener('click',event=>{
 if(kcProfileLongPressFired&&event.target.closest('.sidebottom .profile')){event.preventDefault();event.stopImmediatePropagation();kcProfileLongPressFired=false;}
});
/* The More menu's My Profile shortcut also supports the same long-press account switcher. */
let kcMoreProfilePressTimer=null,kcMoreProfilePressFired=false,kcMoreProfilePressPoint=null;
document.addEventListener('pointerdown',event=>{
 const target=event.target.closest('.kc-more-reference-others-grid .kc-more-other[data-view="profile"]');
 if(!target)return;
 kcMoreProfilePressFired=false;
 kcMoreProfilePressPoint={x:event.clientX,y:event.clientY};
 clearTimeout(kcMoreProfilePressTimer);
 kcMoreProfilePressTimer=setTimeout(()=>{
  kcMoreProfilePressFired=true;
  kcOpenAccountSwitcher();
 },520);
},{passive:true});
document.addEventListener('pointermove',event=>{
 if(!kcMoreProfilePressPoint)return;
 if(Math.hypot(event.clientX-kcMoreProfilePressPoint.x,event.clientY-kcMoreProfilePressPoint.y)>12){
  clearTimeout(kcMoreProfilePressTimer);
  kcMoreProfilePressPoint=null;
 }
},{passive:true});
['pointerup','pointercancel'].forEach(type=>document.addEventListener(type,()=>{
 clearTimeout(kcMoreProfilePressTimer);
 kcMoreProfilePressPoint=null;
},{passive:true}));
document.addEventListener('contextmenu',event=>{
 if(event.target.closest('.kc-more-reference-others-grid .kc-more-other[data-view="profile"]'))event.preventDefault();
});
document.addEventListener('click',event=>{
 if(kcMoreProfilePressFired&&event.target.closest('.kc-more-reference-others-grid .kc-more-other[data-view="profile"]')){
  event.preventDefault();
  event.stopImmediatePropagation();
  kcMoreProfilePressFired=false;
 }
});

function cacheKey(userId){return 'kc-bootstrap-v2:'+userId;}
function paintUser(){if(!S.user)return;const name=$('#profileName'),userRole=$('#profileRole'),avatar=$('#avatar'),topAvatar=$('#topAvatar');if(name)name.textContent=S.user.name||S.user.email||'Crew Member';if(userRole)userRole.textContent=role(S.user.role);if(avatar)avatar.innerHTML=avatarMarkup(S.user);if(topAvatar)topAvatar.innerHTML=avatarMarkup(S.user,'small');}
async function refresh(){
 // The authenticated bootstrap is the only data dependency required to open the app.
 // Load it first, render immediately, and hydrate optional sections in the background.
 const d=await api('bootstrap');
 S.user=d.user;kcRememberSignedInAccount(S.user);S.events=d.events||[];S.announcements=d.announcements||[];S.members=d.members||[];try{const lockStatus=await rpc('crew_profile_history_pin_status',{});if(!lockStatus.error)S.profileHistoryPinStatus=lockStatus.data||{};}catch(lockError){console.warn('Profile History PIN status could not be checked:',lockError);}
 try{const access=await rpc('crew_access_status',{});if(!access.error&&access.data?.role)S.user.role=access.data.role;}catch(error){console.warn('Crew role could not be refreshed:',error);}
 S.offline=false;S.error='';
 paintUser();paint();
 // Resolve authoritative profile metadata before enforcing profile completion.
 // Bootstrap may omit extended profile fields; redirecting before this lookup
 // incorrectly sends users to Profile after a browser refresh.
 let profileMetadataVerified=false;
 try{
  const profile=await rpc('crew_profile_social',{p_auth_id:S.user.auth_id||S.user.id});
  if(!profile.error){
   if(profile.data?.profile&&S.user)S.user={...S.user,...profile.data.profile};
   S.profileCompletionPending=!profileIsComplete(S.user);
   profileMetadataVerified=true;
  }
 }catch(error){console.warn('Extended profile details could not be verified; preserving the current page:',error);}
 if(!profileMetadataVerified)S.profileCompletionPending=false;
 paintUser();
 if(S.profileCompletionPending&&S.view!=='profile')await go('profile');
 else if(S.view==='profile'||S.view==='overview')paint();
 try{
  const sessionResult=await auth.getSession();
  const cacheUserId=sessionResult?.data?.session?.user?.id||S.user.auth_id||S.user.id;
  if(cacheUserId)localStorage.setItem(cacheKey(cacheUserId),JSON.stringify({savedAt:Date.now(),user:S.user,events:S.events,announcements:S.announcements,members:S.members,featureItems:S.featureItems,profileDashboard:S.profileDashboard,profileStats:S.profileStats,profileAchievements:S.profileAchievements,roster:S.roster}));
 }catch(error){console.warn('Could not refresh the local crew cache:',error);}
 const keepX=window.scrollX||0,keepY=window.scrollY||0;
 const hydrate=async()=>{
  const jobs=await Promise.allSettled([
   rpc('crew_get_app_settings',{}),
   rpc('crew_get_promotion_preference',{}),
   rpc('crew_event_metadata',{}),
   rpc('crew_event_statuses',{}),
   loadRehearsalItems(),
   featureApi('list','chat',{}),
   featureApi('list','polls',{}),
   loadGlobalDeletedNotifications()
  ]);
  const cfg=jobs[0].status==='fulfilled'?jobs[0].value:null;
  const promoPref=jobs[1].status==='fulfilled'?jobs[1].value:null;
  if(promoPref&&!promoPref.error)S.promotionalUpdatesEnabled=promoPref.data!==false;
  const metaResult=jobs[2].status==='fulfilled'?jobs[2].value:null;
  const statusResult=jobs[3].status==='fulfilled'?jobs[3].value:null;
  const eventRows=value=>Array.isArray(value)?value:(Array.isArray(value?.data)?value.data:(Array.isArray(value?.events)?value.events:[]));
  const meta=[...eventRows(metaResult?.data),...eventRows(statusResult?.data)];
  if(cfg&&!cfg.error)S.appSettings=cfg.data||{};
  const eventMeta=new Map(meta.map(item=>[String(item.id),item]));
  if(meta.length)S.events=(S.events||[]).map(event=>{const extra=eventMeta.get(String(event.id))||{};return {...event,...extra,show_countdown:typeof extra.show_countdown==='boolean'?extra.show_countdown:(typeof event.show_countdown==='boolean'?event.show_countdown:true)};});
  const featureNames=['rehearsals','chat','polls'];
  for(let i=0;i<featureNames.length;i++){
   const result=jobs[i+4];
   if(result.status!=='fulfilled')continue;
   const value=result.value;
   S.featureItems[featureNames[i]]=Array.isArray(value)?value:(value?.data||[]);
  }
  if(S.user){paintUser();paint();requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({left:keepX,top:keepY,behavior:'auto'})));}
 };
 hydrate().catch(error=>console.warn('Optional crew data could not be refreshed:',error));
}
function restoreOffline(user){
 const id=user?.id||user?.auth_id;if(!id)return false;
 try{
  const cached=JSON.parse(localStorage.getItem(cacheKey(id))||'null');
  if(!cached?.user)return false;
  S.user=cached.user;S.events=cached.events||[];S.announcements=cached.announcements||[];S.members=cached.members||[];S.featureItems=cached.featureItems||{};S.profileDashboard=cached.profileDashboard||null;S.profileStats=cached.profileStats||{};S.profileAchievements=cached.profileAchievements||[];S.roster=cached.roster||null;
  S.offline=true;S.error='Offline mode: showing your last saved crew data. Changes and live updates need an internet connection.';
  paintUser();paint();return true;
 }catch{return false;}
}
function button(label,view){return '<button class="primary" data-view="'+view+'">'+label+'</button>';}
function editorialTitle(title){const value=String(title??'');if(/<[^>]+>/.test(value))return value;const split=value.lastIndexOf(' ');return split<0?'<em>'+value+'</em>':value.slice(0,split+1)+'<em>'+value.slice(split+1)+'</em>';}
function welcome(title,sub,action=''){return '<div class="welcome"><div><div class="eyebrow"><span class="eyedot"></span>'+role(S.user.role).toUpperCase()+' SPACE <span class="muted">/</span> KINETIC CREW</div><h1>'+editorialTitle(title)+'</h1><p>'+sub+'</p></div>'+action+'</div>';}
function section(title,sub,act=''){return '<div class="sectionhead"><div><h2>'+title+'</h2><p>'+sub+'</p></div>'+act+'</div>';}
function empty(title,sub){return '<div class="empty"><div class="emptyicon">✳</div><b>'+title+'</b><p>'+sub+'</p></div>';}
function stat(title,value,foot,ico){return '<div class="stat"><div class="statlabel"><span>'+title+'</span><span>'+ico+'</span></div><b class="statvalue">'+value+'</b><small>'+foot+'</small></div>';}

document.addEventListener('input',event=>{
 if(event.target.id==='managedMemberSearch'){
  S.managedMemberQuery=event.target.value;
  const start=event.target.selectionStart;
  paint();
  const next=document.getElementById('managedMemberSearch');if(next){next.focus();next.setSelectionRange(start,start);}
  return;
 }
 const search=event.target.closest('.memory-member-search');
 if(search){
  const q=search.value.trim().toLowerCase(),picker=search.closest('.memory-recipient-picker');
  let visible=0;
  picker?.querySelectorAll('.memory-recipient-option').forEach(row=>{
   const haystack=row.dataset.memberSearch||row.textContent.toLowerCase();
   row.hidden=!haystack.includes(q);
   if(!row.hidden)visible++;
  });
  const list=picker?.querySelector('.memory-recipient-list');
  let empty=list?.querySelector('.memory-search-empty');
  if(!empty&&list){empty=document.createElement('p');empty.className='hint memory-search-empty';empty.textContent='No registered members match your search.';list.append(empty);}
  if(empty)empty.hidden=visible!==0;
 }
});
document.addEventListener('click',event=>{
 const form=event.target.closest('[data-feature-form="memories"]');if(!form)return;
 if(event.target.closest('[data-memory-add-media]')){const options=form.querySelector('.memory-media-options');if(options)options.hidden=!options.hidden;return;}
 if(event.target.closest('[data-memory-pick-photo]')){form.querySelector('input[name="memory_photo"]')?.click();return;}
 if(event.target.closest('[data-memory-add-link]')){const entry=form.querySelector('.memory-link-entry');if(entry)entry.hidden=!entry.hidden;return;}
 if(event.target.closest('[data-memory-confirm-link]')){
  const input=form.querySelector('input[name="media_url"]'),file=form.querySelector('input[name="memory_photo"]'),value=String(input?.value||'').trim();
  try{const url=new URL(value);if(url.protocol!=='https:')throw Error();if(file)file.value='';showMemoryMediaPreview(form,url.href,'Shared image link');}
  catch{notice('Enter a valid HTTPS image link.');}return;
 }
 if(event.target.closest('[data-memory-remove-media]')){clearMemoryMediaPreview(form);return;}
});
function showMemoryMediaPreview(form,src,label){
 const preview=form.querySelector('.memory-media-preview'),image=preview?.querySelector('img'),caption=preview?.querySelector('[data-memory-preview-label]');
 if(!preview||!image)return;image.src=src;if(caption)caption.textContent=label||'Attached photo';preview.hidden=false;
 const options=form.querySelector('.memory-media-options');if(options)options.hidden=true;
 const linkEntry=form.querySelector('.memory-link-entry');if(linkEntry)linkEntry.hidden=true;
}
function clearMemoryMediaPreview(form){
 const preview=form.querySelector('.memory-media-preview'),image=preview?.querySelector('img'),file=form.querySelector('input[name="memory_photo"]'),url=form.querySelector('input[name="media_url"]');
 if(image){if(image.dataset.objectUrl)URL.revokeObjectURL(image.dataset.objectUrl);image.removeAttribute('src');delete image.dataset.objectUrl;}
 if(file)file.value='';if(url)url.value='';if(preview)preview.hidden=true;
 const options=form.querySelector('.memory-media-options');if(options)options.hidden=true;
}
document.addEventListener('change',event=>{
 const form=event.target.closest('[data-feature-form="memories"]');
 if(!form||!event.target.matches('input[name="memory_photo"]'))return;
 const file=event.target.files?.[0];if(!file)return;
 const urlField=form.querySelector('input[name="media_url"]');if(urlField)urlField.value='';
 if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){notice('Choose a JPG, PNG, WEBP or GIF photo.');event.target.value='';return;}
 if(file.size>15*1024*1024){notice('Photo must be 15 MB or smaller.');event.target.value='';return;}
 const image=form.querySelector('.memory-media-preview img');
 if(image?.dataset.objectUrl)URL.revokeObjectURL(image.dataset.objectUrl);
 const url=URL.createObjectURL(file);if(image)image.dataset.objectUrl=url;showMemoryMediaPreview(form,url,file.name);
});
document.addEventListener('submit',async event=>{
 const memoryForm=event.target.closest('[data-memory-comment]');
 if(memoryForm){event.preventDefault();const input=memoryForm.querySelector('input[name="comment"]'),body=String(input?.value||'').trim();if(!body)return;const id=memoryForm.dataset.memoryComment;const submit=memoryForm.querySelector('button');if(submit)submit.disabled=true;await action(async()=>{const {data,error}=await rpc('crew_memory_social',{p_action:'comment',p_memory_id:id,p_body:body});if(error)throw error;const item=(S.featureItems.memories||[]).find(x=>String(x.id)===String(id));if(item)item.social={...(item.social||{}),...(data||{})};paint();notice('Comment posted.');});return;}
 const form=event.target.closest('[data-designation-form]');
 if(!form)return;
 event.preventDefault();
 if(!superadmin()){notice('Only the Super Admin can define crew roles.');return;}
 const authId=form.dataset.designationForm,input=form.elements.namedItem('designation'),button=form.querySelector('button[type="submit"]');
 if(!authId||!input)return;
 button.disabled=true;
 try{
  const {data,error}=await rpc('crew_set_member_designation',{p_auth_id:authId,p_designation:input.value.trim()});
  if(error)throw error;
  if(data?.ok===false)throw Error(data.message||'Could not save this crew role.');
  const member=(S.members||[]).find(m=>String(m.auth_id)===String(authId));
  if(member)member.crew_title=data.designation||'';
  notice(data.designation?'Crew role defined.':'Custom crew role cleared.');
  paint();
 }catch(error){notice(error.message||'Could not save this crew role.');}
 finally{if(button.isConnected)button.disabled=false;}
});
document.addEventListener('change',async event=>{
 const select=event.target.closest('[data-role-change]');
 if(!select)return;
 if(!superadmin()){notice('Only the Super Admin can change crew roles.');select.value=select.dataset.currentRole||'member';return;}
 const authId=select.dataset.roleChange,nextRole=select.value,currentRole=select.dataset.currentRole||'member';
 if(!authId||!['member','admin'].includes(nextRole)||nextRole===currentRole)return;
 const member=(S.members||[]).find(m=>String(m.auth_id)===String(authId));
 if(!member||member.role==='super_admin'||String(authId)===String(S.user?.auth_id)){notice('This account role cannot be changed.');select.value=currentRole;return;}
 if(!await kcConfirmDialog({title:'Change crew role?',message:'Change '+(member.name||'this member')+' role from '+currentRole.replace('_',' ')+' to '+nextRole.replace('_',' ')+'?',confirmText:'Change role',danger:false})){select.value=currentRole;return;}
 select.disabled=true;
 try{
  const {data,error}=await rpc('crew_set_member_role',{p_auth_id:authId,p_role:nextRole});
  if(error)throw error;
  if(data?.ok===false)throw Error(data?.message||'Role change was not accepted.');
  member.role=nextRole;select.dataset.currentRole=nextRole;
  (S.publicMembers||[]).forEach(person=>{if(String(person.auth_id)===String(authId))person.role=nextRole;});
  notice((member.name||'Member')+' is now '+nextRole+'.');
  paint();
  rpc('crew_profile_directory',{}).then(({data,error})=>{if(!error&&Array.isArray(data)){S.publicMembers=data;if(S.view==='people')paint();}}).catch(error=>console.warn('Member directory role refresh failed:',error));
 }catch(error){select.value=currentRole;notice(error.message||'Could not change this member role.');}
 finally{if(select.isConnected)select.disabled=false;}
});
document.addEventListener('error',event=>{
 const img=event.target;
 if(!(img instanceof HTMLImageElement))return;
 if(img.classList.contains('brand-logo')){
  if(img.dataset.kcFallback!=='yes'){img.dataset.kcFallback='yes';img.src=window.kcPath('kinetic-crew-logo.svg');}
  else img.style.visibility='hidden';
  return;
 }
 if(img.classList.contains('avatar-photo')||img.classList.contains('profile-photo')){
  const fallback=document.createElement('span');
  if(img.classList.contains('avatar-photo')){fallback.className='avatar-fallback '+[...img.classList].filter(x=>x!=='avatar-photo').join(' ');fallback.textContent=img.dataset.fallback||'KC';}
  else{fallback.className='profile-photo profile-photo-placeholder';fallback.textContent=initials(S.user?.name||S.user?.email);}
  img.replaceWith(fallback);
 }
},true);
function brandMarkMarkup(extra=''){return '<img class="kc-brand-mark '+extra+'" src="'+window.kcPath('kinetic-crew-logo.svg')+'" alt="Kinetic Crew" loading="eager" decoding="async">';}
function avatarMarkup(user,size='') {const src=user?.avatar_url;return src?'<img class="avatar-photo '+size+'" data-fallback="'+esc(initials(user?.name||user?.email))+'" src="'+esc(src)+'" alt="'+esc(user.name||'Crew member')+'" loading="lazy" decoding="async">':'<span class="avatar-fallback '+size+'">'+esc(initials(user?.name||user?.email))+'</span>';}
function profileCover(url){return url?' style="background-image:url(&quot;'+esc(url)+'&quot;)':'';}

function profileCardBackMarkup(user,authId,username){
 const profileId=String(authId||'');
 const handle=String(username||'crew-member').replace(/^@/,'');
 const qrTarget=new URL(window.kcPath('connect.html'),location.origin);
 if(profileId)qrTarget.searchParams.set('id',profileId);
 qrTarget.searchParams.set('u',handle);
 qrTarget.searchParams.set('n',String(user?.name||'Kinetic Crew Member'));
 if(user?.avatar_url)qrTarget.searchParams.set('p',String(user.avatar_url));
 const instagram='https://www.instagram.com/'+encodeURIComponent(String(user?.instagram_username||handle).replace(/^@/,''))+'/';
 const displayId='KC-'+(profileId.replace(/[^a-zA-Z0-9]/g,'').slice(-8)||handle.slice(0,8)).toUpperCase();
 const displayRole=String(user?.role==='super_admin'?'FOUNDER / SUPER ADMIN':user?.crew_title||user?.occupation||role(user?.role).toUpperCase()).toUpperCase();
 return '<section class="kc-profile-card-back" aria-label="Kinetic Crew digital profile ticket">'+
 '<div class="kc-ticket-heading"><span>MY PROFILE</span><b>KINETIC CREW</b></div>'+
 '<div class="kc-ticket-stub"><div class="kc-ticket-id-label">MEMBER ID</div><strong>'+esc(displayId)+'</strong><div class="kc-ticket-perforation"><i></i></div>'+
 '<div class="kc-ticket-qr-wrap"><div class="kc-profile-qr" data-profile-qr data-qr-url="'+esc(qrTarget.href)+'" aria-label="QR code to open this Kinetic Crew profile"></div></div></div>'+
 '<div class="kc-ticket-details"><div class="kc-ticket-detail"><strong>'+esc(user?.name||'Kinetic Crew Member')+'</strong><span>NAME</span></div><div class="kc-ticket-detail"><strong>@'+esc(handle)+'</strong><span>USERNAME</span></div><div class="kc-ticket-detail kc-ticket-role"><strong>'+esc(displayRole)+'</strong><span>CREW ROLE</span></div></div>'+
 '<div class="kc-ticket-footer"><span>SCAN TO CONNECT</span><a class="kc-card-instagram-link" href="'+esc(instagram)+'" target="_blank" rel="noopener noreferrer">Instagram ↗</a></div><div class="kc-profile-flip-return-hint">↻ &nbsp; DOUBLE TAP TO RETURN</div></section>';
}
let kcQrLibraryPromise=null;
function ensureKcQrLibrary(){
 if(window.QRCode)return Promise.resolve(window.QRCode);
 if(kcQrLibraryPromise)return kcQrLibraryPromise;
 kcQrLibraryPromise=new Promise((resolve,reject)=>{
  const sources=['https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js','https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js'];
  let index=0;
  const load=()=>{if(window.QRCode)return resolve(window.QRCode);if(index>=sources.length){kcQrLibraryPromise=null;return reject(new Error('QR library could not be loaded'));}const script=document.createElement('script');script.src=sources[index++];script.async=true;script.onload=()=>window.QRCode?resolve(window.QRCode):load();script.onerror=load;document.head.appendChild(script);};
  load();
 });
 return kcQrLibraryPromise;
}
async function renderProfileQrCards(){
 const nodes=[...document.querySelectorAll('[data-profile-qr]:not([data-qr-ready])')];if(!nodes.length)return;
 try{const QR=await ensureKcQrLibrary();nodes.forEach(node=>{if(!node.isConnected||node.dataset.qrReady)return;try{node.innerHTML='';new QR(node,{text:node.dataset.qrUrl,width:220,height:220,colorDark:'#111316',colorLight:'#ffffff',correctLevel:QR.CorrectLevel.M});node.dataset.qrReady='yes';}catch(error){node.textContent='QR unavailable';console.warn('Profile QR could not render:',error);}});}
 catch(error){nodes.forEach(node=>{node.dataset.qrReady='';node.textContent='QR temporarily unavailable';});console.warn('Kinetic Crew QR library unavailable:',error);}
}
function profilePage(){
const u=S.user||{},founder=superadmin(),photo=u.avatar_url||'';
const job=u.crew_title||u.occupation||u.job_title||(founder?'Founder & President':'Kinetic Crew Member');
const username=u.username||String(u.email||'crew-member').split('@')[0];
const dash=S.profileDashboard||{},dashboardUploads=Array.isArray(dash.posts)?dash.posts:[],feedUploads=(S.socialPosts||[]).filter(p=>String(p.author_id)===String(u.auth_id||u.id)),uploads=[...new Map([...dashboardUploads,...feedUploads].filter(p=>p&&p.id).map(p=>[String(p.id),p])).values()].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,30),registrations=Array.isArray(dash.registrations)?dash.registrations:[];
const stats=S.profileStats||{},followers=Number(stats.followers_count??S.profileSocial?.followers_count??dash.followers_count??0),following=Number(stats.following_count??S.profileSocial?.following_count??dash.following_count??0);
const streak=Number(stats.login_streak??dash.login_streak??0),bestStreak=Number(stats.longest_login_streak??dash.longest_login_streak??0),uploadsCount=Number(stats.posts_count??dash.posts_count??uploads.length),registeredCount=Number(stats.registered_count??dash.registered_count??registrations.length),achievements=(S.profileAchievements||[]).filter(item=>{const data=item.data||{},target=String(data.member_id||data.auth_id||data.user_id||data.recipient_auth_id||'');return !target||target===String(u.auth_id||u.id);}),tab=S.profileTab||'uploads';
const firstFlipIntro=false;
const showFlipHint=(()=>{try{return localStorage.getItem('kc_profile_flip_hint_seen_v1')!=='1';}catch{return true;}})();
const profileComplete=profileIsComplete(u);
const editForm='<section class="kc-profile-editor kc-profile-edit-panel" id="profileEditor" '+(profileComplete?'hidden':'')+'><div class="kc-profile-edit-panel-head"><div><span>PROFILE COMPLETION</span><h2>'+(profileComplete?'Edit your profile':'Complete your profile')+'</h2><p class="hint">Short setup. Your DOB is also your birthday date for crew recognition.</p></div>'+(profileComplete?'<button type="button" class="kc-profile-editor-close" data-profile-editor-close aria-label="Close editor">×</button>':'')+'</div><form id="profileForm" class="kc-profile-form kc-profile-wizard">'+
'<details open class="kc-profile-step"><summary>01 · Personal details</summary><label class="field">Full name<input name="name" maxlength="100" required value="'+esc(u.name||'')+'"></label><label class="field">College registration number<input name="registration_number" maxlength="30" minlength="4" pattern="[A-Za-z0-9/-]{4,30}" autocomplete="off" required value="'+esc(u.registration_number||'')+'" placeholder="Enter your VIT-AP registration number"></label><p class="hint">Required · Use your official college registration number. It must be unique to your crew account.</p><label class="field">Date of birth / Birthday<input name="date_of_birth" type="date" required max="'+new Date().toISOString().slice(0,10)+'" value="'+esc(u.date_of_birth||'')+'"></label><div class="kc-profile-upload-row"><div class="kc-profile-photo-upload-copy"><b>Profile photo</b><small>'+(u.avatar_url?'Your current profile photo is saved.':'Profile photo is optional. You can add one later.')+'</small></div><button type="button" class="kc-profile-photo-upload-button" data-profile-photo-pick>'+(u.avatar_url?'Change photo':'＋ Upload photo')+'</button><input id="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><p class="hint">JPG, PNG or WebP · Maximum 8 MB. You can crop and position the image before saving.</p></details>'+
'<details class="kc-profile-step"><summary>02 · Social profile</summary><label class="field">Instagram username<input name="instagram_username" maxlength="30" pattern="[A-Za-z0-9._]{1,30}" value="'+esc(u.instagram_username||'')+'" placeholder="your_instagram"></label><p class="hint">Enter the username only; do not include @.</p></details>'+
'<details class="kc-profile-step"><summary>03 · About you</summary><label class="field">About you<textarea name="bio" maxlength="500" rows="2">'+esc(u.bio||'')+'</textarea></label><label class="field">Kinetic Crew username<input name="username" id="profileUsername" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="'+esc(u.username||'')+'" placeholder="your_username" required></label><label class="field">Email address<input value="'+esc(u.email||'')+'" disabled></label></details>'+
'<button class="primary full" type="submit">Save profile & continue</button></form></section>';
const uploadRows=uploads.length?uploads.map(p=>socialPostCard(p)).join(''):'<div class="kc-profile-activity-empty"><b>No posts yet</b><span>Your Kinetic Gram posts and shared reels will appear here.</span><button type="button" data-view="feed">Share your first moment ↗</button></div>';
const registrationRows=registrations.length?registrations.map(r=>'<article class="kc-profile-activity-row"><div><b>'+esc(r.title||'Crew event')+'</b><small>'+esc(r.starts_at?new Date(r.starts_at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Date to be announced')+' · '+esc(r.location||'Venue TBA')+'</small></div><span class="kc-profile-registration-tag">REGISTERED</span></article>').join(''):'<div class="kc-profile-activity-empty"><b>No event registrations yet</b><span>Events you register for will be listed here.</span><button type="button" data-view="events">Explore events ↗</button></div>';
const activity='<section class="kc-profile-activity" aria-label="Your Kinetic Crew activity">'+
'<div class="kc-profile-metrics"><button type="button" data-profile-connections="followers" data-profile-owner="'+esc(u.auth_id||u.id)+'"><b>'+followers+'</b><span>FOLLOWERS</span></button><button type="button" data-profile-connections="following" data-profile-owner="'+esc(u.auth_id||u.id)+'"><b>'+following+'</b><span>FOLLOWING</span></button><div class="kc-profile-streak-metric"><b>'+streak+' <small>DAY'+(streak===1?'':'S')+'</small></b><span>LOGIN STREAK</span><small class="kc-profile-streak-best">BEST · '+bestStreak+' DAYS</small></div></div>'+
'<div class="kc-profile-activity-head"><div><span>YOUR CREW JOURNEY</span><h2>Activity</h2></div><div class="kc-profile-activity-tabs"><button type="button" data-profile-tab="uploads" class="'+(tab==='uploads'?'active':'')+'">Posts <i>'+uploadsCount+'</i></button><button type="button" data-profile-tab="registrations" class="'+(tab==='registrations'?'active':'')+'">Registered <i>'+registeredCount+'</i></button><button type="button" data-profile-tab="achievements" class="'+(tab==='achievements'?'active':'')+'">Achievements <i>'+achievements.length+'</i></button></div></div>'+
'<div class="kc-profile-activity-panel" data-profile-panel="uploads" '+(tab==='uploads'?'':'hidden')+'>'+uploadRows+'</div>'+
'<div class="kc-profile-activity-panel" data-profile-panel="registrations" '+(tab==='registrations'?'':'hidden')+'>'+registrationRows+'</div>'+
'<div class="kc-profile-activity-panel" data-profile-panel="achievements" '+(tab==='achievements'?'':'hidden')+'>'+(achievements.length?achievements.map(item=>'<article class="kc-profile-activity-row"><div><b>'+esc(item.title||'Crew achievement')+'</b><small>'+esc(item.body||'Recognized by Kinetic Crew')+'</small></div><span class="kc-profile-registration-tag">ACHIEVEMENT</span></article>').join(''):'<div class="kc-profile-activity-empty"><b>No achievements yet</b><span>Achievements recognized by Kinetic Crew will appear here.</span></div>')+'</div>'+
'</section>';return '<div class="kc-reference-profile kc-liquid-profile kc-single-profile '+(founder?'is-founder':'')+'">'+
'<div class="kc-profile-flip-shell '+(firstFlipIntro?'kc-flip-intro':'')+'" data-profile-flip><div class="kc-profile-flip-inner"><section class="kc-liquid-profile-card '+(founder?'kc-founder-card':'')+'">'+
'<div class="kc-liquid-card-top"><button class="kc-profile-back" data-view="overview" aria-label="Back home">‹</button><span class="kc-liquid-wordmark">KINETIC <b>CREW</b></span><div class="kc-profile-hero-right"><button class="kc-profile-scan-button" type="button" data-profile-scan aria-label="Scan QR code">Scan QR</button><button class="kc-profile-share-button" type="button" data-share-profile aria-label="Share profile">↗</button><button class="kc-profile-edit-button" data-profile-edit>Edit</button></div></div>'+
'<div class="kc-liquid-profile-photo">'+(photo?'<img src="'+esc(photo)+'" alt="'+esc(u.name||'Profile photo')+'" loading="eager">':'<span>'+esc(initials(u.name||u.email))+'</span>')+'</div>'+
'<div class="kc-liquid-profile-copy"><span class="kc-liquid-eyebrow">'+(founder?'FOUNDER':'KINETIC CREW MEMBER')+'</span><h1>'+esc(u.name||'Kinetic Crew Member')+'</h1><p>@'+esc(username)+'</p><div class="kc-single-profile-tags"><span>'+esc(String(job).toUpperCase())+'</span></div>'+(u.bio?'<p class="kc-liquid-bio">'+esc(u.bio)+'</p>':'')+'</div>'+
'<div class="kc-liquid-orb kc-liquid-orb-pink"></div><div class="kc-liquid-orb kc-liquid-orb-cyan"></div>'+'</section>'+profileCardBackMarkup(u,u.auth_id||u.id,username)+'</div></div>'+
(showFlipHint?'<div class="kc-profile-flip-hint" data-profile-flip-hint><span class="kc-flip-hint-icon">↻</span><span><b>DOUBLE TAP TO FLIP</b><small>Tap your profile card twice to reveal your member QR</small></span><i class="kc-flip-hint-pulse"></i></div>':'')+
editForm+activity+'</div>';
}
function publicProfilePage(){
 const p=S.profileSocial?.profile;
 if(!p)return empty('Profile unavailable','This crew profile could not be loaded.');
 const self=String(p.auth_id)===String(S.user?.auth_id),founder=p.role==='super_admin';
 const following=Boolean(S.profileSocial?.is_following??S.profileSocial?.following??S.profileSocial?.viewer_follows);
 const photo=p.banner_url||p.cover_url||p.cover_photo_url||p.avatar_url||'';
 const avatar=p.avatar_url||'';
 const username=p.username||String(p.email||'crew-member').split('@')[0];
 const job=p.crew_title||p.occupation||role(p.role);
 const instagram=String(p.instagram_username||'').replace(/^@/,'').trim();
 const coverStyle=photo?' style="--kc-visitor-cover:url(&quot;'+esc(safeSocialUrl(photo))+'&quot;)"':'';
 const action=self?'<button class="kc-visitor-action" data-view="profile">Edit profile</button>':'<button type="button" class="kc-visitor-action kc-follow-action" data-follow="'+esc(p.auth_id)+'" data-following="'+(following?'true':'false')+'">'+(following?'Following':'Follow')+'</button>';
 return '<main class="kc-visitor-profile kc-visitor-profile-clean">'+
 '<section class="kc-visitor-hero"'+coverStyle+'><div class="kc-visitor-shade"></div><div class="kc-visitor-top"><button class="kc-visitor-back" data-view="people" aria-label="Back to crew">‹</button><div class="kc-visitor-actions"><button class="kc-visitor-share" type="button" data-share-profile aria-label="Share profile">⌯</button>'+action+'</div></div>'+
 '<div class="kc-visitor-identity">'+(avatar?'<img class="kc-visitor-avatar" src="'+esc(avatar)+'" alt="'+esc(p.name||'Crew member')+'" loading="eager">':'<span class="kc-visitor-avatar kc-visitor-avatar-fallback">'+esc(initials(p.name||p.email))+'</span>')+
 '<h1>'+esc(p.name||'Kinetic Crew Member').toUpperCase()+'</h1><p>@'+esc(username)+'</p><div class="kc-visitor-role-stack"><span class="kc-visitor-role">'+esc(role(p.role).toUpperCase())+'</span>'+(p.crew_title?'<span class="kc-visitor-role kc-visitor-role-secondary">'+esc(p.crew_title)+'</span>':'')+'</div>'+(instagram?'<a class="kc-visitor-instagram" href="https://www.instagram.com/'+encodeURIComponent(instagram)+'/" target="_blank" rel="noopener noreferrer">Instagram · @'+esc(instagram)+' ↗</a>':'')+'</div></section>'+
 '<section class="kc-visitor-stats"><button type="button" data-profile-connections="followers" data-profile-owner="'+esc(p.auth_id)+'"><b>'+Number(S.profileSocial?.followers_count||0)+'</b><span>FOLLOWERS</span></button><button type="button" data-profile-connections="following" data-profile-owner="'+esc(p.auth_id)+'"><b>'+Number(S.profileSocial?.following_count||0)+'</b><span>FOLLOWING</span></button></section>'+(p.bio?'<section class="kc-visitor-about"><span>ABOUT</span><p>'+esc(p.bio)+'</p></section>':'')+
 '</main>';
}
async function openProfileConnections(kind,ownerId){
 if(!['followers','following'].includes(kind))return;
 const owner=String(ownerId||S.user?.auth_id||'');
 if(!owner){notice('Profile is unavailable.');return;}
 try{
  const {data,error}=await rpc('crew_profile_connections',{p_auth_id:owner,p_kind:kind});
  if(error)throw error;
  const items=Array.isArray(data?.items)?data.items:[];
  const root=document.createElement('div');root.className='kc-connections-backdrop';root.id='kcConnectionsModal';
  root.innerHTML='<section class="kc-connections-panel" role="dialog" aria-modal="true" aria-labelledby="kcConnectionsTitle"><header><div><small>KINETIC CREW / COMMUNITY</small><h2 id="kcConnectionsTitle">'+(kind==='followers'?'Followers':'Following')+'</h2></div><button type="button" data-connections-close aria-label="Close">×</button></header><div class="kc-connections-list">'+(items.length?items.map(p=>'<button type="button" class="kc-connection-row" data-open-connection="'+esc(p.auth_id)+'"><span class="kc-connection-avatar">'+(p.avatar_url?'<img src="'+esc(p.avatar_url)+'" alt="">':esc(initials(p.name||p.username)))+'</span><span><b>'+esc(p.name||'Crew member')+'</b><small>@'+esc(p.username||'crew-member')+' · '+esc(role(p.role))+'</small></span><i>›</i></button>').join(''):'<div class="kc-connections-empty">No '+kind+' yet.</div>')+'</div><footer>'+items.length+' '+kind.toUpperCase()+'</footer></section>';
  document.body.appendChild(root);
 }catch(error){notice(error.message||'Could not load this list.');}
}
function legacyPeoplePage(){const people=S.publicMembers||[];return welcome('Discover the crew','Find your people, open their profiles and follow their journey.')+'<div class="profile-directory">'+(people.length?people.map(m=>'<article class="surface crew-profile-tile"><button class="crew-profile-open" data-open-profile="'+esc(m.auth_id)+'">'+avatarMarkup(m)+'<span><b>'+esc(m.name)+'</b><small>@'+esc(m.username||'crew-member')+'</small></span></button><p>'+esc(memberDescriptor(m))+'</p><div class="crew-profile-stats"><b>'+Number(m.followers_count||0)+' followers</b><span>'+esc(role(m.role))+'</span></div><button class="outline full" data-open-profile="'+esc(m.auth_id)+'">View profile</button></article>').join(''):empty('No crew profiles yet','Crew members will appear here once they have signed in.'))+'</div>';}
function readKey(){return 'kc-read-notices:'+String(S.user?.id||S.user?.auth_id||'guest');}
function prefsKey(){return 'kc-notification-prefs:'+String(S.user?.auth_id||S.user?.id||'guest');}
function dismissedNoticeKey(){return 'kc-dismissed-notices:'+String(S.user?.auth_id||S.user?.id||'guest');}
function dismissedNoticeIds(){try{return new Set(JSON.parse(localStorage.getItem(dismissedNoticeKey())||'[]').map(String));}catch{return new Set();}}
async function loadGlobalDeletedNotifications(){
 if(!S.user)return;
 const [deleted,dismissed]=await Promise.all([
  client.from('crew_notification_deletions').select('notice_type,source_id'),
  client.from('crew_notification_dismissals').select('notice_type,source_id').eq('user_id',S.user.auth_id)
 ]);
 if(deleted.error)console.warn('Could not load globally deleted notifications:',deleted.error);
 else S.deletedNotifications=(deleted.data||[]).map(row=>row.notice_type+':'+row.source_id);
 if(dismissed.error)console.warn('Could not load your cleared notifications:',dismissed.error);
 else S.dismissedNotifications=(dismissed.data||[]).map(row=>row.notice_type+':'+row.source_id);
}
function notificationPrefs(){try{return {sound:true,push:localStorage.getItem('kc-push-enabled')==='yes',...JSON.parse(localStorage.getItem(prefsKey())||'{}')}}catch{return {sound:true,push:false}}}
function saveNotificationPrefs(patch){const next={...notificationPrefs(),...patch};localStorage.setItem(prefsKey(),JSON.stringify(next));return next;}
function isRead(id){try{const ids=JSON.parse(localStorage.getItem(readKey())||'[]');if(ids.includes(id))return true;const value=String(id||'');return value.startsWith('announcement:')&&ids.includes(value.slice('announcement:'.length));}catch{return false}}
function markRead(id){const ids=new Set(JSON.parse(localStorage.getItem(readKey())||'[]'));ids.add(id);localStorage.setItem(readKey(),JSON.stringify([...ids]));}
function notificationItems(){
 const announcements=(S.announcements||[]).map(a=>({...a,notice_id:'announcement:'+a.id,notice_type:'announcement',notice_time:a.created_at||a.updated_at}));
 const events=(S.events||[]).map(e=>({...e,notice_id:'event:'+e.id,notice_type:'event',notice_time:e.updated_at||e.created_at||e.starts_at,body:e.description||'A crew event has been added or updated.',author_name:e.author_name||'Kinetic Crew'}));
 const posts=(S.socialPosts||[]).map(p=>{const person=(S.publicMembers||[]).find(m=>String(m.auth_id)===String(p.author_id));return {...p,notice_id:'post:'+p.id,notice_type:'post',notice_time:p.updated_at||p.created_at, title:'New Kinetic Gram post',body:p.caption||'A crew member shared a new post.',author_name:person?.name||'Crew member'};});
 const reminders=(S.profileReminders||[]).map(r=>({...r,notice_id:'profile-reminder:'+r.id,notice_type:'profile_reminder',notice_time:r.created_at,author_name:'Kinetic Crew Administration'}));
 const dismissed=new Set([...dismissedNoticeIds(),...(S.dismissedNotifications||[])]),globallyDeleted=new Set(S.deletedNotifications||[]);
 return [...reminders,...announcements,...events,...posts].filter(x=>x.notice_time&&!dismissed.has(String(x.notice_id))&&!globallyDeleted.has(String(x.notice_id))).sort((a,b)=>new Date(b.notice_time)-new Date(a.notice_time));
}
function unread(){return notificationItems().filter(a=>!isRead(a.notice_id||a.id)).length}
function kcIslandActivity(title,body,detail={}){window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title,body,target:detail.target||'notifications',status:detail.status||'pending',progress:detail.progress,persistent:detail.persistent===true,duration:detail.duration,icon:detail.icon||'↗'}}));}
async function kcUploadWithProgress(bucket,path,file,options={}){
 const config=window.KC_CONFIG||{},sessionResult=await client.auth.getSession(),session=sessionResult?.data?.session;
 if(!config.supabaseUrl||!config.supabaseAnonKey||!session?.access_token)throw Error('Your secure upload session expired. Sign in again.');
 const base=String(config.supabaseUrl).replace(/\/$/,'');
 const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
 const xhr=new XMLHttpRequest(),url=base+'/storage/v1/object/'+encodeURIComponent(bucket)+'/'+encodedPath;
 const label=String(options.activityLabel||'Uploading file'),target=String(options.activityTarget||'notifications');
 return await new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error,data)=>{if(settled)return;settled=true;if(error){kcIslandActivity(label,'Upload failed: '+(error.message||'Please try again.'),{target,status:'failed',icon:'!'});reject(error);}else{kcIslandActivity(label,'Upload complete',{target,status:'success',progress:100,duration:2400,icon:'✓'});resolve({data,error:null});}};
  xhr.open('POST',url,true);xhr.setRequestHeader('apikey',config.supabaseAnonKey);xhr.setRequestHeader('Authorization','Bearer '+session.access_token);
  xhr.setRequestHeader('Content-Type',options.contentType||file.type||'application/octet-stream');xhr.setRequestHeader('cache-control',String(options.cacheControl||'3600'));xhr.setRequestHeader('x-upsert',options.upsert?'true':'false');
  kcIslandActivity(label,'Starting upload…',{target,status:'pending',persistent:true,icon:'↑'});
  xhr.upload.addEventListener('progress',event=>{if(!event.lengthComputable||!event.total)return;const progress=Math.max(0,Math.min(100,event.loaded/event.total*100));kcIslandActivity(label,Math.round(event.loaded/1048576*10)/10+' MB of '+Math.round(event.total/1048576*10)/10+' MB',{target,status:'pending',progress,persistent:true,icon:'↑'});});
  xhr.addEventListener('load',()=>{let payload={};try{payload=JSON.parse(xhr.responseText||'{}');}catch{}if(xhr.status<200||xhr.status>=300){finish(Error(payload.message||payload.error||'Storage upload failed ('+xhr.status+').'));return;}const key=String(payload.Key||payload.key||''),storedPath=String(payload.path||payload.name||key.replace(new RegExp('^'+bucket+'/'),'')||path);finish(null,{path:storedPath,fullPath:key||bucket+'/'+storedPath,id:payload.id||null});});
  xhr.addEventListener('error',()=>finish(Error('Network error while uploading.')));xhr.addEventListener('abort',()=>finish(Error('Upload cancelled.')));xhr.send(file);
 });
}
let kcIslandTimer=null;
let kcLastMessageNotificationId='';
let kcIslandRetryAction=null;
function showDynamicIsland(detail={}){
 const messageId=String(detail.messageId||'');
 if(messageId&&messageId===kcLastMessageNotificationId&&detail.progress==null)return;
 if(messageId)kcLastMessageNotificationId=messageId;
 const title=String(detail.title||'Kinetic Crew').slice(0,90),body=String(detail.body||'You have a new crew update.').slice(0,180);
 const target=String(detail.target||'notifications'),rawStatus=String(detail.status||detail.state||detail.result||'pending').trim().toLowerCase();
 const status=/^(success|succeeded|successful|complete|completed|approved|sent|delivered|present|paid)$/.test(rawStatus)?'success':/^(failed|failure|error|rejected|declined|cancelled|canceled|denied)$/.test(rawStatus)?'failed':'pending';
 const progress=detail.progress!==undefined&&detail.progress!==null&&Number.isFinite(Number(detail.progress))?Math.max(0,Math.min(100,Number(detail.progress))):null;
 const count=detail.current!=null&&detail.total!=null?String(detail.current)+' / '+String(detail.total):progress!=null?Math.round(progress)+'%':'';
 let island=document.getElementById('kcDynamicIsland');
 if(!island){
  island=document.createElement('section');island.id='kcDynamicIsland';island.className='kc-dynamic-island';
  island.setAttribute('role','status');island.setAttribute('aria-live','polite');
  island.innerHTML='<div class="kc-island-shell"><button type="button" class="kc-island-main" aria-label="Open current Kinetic Crew activity"><span class="kc-island-orb" aria-hidden="true"><i></i></span><span class="kc-island-copy"><b></b><small></small></span><span class="kc-island-count" hidden></span><span class="kc-island-chevron" aria-hidden="true">⌄</span><span class="kc-island-progress" aria-hidden="true"><i></i></span></button><div class="kc-island-detail" hidden><span class="kc-island-detail-label">LIVE ACTIVITY</span><p></p><div class="kc-island-detail-actions"><button type="button" class="kc-island-open">Open activity</button><button type="button" class="kc-island-retry" hidden>Retry</button><button type="button" class="kc-island-dismiss">Dismiss</button></div></div></div>';
  document.body.appendChild(island);
  island.querySelector('.kc-island-main').addEventListener('click',()=>{island.classList.toggle('is-expanded');island.querySelector('.kc-island-detail').hidden=!island.classList.contains('is-expanded');});
  island.querySelector('.kc-island-open').addEventListener('click',()=>{const view=island.dataset.target||'notifications',conversationId=island.dataset.conversationId||'';clearTimeout(kcIslandTimer);island.classList.remove('is-visible','is-expanded');if(view==='gram-chat'&&conversationId)window.__kgOpenConversation=conversationId;go(view);});
  island.querySelector('.kc-island-dismiss').addEventListener('click',()=>{clearTimeout(kcIslandTimer);island.classList.remove('is-visible','is-expanded');});
  island.querySelector('.kc-island-retry').addEventListener('click',event=>{event.stopPropagation();if(typeof kcIslandRetryAction==='function'){const action=kcIslandRetryAction;kcIslandRetryAction=null;Promise.resolve().then(action).catch(error=>console.warn('Kinetic Crew retry failed:',error));}});
 }
 island.dataset.status=status;island.dataset.target=target;island.dataset.conversationId=String(detail.conversationId||'');
 island.classList.remove('kc-island-success','kc-island-pending','kc-island-failed');island.classList.add('kc-island-'+status);
 island.querySelector('.kc-island-orb').textContent=String(detail.icon||(status==='success'?'✓':status==='failed'?'!':'↗')).slice(0,2);
 island.querySelector('.kc-island-copy b').textContent=title;island.querySelector('.kc-island-copy small').textContent=body;island.querySelector('.kc-island-detail p').textContent=body;
 const countNode=island.querySelector('.kc-island-count');countNode.textContent=count;countNode.hidden=!count;
 const retry=island.querySelector('.kc-island-retry');kcIslandRetryAction=typeof detail.retry==='function'?detail.retry:null;retry.hidden=!(status==='failed'&&kcIslandRetryAction);
 island.style.setProperty('--kc-island-progress',progress==null?(status==='pending'?'34%':'100%'):progress+'%');
 island.classList.toggle('has-progress',progress!=null||status==='pending');island.classList.toggle('is-indeterminate',progress==null&&status==='pending');island.classList.toggle('is-persistent',detail.persistent===true);
 island.classList.remove('is-visible');void island.offsetWidth;island.classList.add('is-visible');clearTimeout(kcIslandTimer);
 if(detail.persistent!==true){const duration=Number(detail.duration),timeout=Number.isFinite(duration)&&detail.duration!=null?Math.max(1800,Math.min(15000,duration)):(status==='failed'?9000:status==='success'?4800:6500);kcIslandTimer=setTimeout(()=>island.classList.remove('is-visible','is-expanded'),timeout);}
}window.addEventListener('kc:notification',event=>{const detail=event.detail||{};if(detail.conversationId&&String(window.kcGramActiveConversation||'')===String(detail.conversationId))return;showDynamicIsland(detail);if(notificationPrefs().sound)playNoticeSound();});

let kcGramInboxChannel=null,kcGramInboxUserId='';
async function refreshKcGramUnreadBadge(userId=kcGramInboxUserId){
 if(!userId||!client?.from)return;
 try{
  const {data,error}=await client.from('kg_message_receipts')
   .select('message_id,message:kg_messages!inner(sender_id)')
   .eq('user_id',userId).is('read_at',null);
  if(error)throw error;
  const count=(data||[]).filter(row=>String(row.message?.sender_id||'')!==String(userId)).length;
  window.kcGramUnreadCount=count;window.kcSetGramUnreadCount?.(count);
 }catch(error){console.warn('Kinetic Gram unread count refresh deferred:',error.message||error);}
}
function startKcGramInboxRealtime(){
 const userId=String(S.user?.auth_id||S.user?.id||'');
 if(!userId||!client?.channel)return;
 if(kcGramInboxChannel&&kcGramInboxUserId===userId)return;
 if(kcGramInboxChannel){try{client.removeChannel(kcGramInboxChannel);}catch{}kcGramInboxChannel=null;}
 kcGramInboxUserId=userId;
 const channel=client.channel('kc-gram-inbox-'+userId);
 void refreshKcGramUnreadBadge(userId);
 channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'kg_message_receipts',filter:'user_id=eq.'+userId},()=>{void refreshKcGramUnreadBadge(userId);});
 channel.on('postgres_changes',{event:'INSERT',schema:'public',table:'kg_messages'},async payload=>{
  void refreshKcGramUnreadBadge(userId);
  const message=payload?.new||{},conversationId=String(message.conversation_id||'');
  if(!message.id||!conversationId||String(message.sender_id)===userId)return;
  try{
   const membership=await client.from('kg_conversation_members')
    .select('notifications_enabled,muted_until')
    .eq('conversation_id',conversationId).eq('user_id',userId).maybeSingle();
   if(!membership.error&&(!membership.data||membership.data.notifications_enabled===false))return;
   if(!membership.error&&membership.data?.muted_until&&Date.parse(membership.data.muted_until)>Date.now())return;
  }catch(error){console.warn('Kinetic Gram notification preference check deferred:',error);}
  let sender=(S.publicMembers||S.members||[]).find(person=>String(person.auth_id||person.id)===String(message.sender_id));
  if(!sender){
   try{const directory=await rpc('crew_profile_directory',{});if(!directory.error&&Array.isArray(directory.data)){S.publicMembers=directory.data;sender=directory.data.find(person=>String(person.auth_id||person.id)===String(message.sender_id));}}catch{}
  }
  const senderName=String(sender?.name||'Crew member');
  const preview=message.message_type==='image'?'Photo':message.message_type==='video'?'Video':message.message_type==='voice'||message.message_type==='audio'?'Voice message':message.message_type==='document'?'Document':message.message_type==='gif'?'GIF':message.message_type==='location'?'Shared a location':String(message.body||'New message').slice(0,150);
  window.dispatchEvent(new CustomEvent('kc:kg-message',{detail:{conversationId,messageId:String(message.id),senderId:String(message.sender_id),senderName,preview}}));
  if(String(window.kcGramActiveConversation||'')!==conversationId){
   window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:'Kinetic Gram · '+senderName,body:preview,target:'gram-chat',conversationId,messageId:String(message.id)}}));
  }
 });
 channel.subscribe(status=>{if(status!=='SUBSCRIBED')console.warn('Kinetic Gram inbox Realtime status:',status);});
 kcGramInboxChannel=channel;
}
let kcKnownAnnouncementIds=null,kcAnnouncementPoll=null;
let kcLastInteractionAt=0,kcDeferredSnapshotPaintTimer=0;
document.addEventListener('pointerdown',()=>{kcLastInteractionAt=Date.now();},{passive:true});
document.addEventListener('keydown',event=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName||''))kcLastInteractionAt=Date.now();},{passive:true});
function kcPaintSnapshotWhenIdle(){
 if(!S.user||document.hidden)return;
 if(Date.now()-kcLastInteractionAt<1100){kcDeferredSnapshotPaintTimer=setTimeout(kcPaintSnapshotWhenIdle,650);return;}
 paint();
}
function seedAnnouncementNotifications(){kcKnownAnnouncementIds=new Set((S.announcements||[]).map(a=>String(a.id)));}
let kcSnapshotBusy=false;
function kcSnapshotSignature(rows,keys){
 return (Array.isArray(rows)?rows:[]).map(row=>keys.map(key=>String(row?.[key]??'')).join('¦')).join('§');
}
async function syncCrewSnapshot(){
 if(kcSnapshotBusy||!S.user||!navigator.onLine)return;
 kcSnapshotBusy=true;
 try{
  const [snapshot,metaResult,statusResult,rehearsalRows,pollRows,postRows]=await Promise.all([
   api('bootstrap'),
   rpc('crew_event_metadata',{}).catch(()=>({data:[]})),
   rpc('crew_event_statuses',{}).catch(()=>({data:[]})),
   loadRehearsalItems().catch(()=>S.featureItems.rehearsals||[]),
   featureApi('list','polls',{}).catch(()=>S.featureItems.polls||[]),
   Promise.resolve().then(()=>client.from('crew_social_posts').select('*').order('created_at',{ascending:false}).limit(100)).catch(()=>({data:S.socialPosts||[],error:null}))
  ]);
  if(snapshot?.user)S.user={...S.user,...snapshot.user};
  const eventMeta=new Map([...(Array.isArray(metaResult?.data)?metaResult.data:[]),...(Array.isArray(statusResult?.data)?statusResult.data:[])].map(item=>[String(item.id),item]));
  const nextEvents=(snapshot?.events||[]).map(event=>({...event,...(eventMeta.get(String(event.id))||{})})),nextAnnouncements=snapshot?.announcements||[],nextMembers=snapshot?.members||[];
  const rows=Array.isArray(nextAnnouncements)?nextAnnouncements:[];
  const previous=kcKnownAnnouncementIds||new Set((S.announcements||[]).map(a=>String(a.id)));
  const nextPolls=Array.isArray(pollRows)?pollRows:(pollRows?.data||[]);
  const nextPostRows=postRows.error?(S.socialPosts||[]):(postRows.data||[]);
  const previousPostIds=new Set((S.socialPosts||[]).map(p=>String(p.id)));
  const previousAnnouncements=new Map((S.announcements||[]).map(a=>[String(a.id),a]));
  const incomingAnnouncements=rows.filter(a=>{const old=previousAnnouncements.get(String(a.id));return !old||String(old.updated_at||old.created_at||'')!==String(a.updated_at||a.created_at||'')||String(old.title||'')!==String(a.title||'')||String(old.body||'')!==String(a.body||'');});
  const previousEvents=new Map((S.events||[]).map(x=>[String(x.id),x]));
  const incomingEvents=nextEvents.filter(e=>{const old=previousEvents.get(String(e.id));return !old||String(old.updated_at||old.created_at||'')!==String(e.updated_at||e.created_at||'')||['title','description','location','starts_at','category','cover_url','redirect_url'].some(key=>String(old[key]??'')!==String(e[key]??''));});
  const incomingPosts=nextPostRows.filter(p=>!previousPostIds.has(String(p.id)));
  const previousPollIds=new Set((S.featureItems.polls||[]).map(p=>String(p.id)));
  const incomingPolls=nextPolls.filter(p=>!previousPollIds.has(String(p.id)));
  kcKnownAnnouncementIds=new Set(rows.map(a=>String(a.id)));
  const changed=
   kcSnapshotSignature(S.events,['id','updated_at','created_at','title','description','location','starts_at','capacity','event_status','cover_url','redirect_url'])!==kcSnapshotSignature(nextEvents,['id','updated_at','created_at','title','description','location','starts_at','capacity','event_status','cover_url','redirect_url'])||
   kcSnapshotSignature(S.announcements,['id','updated_at','created_at','title','body','audience'])!==kcSnapshotSignature(rows,['id','updated_at','created_at','title','body','audience'])||
   kcSnapshotSignature(S.members,['auth_id','updated_at','name','role','approval_status','avatar_url','username'])!==kcSnapshotSignature(nextMembers,['auth_id','updated_at','name','role','approval_status','avatar_url','username'])||
   kcSnapshotSignature(S.socialPosts,['id','updated_at','created_at','caption','post_type','link_url','storage_path'])!==kcSnapshotSignature(nextPostRows,['id','updated_at','created_at','caption','post_type','link_url','storage_path'])||
   kcSnapshotSignature(S.featureItems.polls||[],['id','updated_at','created_at','title','status','ends_at'])!==kcSnapshotSignature(nextPolls,['id','updated_at','created_at','title','status','ends_at']);
  const nextRehearsals=Array.isArray(rehearsalRows)?rehearsalRows:(rehearsalRows?.data||[]);
  const rehearsalChanged=kcSnapshotSignature(S.featureItems.rehearsals||[],['id','updated_at','created_at','title','status','starts_at'])!==kcSnapshotSignature(nextRehearsals,['id','updated_at','created_at','title','status','starts_at']);
  S.events=nextEvents;S.announcements=rows;S.members=nextMembers;S.socialPosts=nextPostRows;S.featureItems.rehearsals=nextRehearsals;S.featureItems.polls=nextPolls;
  await loadGlobalDeletedNotifications();
  if(changed||rehearsalChanged){paintUser();if(Date.now()-kcLastInteractionAt>=1100)paint();else{clearTimeout(kcDeferredSnapshotPaintTimer);kcDeferredSnapshotPaintTimer=setTimeout(kcPaintSnapshotWhenIdle,1200);}}
  const fresh=[...incomingAnnouncements.map(a=>({type:'announcement',title:a.title,body:a.body})),...incomingEvents.map(a=>({type:'event',title:a.title,body:a.description||'A new event was added.'})),...incomingPosts.map(a=>({type:'post',title:'New Kinetic Gram post',body:a.caption||'A crew member shared a post.'})),...incomingPolls.map(p=>({type:'poll',title:'New crew poll: '+p.title,body:'A new poll is ready for your vote.'}))];
  if(fresh.length){
   const latest=fresh[0];
   window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:latest.title||'Kinetic Crew update',body:latest.body||'New crew activity is available.',target:'notifications'}}));
   if(S.view==='notifications'&&!changed)paint();
  }
 }catch(error){console.warn('Background crew sync failed:',error);}
 finally{kcSnapshotBusy=false;}
}
let kcLastSnapshotSync=0,kcSnapshotSyncBusy=false;
function kcSnapshotPollInterval(){
 const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
 const slow=connection?.saveData||/^(slow-2g|2g)$/.test(connection?.effectiveType||'');
 return slow?120000:60000;
}
async function kcThrottledSnapshotSync(force=false){
 if(!navigator.onLine||document.hidden||kcSnapshotSyncBusy)return;
 const now=Date.now(),interval=kcSnapshotPollInterval();
 if(!force&&now-kcLastSnapshotSync<interval-1000)return;
 kcSnapshotSyncBusy=true;kcLastSnapshotSync=now;
 try{await syncCrewSnapshot();}catch(error){console.warn('Background sync deferred:',error);}
 finally{kcSnapshotSyncBusy=false;}
}
function startCrewNotificationPolling(){
 if(kcAnnouncementPoll)clearInterval(kcAnnouncementPoll);
 kcAnnouncementPoll=setInterval(()=>kcThrottledSnapshotSync(false),kcSnapshotPollInterval());
 if(!window.kcSnapshotVisibilityBound){
  window.kcSnapshotVisibilityBound=true;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)kcThrottledSnapshotSync(false);});
  window.addEventListener('focus',()=>kcThrottledSnapshotSync(false));
  window.addEventListener('pageshow',()=>kcThrottledSnapshotSync(false));
  window.addEventListener('online',()=>kcThrottledSnapshotSync(true));
 }
}

function playNoticeSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C();const play=()=>{const start=ctx.currentTime;const notes=[880,1175,988,1318,880,1175,988,1318];notes.forEach((hz,i)=>{const t=start+i*.19,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.setValueAtTime(hz,t);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.32,t+.018);gain.gain.setValueAtTime(.32,t+.115);gain.gain.exponentialRampToValueAtTime(.0001,t+.17);osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+.18);});setTimeout(()=>ctx.close().catch(()=>{}),1900);};if(ctx.state==='suspended')ctx.resume().then(play).catch(()=>ctx.close().catch(()=>{}));else play();}catch(error){console.warn('Kinetic Crew alert sound unavailable:',error);}}
function notificationCard(a){
 const id=a.notice_id||('announcement:'+a.id),read=isRead(id),type=a.notice_type||'announcement';
 const label=type==='profile_reminder'?'PROFILE REMINDER':type==='event'?'EVENT UPDATE':type==='post'?'POST':'ANNOUNCEMENT';
 const icon=type==='profile_reminder'?'♙':type==='event'?'▦':type==='post'?'◈':'♧';
 const target=type==='profile_reminder'?'profile':type==='event'?'event-detail':type==='post'?'feed':'updates';
 return '<article class="notification-item '+(read?'read':'unread')+' notice-type-'+type+'" data-notice-id="'+esc(id)+'">'+
 '<span class="notification-icon">'+(read?'✓':icon)+'</span><div class="notification-copy"><div class="announce-meta"><b>'+label+'</b><span>·</span><span>'+esc(dt(a.notice_time||a.created_at))+'</span><span class="notice-state">'+(read?'READ':'NEW')+'</span></div>'+
 '<h3>'+esc(a.title||'Crew update')+'</h3><p>'+esc(a.body||a.description||a.caption||'')+'</p><small>From '+esc(a.author_name||'Kinetic Crew')+'</small>'+
 '<button type="button" class="notice-open-link" data-notice-open="'+esc(id)+'" data-notice-type="'+type+'" data-notice-target="'+esc(a.id)+'">Open '+(type==='profile_reminder'?'profile':type==='event'?'event':type==='post'?'post':'announcement')+' ↗</button></div>'+
 '<button class="notice-read-button" data-read-notice="'+esc(id)+'" aria-label="'+(read?'Already read':'Mark as read')+'" '+(read?'disabled':'')+'>'+(read?'✓':'Mark read')+'</button>'+
 (admin()?'<button type="button" class="notice-delete-button" data-global-delete-notice="'+esc(type)+'" data-notice-source-id="'+esc(a.id)+'" aria-label="Delete this notification for everyone" title="Delete for everyone">×</button>':'')+'</article>';
}
function notificationsPage(){
 const items=notificationItems(),filter=S.noticeFilter||'all',category=S.noticeCategory||'all',query=(S.noticeQuery||'').trim().toLowerCase();
 const filtered=items.filter(a=>(category==='all'||a.notice_type===category)&&(filter==='all'||(filter==='unread'&&!isRead(a.notice_id)))&&(!query||(String(a.title||'')+' '+String(a.body||'')+' '+String(a.author_name||'')).toLowerCase().includes(query)));
 const countFor=type=>items.filter(a=>(type==='all'||a.notice_type===type)&&!isRead(a.notice_id)).length;
 return welcome('Your notifications','Announcements, event updates and posts — all organised in one inbox.')+
 '<section class="notice-hero"><div class="notice-hero-copy"><span class="notice-kicker">KINETIC CREW / INBOX</span><h2>'+unread()+' <em>new</em> updates</h2><p>Stay close to announcements, events and everything shared by your crew.</p></div><div class="notice-orbit"><span>✳</span><i></i><b></b></div></section>'+
 '<section class="notice-controls"><div class="notice-tabs"><button data-notice-filter="all" class="'+(filter==='all'?'active':'')+'">All <span>'+items.length+'</span></button><button data-notice-filter="unread" class="'+(filter==='unread'?'active':'')+'">Unread <span>'+unread()+'</span></button></div><div class="notice-actions"><input id="noticeSearch" type="search" placeholder="Search notifications…" value="'+esc(S.noticeQuery||'')+'"><button class="outline" id="clearAllNotifications" '+(items.length?'':'disabled')+'>Clear notifications</button><button class="outline" id="markAllRead" '+(unread()?'':'disabled')+'>Mark all read</button>'+(admin()?'<button type="button" class="primary" data-view="custom-alerts">＋ Custom app alert</button>':'')+'</div></section>'+
 '<section class="notice-category-tabs" aria-label="Notification categories">'+[['all','All',items.length],['announcement','Announcements',items.filter(a=>a.notice_type==='announcement').length],['event','Event updates',items.filter(a=>a.notice_type==='event').length],['post','Posts',items.filter(a=>a.notice_type==='post').length]].map(([key,label,total])=>'<button type="button" data-notice-category="'+key+'" class="'+(category===key?'active':'')+'">'+label+' <span>'+total+'</span>'+(countFor(key)?'<i>'+countFor(key)+'</i>':'')+'</button>').join('')+'</section>'+
 '<section class="notice-layout"><div class="notice-feed"><div class="notice-feed-head"><div><b>Activity</b><small>'+filtered.length+' updates</small></div><span class="notice-live"><i></i> LIVE CREW FEED</span></div>'+
 (filtered.length?filtered.map(notificationCard).join(''):(query?empty('No matching updates','Try a different search.'):('<div class="kc-notice-empty" role="status"><div class="kc-notice-empty-art"><span class="kc-notice-star">✳</span><span class="kc-notice-spark kc-spark-one">✦</span><span class="kc-notice-spark kc-spark-two">·</span><span class="kc-notice-orbit"></span></div><b>You are all caught up</b><p>New announcements, events and posts will appear here.</p><span class="kc-notice-empty-foot">A little calm before the next crew moment</span></div>')))+'</div>'+
 '</section>';
}
function loadOptionalScript(src){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){if(existing.dataset.loaded==="yes")return resolve();existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return;}const script=document.createElement("script");script.src=src;script.async=true;script.onload=()=>{script.dataset.loaded="yes";resolve();};script.onerror=reject;document.head.appendChild(script);});} 
function kcQrSetState(state,title,message,showRoster=false){
 const stage=$('#kcQrStage');if(!stage)return;
 stage.dataset.state=state;
 const mark=$('#kcQrMark'),heading=$('#kcQrTitle'),copy=$('#kcQrMessage'),roster=$('#kcQrViewRoster');
 if(mark)mark.textContent=state==='success'?'✓':state==='error'?'×':'⌗';
 if(heading)heading.textContent=title;
 if(copy)copy.textContent=message;
 if(roster)roster.hidden=!showRoster;
}
async function startQr(){
 if(S.qrScanning)return;
 if(!window.jsQR){try{await loadOptionalScript("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js");}catch{notice("QR scanner could not load. Check your connection and try again.");return;}}
 if(!navigator.mediaDevices?.getUserMedia){notice('Camera access is unavailable in this browser. Use OTP verification instead.');return;}
 try{
  S.qrScanning=true;S.qrProcessing=false;
  const scanner=$('#qrScanner'),video=$('#qrVideo');
  if(!scanner||!video)throw Error('Scanner view is unavailable.');
  scanner.hidden=false;
  kcQrSetState('scanning','Align QR code inside the square','Keep the ticket steady and within the frame.');
  S.qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  video.srcObject=S.qrStream;await video.play();
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  let lastScanAt=0,invalidUntil=0,frameBusy=false;
  const scan=async now=>{
   if(!S.qrStream||S.qrProcessing||frameBusy)return;
   if(now-lastScanAt<130){requestAnimationFrame(scan);return;}
   lastScanAt=now;if(invalidUntil&&now>=invalidUntil&&$('#kcQrStage')?.dataset.state==='error'){invalidUntil=0;kcQrSetState('scanning','Align QR code inside the square','Keep the ticket steady and within the frame.');}frameBusy=true;
   try{
    if(video.readyState>=2&&video.videoWidth&&window.jsQR){
     const edge=Math.floor(Math.min(video.videoWidth,video.videoHeight)*0.76);
     const sx=Math.floor((video.videoWidth-edge)/2),sy=Math.floor((video.videoHeight-edge)/2);
     canvas.width=420;canvas.height=420;
     ctx.drawImage(video,sx,sy,edge,edge,0,0,420,420);
     const result=window.jsQR(ctx.getImageData(0,0,420,420).data,420,420,{inversionAttempts:'attemptBoth'});
     const raw=String(result?.data||'').trim();
     if(raw&&now>=invalidUntil){
      const parts=raw.split(':');
      if(parts.length!==3||parts[0]!=='KC_EVENT_ATTENDANCE'||!/^[0-9a-f-]{36}$/i.test(parts[1])||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parts[2])){
       invalidUntil=now+1700;
       kcQrSetState('error','QR code not recognized','This is not a valid Kinetic Crew event ticket. Try another QR code.');
      }else{
       S.qrProcessing=true;
       kcQrSetState('scanning','Verifying ticket…','Checking the event and registered member.');
       const eventId=parts[1],memberEmail=parts[2];
       try{
        const result=await api('qr-attendance','POST',{eventId,memberEmail});
        S.rosterEvent=eventId;
        S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));
        const member=(S.roster?.roster||[]).find(m=>String(m.email).toLowerCase()===memberEmail.toLowerCase());
        const event=S.events.find(e=>String(e.id)===String(eventId));
        S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:eventId}).then(x=>x.error?[]:x.data||[]);
        stopQr();
        kcQrSetState('success','Attendance verified',(member?.name||result.member||memberEmail)+' · '+(event?.title||'Kinetic Crew event'),true);
       }catch(error){
        S.qrProcessing=false;invalidUntil=now+1900;
        kcQrSetState('error','Unable to verify ticket',error.message||'The ticket could not be verified. Try again or use OTP.');
       }
      }
     }
    }
   }catch(err){console.warn('QR scan frame failed:',err);}
   finally{frameBusy=false;}
   if(S.qrStream&&!S.qrProcessing)requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
 }catch(err){
  stopQr();
  notice(err?.name==='NotAllowedError'?'Allow camera access to scan member QR codes.':'Camera unavailable. Use OTP verification instead.');
 }
}
function stopQr(){if(S.qrStream){S.qrStream.getTracks().forEach(t=>t.stop());S.qrStream=null;}S.qrScanning=false;}

function card(e){let act=e.attended?'<span class="pill">✓ Attended</span>':e.registered?'<span class="pill">✓ Registered</span>':'<span class="event-open-hint">View details ↗</span>';return '<article class="event event-clickable" role="button" tabindex="0" data-open-event="'+esc(e.id)+'"><div class="cover"><span class="datechip">'+esc(ds(e.starts_at))+'</span><span class="coversymbol">✳</span><span class="covercode">KC / EVENT '+esc(String(e.id).slice(0,5).toUpperCase())+'</span></div><div class="eventbody"><div class="eventtype"><i></i>'+(new Date(e.starts_at)>new Date()?'UPCOMING EVENT':'CREW EVENT')+'</div><h3>'+esc(e.title)+'</h3><p class="eventdesc">'+esc(e.description||'A moment to connect, create, and move together.')+'</p><div class="eventmeta"><span>'+esc(dt(e.starts_at))+'</span><span>'+esc(e.location||'Location TBA')+'</span></div><div class="eventbottom"><span class="capacity">'+Number(e.registration_count||0)+' / '+Number(e.capacity||0)+' registered</span>'+act+'</div></div></article>';}

document.addEventListener('input',event=>{
 const input=event.target.closest('[data-ticket-member-search]');
 if(!input)return;
 const q=input.value.trim().toLowerCase(),list=input.closest('.memory-recipient-menu');
 list?.querySelectorAll('.memory-recipient-option').forEach(row=>{row.hidden=!!q&&!String(row.dataset.memberSearch||'').includes(q);});
});
document.addEventListener('change',event=>{
 const radio=event.target.closest('.kc-ticket-recipient-picker input[type="radio"][name="email"]');
 if(!radio)return;
 const picker=radio.closest('.kc-ticket-recipient-picker');
 const count=picker?.querySelector('.memory-recipient-count');
 if(count)count.textContent='1 selected';
 const summary=picker?.querySelector('summary span');
 if(summary)summary.textContent=radio.closest('.memory-recipient-option')?.querySelector('b')?.textContent||'1 member selected';
});
function ticketRecipientRows(members){
 return members.map(m=>'<label class="memory-recipient-option" data-member-search="'+esc([m.name,m.username,m.email].filter(Boolean).join(' ').toLowerCase())+'"><input type="radio" name="email" value="'+esc(String(m.email).trim())+'"><span>'+avatarMarkup(m,'small')+'</span><span><b>'+esc(m.name||'Crew member')+'</b><small>'+esc(m.username?'@'+m.username:m.email)+'</small></span><i class="memory-recipient-check">✓</i></label>').join('');
}
function ticketRecipientPicker(eventId){
 const loaded=String(S.rosterEvent||'')===String(eventId)&&Array.isArray(S.roster?.roster);
 const source=loaded?S.roster.roster:[];
 const seen=new Set(),members=source.filter(m=>m&&m.email&&String(m.email).includes('@')).filter(m=>{const email=String(m.email).trim().toLowerCase();if(seen.has(email))return false;seen.add(email);return true;});
 const content=loaded?(members.length?ticketRecipientRows(members):'<p class="hint memory-no-members">No members have registered for this event yet.</p>'):'<p class="hint memory-no-members" data-ticket-roster-status>Loading this event’s registered members…</p>';
 return '<details class="memory-recipient-picker kc-ticket-recipient-picker" data-ticket-event-id="'+esc(eventId)+'"><summary><span>＋ Choose registered members</span><b class="memory-recipient-count">0 selected</b></summary><div class="memory-recipient-menu"><input type="search" class="memory-member-search" data-ticket-member-search placeholder="Search by name, username or email…" aria-label="Search registered members"><div class="memory-recipient-list">'+content+'</div></div></details>';
}
async function loadTicketRecipientRoster(eventId){
 const id=String(eventId||'');
 if(!id||!admin()||S.ticketRosterLoadedEvent===id||S.ticketRosterLoadingEvent===id)return;
 S.ticketRosterLoadingEvent=id;
 try{
  const roster=await api('attendance?eventId='+encodeURIComponent(id));
  if(S.view!=='event-detail'||String(S.selectedEvent)!==id)return;
  S.rosterEvent=id;S.roster=roster;S.ticketRosterLoadedEvent=id;
  const list=document.querySelector('.kc-ticket-recipient-picker[data-ticket-event-id="'+CSS.escape(id)+'"] .memory-recipient-list');
  if(list){
   const seen=new Set(),members=(roster?.roster||[]).filter(m=>m&&m.email&&String(m.email).includes('@')).filter(m=>{const email=String(m.email).trim().toLowerCase();if(seen.has(email))return false;seen.add(email);return true;});
   list.innerHTML=members.length?ticketRecipientRows(members):'<p class="hint memory-no-members">No members have registered for this event yet.</p>';
  }
 }catch(error){
  if(S.view==='event-detail'&&String(S.selectedEvent)===id){
   const status=document.querySelector('.kc-ticket-recipient-picker[data-ticket-event-id="'+CSS.escape(id)+'"] .memory-recipient-list');
   if(status)status.innerHTML='<p class="hint memory-no-members">Could not load registered members. Reopen this event and try again.</p>';
  }
  console.warn('Event ticket recipient roster could not load:',error);
 }finally{if(S.ticketRosterLoadingEvent===id)S.ticketRosterLoadingEvent='';}
}

async function kcShareEventCard(event){
 const shareButton=Array.from(document.querySelectorAll('[data-share-event]')).find(button=>button.dataset.shareEvent===String(event.id));
 if(shareButton){shareButton.disabled=true;shareButton.textContent='Preparing card…';}
 try{
  let owner=(S.members||[]).concat(S.publicMembers||[]).find(person=>String(person.auth_id)===String(event.created_by))||null;
  if(event.created_by&&(!owner?.avatar_url||!owner?.name)){try{const result=await rpc('crew_profile_social',{p_auth_id:String(event.created_by)});if(!result.error&&result.data?.profile)owner={...(owner||{}),...result.data.profile};}catch(error){console.info('Event organiser photo unavailable; using event artwork only.',error);}}
  const coverUrl=safeSocialUrl(event.cover_url||event.image_url||event.banner_url||event.poster_url||event.image||''),avatarUrl=safeSocialUrl(owner?.avatar_url||'');
  const loadImage=url=>new Promise((resolve,reject)=>{if(!url)return reject(Error('No image'));const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Image could not be loaded'));img.src=url;});
  let cover=null,avatar=null;try{cover=await loadImage(coverUrl);}catch(_){}try{avatar=await loadImage(avatarUrl);}catch(_){}
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=630;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Could not prepare the event card.');
  const gradient=ctx.createLinearGradient(0,0,1200,630);gradient.addColorStop(0,'#11131c');gradient.addColorStop(.55,'#191322');gradient.addColorStop(1,'#071b20');ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,630);
  const hero=cover||avatar;if(hero){const scale=Math.max(1200/hero.width,630/hero.height),w=hero.width*scale,h=hero.height*scale;ctx.save();ctx.globalAlpha=cover?.72:.38;ctx.drawImage(hero,(1200-w)/2,(630-h)/2,w,h);ctx.restore();}
  const shade=ctx.createLinearGradient(0,0,0,630);shade.addColorStop(0,'rgba(4,6,12,.22)');shade.addColorStop(.35,'rgba(4,6,12,.48)');shade.addColorStop(1,'rgba(4,6,12,.96)');ctx.fillStyle=shade;ctx.fillRect(0,0,1200,630);ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=2;ctx.strokeRect(24,24,1152,582);
  ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(72,72,260,42);ctx.fillStyle='#f7e7f0';ctx.font='700 17px Arial';ctx.fillText('EVENT INVITATION',92,100);
  const title=String(event.title||'Crew event'),wrap=(value,maxWidth,font)=>{ctx.font=font;const words=String(value||'').split(/\s+/),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
  wrap(title,1020,'800 66px Arial').slice(0,2).forEach((line,i)=>{ctx.fillStyle='#fff';ctx.font='800 66px Arial';ctx.fillText(line,74,340+i*76);});
  ctx.fillStyle='#e3dfe9';ctx.font='400 28px Arial';ctx.fillText(String(dt(event.starts_at)),76,510);const place=String(event.location||'Venue to be announced');ctx.fillText(place.length>54?place.slice(0,51)+'…':place,76,552);
  if(avatar){ctx.save();ctx.beginPath();ctx.arc(1040,110,43,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,997,67,86,86);ctx.restore();ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(1040,110,44,0,Math.PI*2);ctx.stroke();}
  if(owner?.name){ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font='700 18px Arial';ctx.fillText(String(owner.name).slice(0,32),1130,180);ctx.textAlign='left';}
  ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='400 16px Arial';ctx.fillText('Shared by the event organiser',76,590);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not export the event card.')),'image/png')),safeName=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'crew-event',file=new File([blob],safeName+'-event.png',{type:'image/png'});
  const url=location.origin+window.kcPath(''),message='Join me at '+title+(event.location?' · '+event.location:'')+' · '+dt(event.starts_at)+'\n'+url;
  if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title,text:message});}
  else{const objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),15000);try{await navigator.clipboard?.writeText(message);}catch(_){}notice('Event card downloaded. Attach it to your invite; event details were copied when supported.');}
 }catch(error){if(error?.name!=='AbortError')notice(error?.message||'Could not share this event.');}
 finally{if(shareButton){shareButton.disabled=false;shareButton.textContent='Share event ↗';}}
}
function eventDetailPage(){
 const e=S.events.find(x=>String(x.id)===String(S.selectedEvent));if(!e)return S.eventMode==='rehearsals'?rehearsalsPage():eventsPage();
 const isRehearsal=isRehearsalEvent(e)||S.eventMode==='rehearsals',pageView=isRehearsal?'rehearsals':'events',noun=isRehearsal?'rehearsal':'event';
 S.eventMode=pageView;
 const eventStatus=e.event_status||'scheduled',past=new Date(e.starts_at).getTime()<Date.now(),full=Number(e.capacity||0)>0&&Number(e.registration_count||0)>=Number(e.capacity||0),src=safeSocialUrl(e.cover_url||e.image_url||e.banner_url||e.poster_url||e.image||'');
 const act=eventStatus==='cancelled'?'<div class="kce-confirmed muted">This event has been cancelled.</div>':eventStatus==='postponed'?'<div class="kce-confirmed muted">This event has been postponed. Updated details will be shared soon.</div>':e.attended?'<div class="kce-confirmed">✓ Attendance confirmed</div>':e.registered?'<div class="kce-ticket-actions"><button type="button" class="outline" data-otp="'+esc(e.id)+'">Get check-in code</button><button type="button" class="primary" data-event-qr="'+esc(e.id)+'">View QR ticket ↗</button></div>':past?'<div class="kce-confirmed muted">Registration has closed</div>':full?'<div class="kce-confirmed muted">This event is full</div>':'<button type="button" class="kce-register-button" data-register="'+esc(e.id)+'">Reserve my place <span>→</span></button>';
 const heroStyle=src?' style="--kce-event-image:url(&quot;'+esc(src)+'&quot;)"':'';
 const heroImage=src?'<img class="kce-detail-banner" src="'+esc(src)+'" alt="'+esc(e.title||'Event banner')+'" decoding="async" fetchpriority="high">':'';
 return '<div class="kce-event-detail kce-nightpulse '+(isRehearsal?'kce-rehearsal-detail':'')+'"><button type="button" class="kce-back-events" data-view="'+pageView+'">← <span>'+(isRehearsal?'Back to rehearsals':'Discover events')+'</span></button>'+
 '<section class="kce-detail-hero"'+heroStyle+'>'+heroImage+'<div class="kce-detail-overlay"></div><div class="kce-detail-content"><span class="kce-eyebrow">'+(isRehearsal?'KINETIC CREW / REHEARSAL':'KINETIC CREW PRESENTS')+'</span>'+eventUpdatedLabel(e)+'<span class="kce-detail-status">'+(eventStatus==='cancelled'?'CANCELLED':eventStatus==='postponed'?'POSTPONED':e.attended?'ATTENDED':e.registered?'YOUR PASS IS READY':full?'SOLD OUT':past?'COMPLETED':'UPCOMING EXPERIENCE')+'</span><h1>'+editorialTitle(esc(e.title))+'</h1><p>'+esc(e.description||'An unforgettable experience with your Kinetic Crew.')+'</p><div class="kce-detail-meta"><span>'+esc(dt(e.starts_at))+'</span><span>'+esc(e.location||'Venue to be announced')+'</span></div><button type="button" class="kce-share-event" data-share-event="'+esc(e.id)+'" data-mode="'+pageView+'">Share '+noun+' ↗</button></div></section>'+
 '<div class="kce-detail-columns"><section class="kce-detail-panel"><span class="kce-eyebrow">'+(isRehearsal?'SESSION DETAILS':'THE EXPERIENCE')+'</span><h2>About this '+noun+'</h2><p>'+esc(e.description||'More details will be shared by the crew.')+'</p><div class="kce-detail-facts"><div><small>DATE & TIME</small><b>'+esc(dt(e.starts_at))+'</b></div><div><small>LOCATION</small><b>'+esc(e.location||'Venue to be announced')+'</b></div><div><small>CREW PARTICIPANTS</small><b>'+Number(e.registration_count||0)+(Number(e.capacity||0)?' / '+Number(e.capacity):' registered')+'</b></div><div><small>YOUR STATUS</small><b>'+(e.attended?'Attended':e.registered?'Ticket reserved':'Not registered')+'</b></div></div></section>'+
 '<aside class="kce-reserve-panel"><span class="kce-eyebrow">YOUR EXPERIENCE</span><h2>'+(e.registered?'You’re on the list.':'Be there.')+'</h2><p>'+(e.registered?'Your event pass is ready. Keep your QR code handy for entry.':'Save your place and join the experience.')+'</p>'+(safeSocialUrl(e.redirect_url)?'<a class="kce-external-event-link" href="'+esc(safeSocialUrl(e.redirect_url))+'" target="_blank" rel="noopener noreferrer">Open event link ↗</a>':'')+act+'<small>Event registration is securely confirmed by Kinetic Crew.</small></aside></div>'+
 (admin()?'<div class="kce-detail-admin-actions"><button type="button" class="kce-admin-event" data-edit-event="'+esc(e.id)+'">✎ Edit event</button><button type="button" class="outline danger-link" data-delete-event="'+esc(e.id)+'">Delete event</button></div><section class="kc-ticket-mailer kce-admin-mailer"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">ADMIN · SUPER ADMIN</span><h2>Send '+(isRehearsal?'rehearsal passes':'event tickets')+' by email</h2><p>Send the branded ticket to all registered members or one registered member. You can customize the email before sending.</p></div><span class="kc-attendance-round-icon">✉</span></div><form id="sendEventTicketsForm" class="kc-ticket-mailer-form"><input type="hidden" name="eventId" value="'+esc(e.id)+'"><label><span>Send to</span><select name="recipientMode"><option value="all">All registered members</option><option value="single">One registered member</option></select></label>'+ticketRecipientPicker(e.id)+'<button type="submit" class="kc-attendance-verify-btn">✉ Send '+(isRehearsal?'rehearsal passes':'event tickets')+'</button><p class="kc-attendance-note">The official ticket, personal QR code, event details and email message are generated automatically.</p></form></section>':'')+'</div>';
}
function announcement(a){return '<article class="announcement"><div class="announceicon">♧</div><div class="announcebody"><div class="announce-meta"><b>CREW SIGNAL</b><span>·</span><span>'+esc(dt(a.created_at))+'</span></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.body)+'</p><div class="author">Posted by <b>'+esc(a.author_name||'Crew Admin')+'</b></div></div>'+(superadmin()?'<button type="button" class="textlink danger-link" data-delete-announcement="'+esc(a.id)+'">Delete</button>':'')+'</article>';}
function formTitle(icon,title,sub){return '<div class="formtitle formtitle-clean"><h3>'+title+'</h3></div>';}
function eventWasUpdated(event){const created=Date.parse(event?.created_at||''),updated=Date.parse(event?.updated_at||'');return Number.isFinite(created)&&Number.isFinite(updated)&&updated-created>1000;}
function eventUpdatedLabel(event){return eventWasUpdated(event)?'<span class="kce-event-updated">UPDATED · '+esc(dt(event.updated_at))+'</span>':'';}
function eventDateInput(value){const d=new Date(value||'');if(Number.isNaN(d.getTime()))return '';const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function eventForm(event=null,mode='events'){
 const isRehearsal=mode==='rehearsals',editing=!!event,selected=String(event?.category||(isRehearsal?'Rehearsals':'Community')),banner=String(event?.cover_url||'');
 const categories=['Auditions','Performances','Workshops','Community','Rehearsals','Other'];
 return '<form id="eventForm" data-mode="'+(isRehearsal?'rehearsals':'events')+'" class="surface formgrid"><input type="hidden" name="eventId" value="'+esc(event?.id||'')+'">'+(isRehearsal?'<input type="hidden" name="category" value="Rehearsals">':'')+formTitle(editing?'✎':'＋',editing?(isRehearsal?'Edit rehearsal':'Edit event'):(isRehearsal?'Schedule a rehearsal':'Create an event'),editing?'Update details. Members will see the latest version automatically.':(isRehearsal?'Schedule a crew rehearsal with registration, tickets and attendance.':'Publish a crew experience with its own banner and ticket details.'))+
 '<label class="field">'+(isRehearsal?'Rehearsal name':'Event name')+'<input name="title" maxlength="120" required placeholder="'+(isRehearsal?'Weekend choreography practice':'Reloaded Auditions')+'" value="'+esc(event?.title||'')+'"></label>'+
 (isRehearsal?'':'<label class="field">Category<select name="category" required>'+categories.map(x=>'<option value="'+x+'" '+(x===selected?'selected':'')+'>'+x+'</option>').join('')+'</select></label>')+
 '<label class="field">Location<input name="location" maxlength="160" placeholder="Dance studio / auditorium" value="'+esc(event?.location||'')+'"></label>'+
 '<label class="field">Date & time<input name="starts_at" type="datetime-local" required value="'+eventDateInput(event?.starts_at)+'"></label>'+
 '<label class="field">Capacity<input name="capacity" type="number" min="1" max="10000" value="'+esc(event?.capacity||40)+'" required></label>'+
 '<div class="field span2 kc-event-banner-field"><span class="field-label">Event banner</span><input type="hidden" name="cover_url" value="'+esc(banner)+'"><label class="kc-event-banner-picker" for="kcEventBannerFile"><span>＋</span><b>Upload banner image</b><small>JPG, PNG or WebP · up to 5 MB</small><input id="kcEventBannerFile" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><div id="kcEventBannerPreview" class="kc-event-banner-preview">'+(banner?'<img src="'+esc(banner)+'" alt="Current event banner"><button type="button" data-event-banner-remove aria-label="Remove banner">Remove</button>':'')+'</div><small class="hint">Choose a square image to represent this event.</small></div>'+
 '<label class="field span2">Description<textarea name="description" rows="3" maxlength="2500" placeholder="What should members know?">'+esc(event?.description||'')+'</textarea></label>'+
 '<div class="field span2 kc-event-redirect-field"><span class="field-label">Redirect link <small class="hint">Optional</small></span><input name="redirect_url" type="url" inputmode="url" placeholder="https://example.com/register" value="'+esc(event?.redirect_url||'')+'"><small class="hint">Add a separate external link for registration, details or another destination. Leave empty if this event should stay inside Kinetic Crew.</small></div>'+
 '<label class="field span2 kce-featured-check"><span><input name="featured" type="checkbox" value="true" '+(event?.featured?'checked':'')+'> Feature this event at the top of Discover</span></label>'+'<label class="field span2 kce-featured-check kc-countdown-setting"><span><input name="show_countdown" type="checkbox" value="true" '+(event?.show_countdown!==false?'checked':'')+'> Show countdown on Home banner</span><small>Turn this off to show the event artwork and details without a timer.</small></label>'+(editing?'<label class="field">Event status<select name="event_status"><option value="scheduled" '+((event?.event_status||'scheduled')==='scheduled'?'selected':'')+'>Scheduled</option><option value="postponed" '+(event?.event_status==='postponed'?'selected':'')+'>Postponed</option><option value="cancelled" '+(event?.event_status==='cancelled'?'selected':'')+'>Cancelled</option></select></label>':'')+
 '<label class="field span2 kce-featured-check kc-email-optin"><span><input name="send_email" type="checkbox" value="true"> Also send email</span><small>Email approved crew members as well as sending the in-app notification. Leave unchecked to send no email.</small></label>'+
 '<label class="field span2 kce-featured-check kc-email-optin"><span><input name="ticket_email_enabled" type="checkbox" value="true" '+(event?.ticket_email_enabled?'checked':'')+'> Email ticket after registration</span><small>Send each registered member their personal QR ticket and event details immediately after registration.</small></label>'+
 '<div class="kce-event-form-actions"><button class="primary full" type="submit">'+(editing?'Save '+(isRehearsal?'rehearsal':'event')+' changes':'＋ Publish '+(isRehearsal?'rehearsal':'event'))+'</button>'+(editing?'<button class="outline full" type="button" data-view="event-detail">Cancel</button>':'')+'</div></form>';
}
function updateForm(){return '<form id="updateForm" class="surface publish">'+formTitle('♧','Broadcast a message','Send the crew a clear signal.')+'<label class="field">Headline<input name="title" maxlength="140" required placeholder="What is the update?"></label><label class="field">Message<textarea name="body" rows="5" maxlength="5000" required placeholder="Share the details…"></textarea></label><label class="field">Audience<select name="audience"><option value="all">Everyone</option><option value="member">Members</option><option value="admin">Admins</option><option value="super_admin">Super admins</option></select></label><label class="field span2 kc-email-optin"><span><input name="send_email" type="checkbox" value="true"> Also send email</span><small>Email the selected audience in addition to the app notification. Leave unchecked to send no email.</small></label><button class="primary full">Publish update →</button><div class="notice">Announcements appear in Crew HQ.</div></form>';}
function safeSocialUrl(raw){try{const url=new URL(String(raw||''));return url.protocol==='https:'?url.href:'';}catch{return '';}}

function rosterRows(rows){const query=String(S.attendanceQuery||'').trim().toLowerCase(),filtered=(rows||[]).filter(m=>!query||(String(m.name||'')+' '+String(m.email||'')).toLowerCase().includes(query));return filtered.length?filtered.map(m=>{const status=m.status||(m.attended?'present':'pending'),label=status==='not_attending'?'Not attending':status==='present'?'Present':status==='absent'?'Absent':'Pending';return '<div class="rosterrow attendance-rosterrow"><div class="avatar">'+esc(initials(m.name))+'</div><div class="rosterperson"><b>'+esc(m.name)+'</b><small>'+esc(m.email)+'</small><span class="status '+esc(status)+'">'+label+'</span></div><div class="attendance-status-actions">'+[['present','Present'],['absent','Absent'],['pending','Reset']].map(([v,t])=>'<button type="button" class="attendance-status-btn '+(status===v?'selected':'')+'" data-attendance-status="'+v+'" data-member-id="'+esc(m.member_id||'')+'" '+(!m.member_id||S.roster?.finalized?'disabled':'')+'>'+t+'</button>').join('')+'</div></div>';}).join(''):empty(query?'No matching members':'No registrations yet',query?'Try another name or email.':'Members who register will appear here.');}

function attendanceReportCard(memberMode){
 const email=String(S.user?.email||'').trim();
 return '<section class="kc-attendance-report"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">KINETIC CREW / REPORTING</span><h2>Send attendance report</h2><p>'+(memberMode?'Send your complete personal attendance history as a formal email with a PDF attachment.':'Send the complete crew attendance history across all events, from the earliest recorded activity to today.')+'</p></div><span class="kc-attendance-round-icon">✉</span></div><form id="attendanceReportForm" class="kc-attendance-report-form"><label><span>Send report to</span><input type="email" name="toEmail" value="'+esc(email)+'" '+(memberMode?'readonly':'required')+' placeholder="recipient@example.com"></label><button type="submit" class="kc-attendance-verify-btn">✉ Send full attendance report + PDF</button><p class="kc-attendance-note">'+(memberMode?'Your report contains your attendance across all events.':'Admins and Super Admins receive all recorded event and member attendance details.')+'</p></form></section>';
}

function memberAttendancePage(){
 const events=(S.events||[]).filter(e=>e&&e.registered);
 return '<main class="kc-attendance-home kc-member-attendance"><header class="kc-attendance-heading"><div><span class="kc-attendance-kicker">KINETIC CREW / YOUR RECORDS</span><h1>Your attendance <em>report.</em></h1><p>Get your complete attendance history across all Kinetic Crew events.</p></div><span class="kc-attendance-live"><i></i> MEMBER</span></header><section class="kc-attendance-next"><div class="kc-attendance-next-head"><span class="kc-attendance-kicker">ATTENDANCE HISTORY</span><span class="kc-attendance-event-count">'+events.length+' EVENTS</span></div><div class="kc-attendance-event-meta"><b>All your recorded events</b><small>From your earliest recorded crew activity through today</small></div></section>'+attendanceReportCard(true)+'</main>';
}

function socialEmbed(url){
 try{
  const u=new URL(url),host=u.hostname.toLowerCase().replace(/^www\./,'');
  let id='';
  if(host==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';
  else if(['youtube.com','m.youtube.com'].includes(host)){
   id=u.searchParams.get('v')||'';
   if(!id){const parts=u.pathname.split('/').filter(Boolean),marker=parts.findIndex(p=>p==='shorts'||p==='embed');if(marker>=0)id=parts[marker+1]||'';}
  }
  if(id&&/^[a-zA-Z0-9_-]{6,20}$/.test(id))return '<div class="social-embed social-embed-video"><iframe src="https://www.youtube-nocookie.com/embed/'+esc(id)+'" title="Shared crew video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
  if(host==='instagram.com'&&/^\/(p|reel|tv)\/[A-Za-z0-9_-]+/.test(u.pathname))return '<div class="social-embed social-embed-instagram kg-instagram-video-only"><iframe src="https://www.instagram.com'+esc(u.pathname.replace(/\/$/,'')+'/embed')+'" title="Shared crew video" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe></div>';
  if(host==='tiktok.com'||host==='m.tiktok.com'){
   const match=u.pathname.match(/\/video\/(\d+)/);if(match)return '<div class="social-embed social-embed-tiktok"><iframe src="https://www.tiktok.com/player/v1/'+match[1]+'?music_info=1&description=1" title="Shared crew video" loading="lazy" allow="fullscreen" allowfullscreen></iframe></div>';
  }
 }catch{}
 return '';
}

async function loadSocialFeed(){
 const posts=await client.from('crew_social_posts').select('*').order('created_at',{ascending:false}).limit(40);
 if(posts.error)throw posts.error;
 const rows=posts.data||[],ids=rows.map(post=>post.id),uid=String(S.user?.auth_id||'');
 const [likes,comments,people,storyResult,messageResult]=await Promise.all([
  ids.length?client.from('crew_social_likes').select('post_id,user_id').in('post_id',ids):Promise.resolve({data:[],error:null}),
  ids.length?client.from('crew_social_comments').select('*').in('post_id',ids).order('created_at',{ascending:true}).limit(150):Promise.resolve({data:[],error:null}),
  rpc('crew_profile_directory',{}),
  client.from('crew_social_stories').select('*').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60),
  uid?client.from('crew_direct_messages').select('id,sender_id,recipient_id,body,created_at,read_at').or('sender_id.eq.'+uid+',recipient_id.eq.'+uid).order('created_at',{ascending:false}).limit(250):Promise.resolve({data:[],error:null})
 ]);
 for(const result of [likes,comments,people,storyResult,messageResult])if(result.error)throw result.error;
 const storyRows=storyResult.data||[];
 const mediaPaths=[...new Set([...rows.map(post=>post.storage_path),...storyRows.map(story=>story.storage_path)].filter(Boolean))];
 const signedByPath=new Map();
 if(mediaPaths.length){
  const {data:signedRows,error:signedError}=await client.storage.from('crew-gram-media').createSignedUrls(mediaPaths,3600);
  if(signedError)console.warn('Kinetic Gram media signing was deferred:',signedError);
  else (signedRows||[]).forEach(item=>{const url=item?.signedUrl||item?.signedURL||item?.signed_url;if(item?.path&&url)signedByPath.set(item.path,url);});
  for(const path of mediaPaths){if(signedByPath.has(path))continue;try{const {data:single,error:singleError}=await client.storage.from('crew-gram-media').createSignedUrl(path,3600);if(!singleError&&single?.signedUrl)signedByPath.set(path,single.signedUrl);}catch(signError){console.warn('Kinetic Gram fallback signing failed:',signError);}}
 }
 S.socialPosts=rows.map(post=>({...post,signed_media_url:signedByPath.get(post.storage_path)||''}));
 S.socialLikes=likes.data||[];S.socialComments=comments.data||[];
 S.publicMembers=Array.isArray(people.data)?people.data:[];
 S.socialStories=storyRows.map(story=>({...story,signed_media_url:story.storage_path?(signedByPath.get(story.storage_path)||''):story.media_url||''}));
 S.gramMessages=messageResult.data||[];
 updateHomeOnlineCrew();
}

function socialPostCard(post){
 const people=S.publicMembers||[],author=people.find(m=>String(m.auth_id)===String(post.author_id))||{name:post.author_id===S.user.auth_id?S.user.name:'Crew member',role:'member'};
 const url=safeSocialUrl(post.link_url),host=url?new URL(url).hostname.replace(/^www[.]/,''):'Shared link';
 const likes=S.socialLikes.filter(l=>String(l.post_id)===String(post.id)),liked=likes.some(l=>String(l.user_id)===String(S.user.auth_id));
 const comments=S.socialComments.filter(c=>String(c.post_id)===String(post.id));
 const owned=String(post.author_id)===String(S.user.auth_id);
 const commentMarkup=comments.map(c=>{const person=people.find(m=>String(m.auth_id)===String(c.user_id))||{name:'Crew member'};return '<article class="social-comment"><b>'+esc(person.name)+'</b><p>'+esc(c.body)+'</p><time>'+esc(dt(c.created_at))+'</time></article>';}).join('');
 return '<article class="surface social-post-card" data-social-post="'+esc(post.id)+'"><header class="social-post-head">'+avatarMarkup(author,'social-author-avatar')+'<div><b>'+esc(author.name||'Crew member')+'</b><small>'+esc(role(author.role))+' · '+esc(dt(post.created_at))+'</small></div>'+(owned||admin()?'<button type="button" class="social-delete" data-social-delete="'+esc(post.id)+'" aria-label="Delete post">×</button>':'')+'</header>'+
 (post.caption?'<p class="social-post-caption">'+esc(post.caption)+'</p>':'')+
 (post.signed_media_url?(String(post.media_mime_type||'').startsWith('video/')?'<video class="kg-post-media" src="'+esc(post.signed_media_url)+'" controls playsinline preload="none"></video>':'<img class="kg-post-media" src="'+esc(post.signed_media_url)+'" alt="Crew post" loading="lazy">'):(url?socialEmbed(url):'<div class="social-invalid-link">This post has no media.</div>'))+
 '<div class="social-post-stats"><span>'+likes.length+' '+(likes.length===1?'like':'likes')+'</span><span>'+comments.length+' '+(comments.length===1?'comment':'comments')+'</span></div>'+
 '<div class="social-post-actions"><button type="button" class="'+(liked?'social-action liked':'social-action')+'" data-social-like="'+esc(post.id)+'" data-liked="'+(liked?'true':'false')+'">'+(liked?'♥ Liked':'♡ Like')+'</button><button type="button" class="social-action" data-social-comments-toggle="'+esc(post.id)+'">▢ Comment</button><button type="button" class="social-action" data-social-share="'+esc(post.id)+'">↗ Share</button></div>'+
 '<section class="social-comments" data-social-comments="'+esc(post.id)+'" hidden><div class="social-comments-list">'+(commentMarkup||'<p class="social-no-comments">Start the conversation.</p>')+'</div><form class="social-comment-form" data-social-comment-form="'+esc(post.id)+'"><input name="body" maxlength="800" required placeholder="Write a comment…"><button type="submit" aria-label="Send comment">➤</button></form></section></article>';
}

function featureForm(key){
 const meta=(window.KC_FEATURE_META&&window.KC_FEATURE_META[key])||[featureLabels[key]||'Crew feature','Share an update with your crew.','Title','Details','Publish'],isPoll=key==='polls',isLeave=key==='leave',isExpense=key==='expenses',isAudition=key==='auditions',isMemory=key==='memories',isChat=key==='chat',isRehearsal=key==='rehearsals',isAchievement=key==='achievements';
 if(isPoll)return '<form class="surface feature-form kc-poll-builder" data-feature-form="polls">'+
 '<div class="kc-poll-builder-top"><span class="kc-poll-builder-icon">◉</span><div><span class="kc-poll-eyebrow">CREW VOTING</span><h2>Create a poll</h2><p>Ask one clear question and let everyone choose an answer.</p></div></div>'+
 '<label class="field kc-poll-question-field"><span>Your question</span><input name="title" maxlength="160" required placeholder="What should we decide?"></label>'+
 '<label class="field kc-poll-mode-field"><span>Voting type</span><select name="selection_mode"><option value="single">Single choice · Select one answer</option><option value="multiple">Multiple choice · Select more than one</option></select></label>'+'<div class="kc-poll-options-editor"><div class="kc-poll-options-title"><b>Answer options</b><small>At least 2 · Up to 10</small></div>'+
 '<div class="kc-poll-option-inputs"><label class="kc-poll-option-input"><span>1</span><input name="poll_option" maxlength="120" required placeholder="Option 1"></label><label class="kc-poll-option-input"><span>2</span><input name="poll_option" maxlength="120" required placeholder="Option 2"></label></div>'+
 '<button type="button" class="kc-poll-add-option" data-poll-add-option>＋ Add option</button></div>'+
 '<div class="kc-poll-settings"><span class="kc-poll-settings-icon">↻</span><span><b>Change vote</b><small>Members can update their choice until the poll closes.</small></span><span class="kc-poll-setting-state">ON</span></div>'+
 '<input type="hidden" name="body" value=""><button class="primary full kc-poll-publish" type="submit">Publish poll <span>→</span></button></form>';
 return '<form class="surface feature-form" data-feature-form="'+key+'">'+formTitle('✦',meta[0],meta[1])+(isChat?'<input type="hidden" name="title" value="Crew message">':'<label class="field">'+meta[2]+'<input name="title" maxlength="160" required placeholder="'+meta[2]+'"></label>')+'<label class="field">'+meta[3]+'<textarea name="body" rows="3" maxlength="5000" '+(isChat?'required':'')+' placeholder="'+(isExpense?'e.g. ₹1200 · costumes · event name':isMemory?'Add a caption for this memory…':isAudition?'Dance style, applicant details and video URL':isLeave?'Dates and reason':isChat?'Message the crew…':'Add useful details…')+'"></textarea></label>'+

 (isLeave?'<label class="field">From<input name="from_date" type="date" required></label><label class="field">To<input name="to_date" type="date" required></label>':'')+
 (isRehearsal?'<label class="field">Date & time<input name="session_at" type="datetime-local" required></label><label class="field">Location<input name="location" maxlength="160" placeholder="Practice room / studio"></label><label class="field span2 kc-email-optin"><span><input name="send_email" type="checkbox" value="true" checked> Email all approved crew members</span><small>Send rehearsal details by email as well as the in-app notification.</small></label>':'')+
 
 (isAudition?'<label class="field">Dance style<input name="style" maxlength="80" placeholder="Hip-hop / freestyle / classical"></label><label class="field">Audition video URL<input name="media_url" type="url" placeholder="https://…"></label>':'')+
 (isMemory?'<section class="memory-media-composer"><button type="button" class="memory-add-media" data-memory-add-media><span>＋</span><b>Add photo or link</b></button><div class="memory-media-options" hidden><button type="button" data-memory-pick-photo>📷 Choose from device</button><button type="button" data-memory-add-link>↗ Add image link</button></div><input class="memory-file-input" name="memory_photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden><div class="memory-link-entry" hidden><input name="media_url" type="url" inputmode="url" placeholder="Paste HTTPS image link"><button type="button" data-memory-confirm-link>Attach link</button></div><div class="memory-media-preview" hidden><img alt="Memory media preview"><div><span data-memory-preview-label>Attached photo</span><button type="button" data-memory-remove-media aria-label="Remove attachment">×</button></div></div><small class="memory-media-hint">JPG, PNG, WEBP or GIF · max 15 MB</small></section>':'')+'<button class="primary full">'+meta[4]+' →</button></form>';
}


function openKcMemoryViewer(src){
 const existing=document.getElementById('kcMemoryViewer');if(existing)existing.remove();
 const layer=document.createElement('div');layer.id='kcMemoryViewer';layer.className='kc-memory-viewer';layer.innerHTML='<button type="button" class="kc-memory-viewer-close" aria-label="Close photo">×</button><div class="kc-memory-viewer-stage"><img src="'+esc(src)+'" alt="Memory photo"></div><small>Pinch to zoom · Drag to move · Double tap to zoom</small>';document.body.appendChild(layer);
 const img=layer.querySelector('img'),stage=layer.querySelector('.kc-memory-viewer-stage');let scale=1,tx=0,ty=0,start=null,pointers=new Map(),startDistance=0,startScale=1,lastTap=0;
 const apply=()=>{img.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';};
 const distance=()=>{const p=[...pointers.values()];return p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;};
 stage.addEventListener('pointerdown',e=>{stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)start={x:e.clientX,y:e.clientY,tx,ty};else{startDistance=distance();startScale=scale;}});
 stage.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>1){scale=Math.max(1,Math.min(4,startScale*distance()/Math.max(1,startDistance)));apply();}else if(start&&scale>1){tx=start.tx+e.clientX-start.x;ty=start.ty+e.clientY-start.y;apply();}});
 const release=e=>{pointers.delete(e.pointerId);if(pointers.size<2)startDistance=0;if(!pointers.size)start=null;};stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
 stage.addEventListener('dblclick',()=>{scale=scale>1?1:2;tx=ty=0;apply();});
 layer.addEventListener('click',e=>{if(e.target===layer||e.target.closest('.kc-memory-viewer-close'))layer.remove();});
 const escKey=e=>{if(e.key==='Escape'){layer.remove();document.removeEventListener('keydown',escKey);}};document.addEventListener('keydown',escKey);
}

function featureCard(key,item){
 const data=item.data||{},status=item.status||'open';
 let extra='';
 if(key==='polls'){
   const opts=String(item.body||'').split(',').map(x=>x.trim()).filter(Boolean),multiple=item.data?.selection_mode==='multiple';
   extra='<div class="poll-options kc-poll-choice-list" data-poll-choice-list="'+esc(item.id)+'" data-multiple="'+(multiple?'true':'false')+'">'+opts.map(o=>'<button type="button" class="kc-poll-choice '+(multiple?'is-multiple':'')+'" data-vote-id="'+esc(item.id)+'" data-choice="'+esc(o)+'" '+(status==='open'?'':'disabled')+'>'+ (multiple?'<span class="kc-poll-choice-mark" aria-hidden="true">✓</span>':'') +'<span>'+esc(o)+'</span></button>').join('')+'</div>'+(multiple&&status==='open'?'<button type="button" class="primary full kc-poll-submit-vote" data-poll-submit="'+esc(item.id)+'">Submit vote →</button>':'')+'<button type="button" class="textlink" data-poll-results="'+esc(item.id)+'">View results</button>'+(admin()&&status==='open'?'<button type="button" class="textlink" data-moderate="'+esc(item.id)+'" data-status="closed" data-feature="polls">Close poll</button>':'');
 }
 if(key==='leave'||key==='auditions'){
   extra='<div class="feature-status">Status: <b>'+esc(status.toUpperCase())+'</b></div>';
   if(admin()&&status==='pending')extra+='<div class="feature-actions"><button class="outline" data-moderate="'+esc(item.id)+'" data-status="approved" data-feature="'+key+'">Approve</button><button class="outline" data-moderate="'+esc(item.id)+'" data-status="rejected" data-feature="'+key+'">Reject</button></div>';
   if(admin()&&key==='auditions'&&status==='open')extra+='<div class="feature-actions"><button class="outline" data-moderate="'+esc(item.id)+'" data-status="selected" data-feature="'+key+'">Select</button><button class="outline" data-moderate="'+esc(item.id)+'" data-status="rejected" data-feature="'+key+'">Not selected</button></div>';
 }
 
 const mediaValue=data.signed_media_url||data.media_url||data.image_url||data.photo_url||data.image||data.photo;
 if(mediaValue){const media=String(mediaValue),safe=esc(media),isImage=String(data.media_type||'').startsWith('image/')||/\.(jpe?g|png|gif|webp|avif)(\?.*)?($|#)/i.test(media);if(isImage)extra+='<button type="button" class="feature-media-link kc-memory-zoom-trigger" data-memory-zoom="'+safe+'" aria-label="Open memory photo"><img class="feature-media-preview" src="'+safe+'" alt="'+esc(item.title)+'" loading="lazy" decoding="async" onerror="this.closest(\'button\').classList.add(\'media-unavailable\');this.remove();"><span>Tap to view · Pinch to zoom ⤢</span></button>';else if(/\.(mp4|webm|ogg)(\?.*)?$/i.test(media))extra+='<video class="feature-video-preview" src="'+safe+'" controls preload="metadata" playsinline></video>';else extra+='<p><a class="feature-link" href="'+safe+'" target="_blank" rel="noopener">Open shared media ↗</a></p>';}
 if(data.from_date)extra+='<p class="feature-meta">'+esc(data.from_date)+' → '+esc(data.to_date||data.from_date)+'</p>';
 if(key==='rehearsals'){if(data.session_at)extra+='<p class="feature-meta">◷ '+esc(dt(data.session_at))+' · '+esc(data.location||'Location TBA')+'</p>';if(status==='postponed')extra+='<div class="feature-status">This rehearsal has been postponed.</div>';if(status==='cancelled')extra+='<div class="feature-status">This rehearsal has been cancelled.</div>';if(admin())extra+='<div class="feature-actions"><button type="button" class="outline" data-rehearsal-status="'+esc(item.id)+'" data-status="open">Scheduled</button><button type="button" class="outline" data-rehearsal-status="'+esc(item.id)+'" data-status="postponed">Postpone</button><button type="button" class="outline danger-link" data-rehearsal-status="'+esc(item.id)+'" data-status="cancelled">Cancel</button></div>';}
 if(key==='rehearsals'&&status==='open'&&data.session_at&&new Date(data.session_at).getTime()>Date.now()){
  extra+='<div class="feature-actions"><span class="feature-meta">'+Number(item.registration_count||0)+' registered</span><button type="button" class="outline" data-rehearsal-register="'+esc(item.id)+'" data-registered="'+(item.registered?'true':'false')+'">'+(item.registered?'Cancel registration':'Register for rehearsal')+'</button></div>';
 }
 
 if(key==='memories'&&!mediaValue)extra+='<div class="kc-memory-no-media"><span>✦</span><b>CREW MEMORY</b><small>A moment worth remembering</small></div>';
 if(key==='memories'){
  const social=item.social||{},comments=Array.isArray(social.comments)?social.comments:[];
  extra+='<section class="kc-memory-social"><button type="button" class="kc-memory-like '+(social.liked?'is-liked':'')+'" data-memory-like="'+esc(item.id)+'" aria-pressed="'+(social.liked?'true':'false')+'"><span>♥</span> <b>'+(social.liked?'Liked':'Like')+'</b> <small>'+Number(social.likes||0)+'</small></button><div class="kc-memory-comments">'+comments.slice(-3).map(c=>'<p><b>'+esc(c.author_name||'Crew member')+'</b> '+esc(c.body)+'</p>').join('')+'</div><form class="kc-memory-comment-form" data-memory-comment="'+esc(item.id)+'"><input name="comment" maxlength="1000" placeholder="Write a comment…" autocomplete="off" required><button type="submit" aria-label="Post comment">Post</button></form></section>';
 }
 return '<article class="surface feature-card '+(key==='memories'?'kc-memory-card':'')+'"><div class="feature-card-top"><span class="pill">'+esc(status)+'</span><small>'+esc(dt(item.created_at))+'</small></div><h3>'+esc(item.title)+'</h3>'+(item.body?'<p>'+esc(item.body)+'</p>':'')+extra+'<div class="feature-card-foot"><span>By '+esc(item.author_name||'Crew member')+'</span>'+(admin()||item.author_id===S.user.auth_id?'<button class="textlink" data-feature-delete="'+esc(item.id)+'" data-feature="'+key+'">Delete</button>':'')+'</div></article>';
}

function pollsPage(){
 const items=(S.featureItems.polls||[]).slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const selected=items.find(item=>String(item.id)===String(S.selectedPoll));
 const screen=S.pollScreen||'home';
 if(screen==='create')return welcome('Create Poll','Ask your crew a question and collect votes.')+'<button class="textlink kc-poll-back" data-poll-screen="home">← Back to Polls</button>'+featureForm('polls');
 if(screen==='list')return welcome('View Polls','Select a poll to see its response summary.')+'<button class="textlink kc-poll-back" data-poll-screen="home">← Back to Polls</button><div class="kc-poll-list">'+(items.map(item=>'<button type="button" class="surface kc-poll-list-item" data-poll-open="'+esc(item.id)+'"><span class="kc-poll-list-icon">▥</span><span class="kc-poll-list-copy"><b>'+esc(item.title)+'</b><small>By '+esc(item.author_name||'Crew member')+' · '+esc(dt(item.created_at))+'</small></span><span class="pill '+(item.status==='open'?'kc-poll-open':'')+'">'+esc(item.status==='open'?'Open':'Closed')+'</span><span>›</span></button>').join('')||empty('No polls yet','Published polls will appear here.'))+'</div>';
 if(screen==='summary'&&selected){
  const total=S.pollSummary.reduce((n,row)=>n+Number(row.votes||0),0);
  const options=String(selected.body||'').split(',').map(x=>x.trim()).filter(Boolean);
  return welcome('Poll Summary',selected.title)+'<button class="textlink kc-poll-back" data-poll-screen="list">← Back to View Polls</button><section class="surface kc-poll-summary"><div class="kc-poll-summary-head"><span class="pill '+(selected.status==='open'?'kc-poll-open':'')+'">'+esc(selected.status==='open'?'Open':'Closed')+'</span><small>'+esc(dt(selected.created_at))+'</small></div><h2>'+esc(selected.title)+'</h2><p>'+esc(selected.author_name||'Crew member')+'</p><div class="kc-poll-total"><b>'+total+'</b><span>Total responses</span></div><div class="kc-poll-results">'+options.map(option=>{const votes=Number(S.pollSummary.find(x=>x.choice===option)?.votes||0),pct=total?Math.round(votes/total*100):0;return '<div class="kc-poll-result"><div><b>'+esc(option)+'</b><span>'+votes+' · '+pct+'%</span></div><div class="kc-poll-track"><i style="width:'+pct+'%"></i></div></div>';}).join('')+'</div><button type="button" class="primary full" data-poll-details="'+esc(selected.id)+'">View Details · Respondents</button>'+(admin()&&selected.status==='open'?'<button type="button" class="outline full" data-moderate="'+esc(selected.id)+'" data-status="closed" data-feature="polls">Close Poll</button>':'')+'</section>';
 }
 if(screen==='details'&&selected)return welcome('Poll Respondents',selected.title)+'<button class="textlink kc-poll-back" data-poll-screen="summary">← Back to Summary</button><section class="surface kc-poll-summary"><p class="hint">Individual responses for this poll.</p><div class="kc-poll-respondents">'+(S.pollRespondents.map(row=>'<article class="kc-poll-respondent"><span class="kc-poll-avatar">'+esc(initials(row.name||'Crew member'))+'</span><span><b>'+esc(row.name||'Crew member')+'</b><small>'+esc(row.choice)+' · '+esc(dt(row.created_at))+'</small></span></article>').join('')||empty('No responses yet','Respondents will appear here after voting.'))+'</div></section>';
 return welcome('Polls','Create, manage, and view poll responses.')+'<div class="kc-poll-actions"><button type="button" class="surface kc-poll-action kc-poll-create" data-poll-screen="create"><span>＋</span><b>Create Poll</b><small>Ask something new</small></button><button type="button" class="surface kc-poll-action" data-poll-screen="list"><span>▥</span><b>View Polls</b><small>See all polls & results</small></button></div><section class="kc-poll-recent"><h2>Your Polls</h2>'+(items.slice(0,3).map(item=>'<button type="button" class="surface kc-poll-list-item" data-poll-open="'+esc(item.id)+'"><span class="kc-poll-list-icon">▥</span><span class="kc-poll-list-copy"><b>'+esc(item.title)+'</b><small>'+esc(dt(item.created_at))+'</small></span><span class="pill '+(item.status==='open'?'kc-poll-open':'')+'">'+esc(item.status==='open'?'Open':'Closed')+'</span><span>›</span></button>').join('')||empty('No polls yet','Create your first crew poll.'))+'</section>';
}
function featurePage(key){
 if(key==='polls')return pollsPage();
 const items=(S.featureItems[key]||[]).slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const canCreate=key==='memories'||key==='leave'||admin();
 const title=featureLabels[key]||'Crew feature';
 const descriptions={memories:'Relive performances, rehearsals and the moments in between.',leave:'Send a leave request to the crew admins.',rehearsals:'Practice plans and rehearsal details.',auditions:'Audition announcements and submissions.'};
 return welcome(title,descriptions[key]||'Everything happening across Kinetic Crew.')+(canCreate?featureForm(key):'')+'<div class="feature-feed">'+(items.map(item=>featureCard(key,item)).join('')||empty('Nothing here yet','New '+title.toLowerCase()+' will appear here.'))+'</div>';
}

let kcPresenceChannel=null,kcPresenceUserId='';
function updateHomeOnlineCrew(){
 const section=document.querySelector('.kc-home-online-crew');if(!section)return;
 const people=S.publicMembers||[],ids=[...new Set((S.onlineCrew||[]).map(String))].filter(id=>id!==String(S.user?.auth_id||''));
 const visible=ids.map(id=>people.find(p=>String(p.auth_id)===id)).filter(Boolean);
 section.hidden=!visible.length;
 const count=section.querySelector('.kc-online-count');if(count)count.textContent=String(visible.length);
 const rail=section.querySelector('.kc-fun-people-rail');if(rail)rail.innerHTML=visible.map(p=>'<button type="button" class="kc-fun-person is-online" data-open-profile="'+esc(p.auth_id)+'">'+avatarMarkup(p)+'<i class="kc-online-dot" aria-label="Online"></i><b>'+esc((p.name||'Crew').split(' ')[0])+'</b></button>').join('');
}
function startCrewPresence(){
 const id=String(S.user?.auth_id||S.user?.id||'');if(!id||!client?.channel||kcPresenceUserId===id)return;
 if(kcPresenceChannel){try{client.removeChannel(kcPresenceChannel);}catch{}kcPresenceChannel=null;}
 kcPresenceUserId=id;
 const channel=client.channel('kc-crew-online',{config:{presence:{key:id}}});kcPresenceChannel=channel;
 channel.on('presence',{event:'sync'},()=>{
  if(kcPresenceChannel!==channel)return;
  const state=channel.presenceState(),ids=[];
  Object.values(state||{}).forEach(entries=>(entries||[]).forEach(entry=>{const memberId=String(entry?.user_id||'');if(memberId)ids.push(memberId);}));
  S.onlineCrew=[...new Set(ids)];
  updateHomeOnlineCrew();
 });
 channel.subscribe(async status=>{
  if(status==='SUBSCRIBED'&&kcPresenceChannel===channel){
   try{await channel.track({user_id:id,online_at:new Date().toISOString()});}
   catch(error){console.warn('Crew live presence could not start:',error);}
  }
 });
}
window.addEventListener('pagehide',()=>{if(kcPresenceChannel){try{kcPresenceChannel.untrack();}catch{}}});
function home(){
 const now=Date.now(),all=[...(S.events||[])].filter(e=>e&&e.id&&e.title).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const upcoming=all.filter(e=>new Date(e.starts_at).getTime()>=now);
 const recentPublished=all.filter(e=>new Date(e.starts_at).getTime()<now).reverse();
 const registered=upcoming.filter(e=>e.registered),yourEvents=registered.length?registered:upcoming;
 const homeEvents=[...upcoming,...recentPublished].slice(0,10);
 const homeListEvents=upcoming.length?upcoming.slice(0,3):recentPublished.slice(0,3);
 const people=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(S.user?.auth_id)).slice(0,8);
 const onlinePeople=[...new Set((S.onlineCrew||[]).map(String))].filter(id=>id!==String(S.user?.auth_id||'')).map(id=>(S.publicMembers||[]).find(m=>String(m.auth_id)===id)).filter(Boolean);
 const u=S.user||{},name=(u.name||u.email||'Crew member').split('@')[0].split(' ')[0];
 const hour=new Date().getHours(),greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
 const homeMood=upcoming.length?'Your next crew moment is getting closer.':'Your space. Your people. Your next big moment.';
 const homePrompt=upcoming.length?'Find your next event, get ready, and make it count.':'Catch the latest energy from the crew and see what is coming next.';
 const announcements=[...(S.announcements||[])].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const rehearsals=[...(S.featureItems?.rehearsals||[])].filter(item=>{
  const when=item.data?.session_at;return when&&new Date(when).getTime()>=now;
 }).sort((a,b)=>new Date(a.data.session_at)-new Date(b.data.session_at));
 const photo=e=>safeSocialUrl(e?.cover_url||e?.image_url||e?.banner_url||e?.poster_url||e?.image||'');
 const category=e=>{
  const raw=String(e?.category||'').toLowerCase(),words=String((e?.category||'')+' '+(e?.title||'')+' '+(e?.description||'')).toLowerCase();
  if(/audition|tryout|selection/.test(words))return 'AUDITION';
  if(/rehearsal|practice/.test(words))return 'REHEARSAL';
  if(/performance|showcase|concert|flashmob|stage/.test(words))return 'PERFORMANCE';
  if(/workshop|class|training|masterclass/.test(words))return 'WORKSHOP';
  return raw?raw.toUpperCase():'CREW EVENT';
 };
 const slides=homeEvents.map(e=>({
  kind:'event',view:isRehearsalEvent(e)?'rehearsals':'events',mode:isRehearsalEvent(e)?'rehearsals':'events',id:e.id,startsAt:e.starts_at,
  title:e.title||'Crew event',description:e.description||e.details||e.short_description||'',location:e.location||e.venue||e.venue_name||e.address||'',image:photo(e),showCountdown:e.show_countdown!==false,eventDateLabel:(()=>{const d=new Date(e.starts_at);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(d):''})()
 }));
 if(!slides.length)slides.push({kind:'empty',view:'events',id:'no-upcoming-events',startsAt:null,title:'NO UPCOMING EVENTS',image:''});
 const pollItems=[...(S.featureItems?.polls||[])].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const updateItems=[...announcements.slice(0,2).map(a=>({kind:'announcement',created_at:a.created_at,item:a})),...(pollItems.length?[{kind:'poll',created_at:pollItems[0].created_at,item:pollItems[0]}]:[])].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
 const updates=updateItems.map((entry,i)=>{
  const item=entry.item;
  if(entry.kind==='poll'){
   const options=String(item.body||'').split(',').map(x=>x.trim()).filter(Boolean),closed=item.status!=='open',multiple=item.data?.selection_mode==='multiple';
   return '<article class="kc-exact-update kc-exact-poll-update"><div class="kc-exact-poll-head"><span class="kc-exact-update-icon">◉</span><span><b>Poll · '+esc(item.title||'Crew poll')+'</b><small>'+esc(closed?'Voting closed':(item.vote_count||0)+' votes · '+(multiple?'Choose any that apply':'Choose one answer'))+'</small></span><button type="button" class="kc-exact-poll-open" data-view="polls">Open ↗</button></div><div class="kc-home-poll-options kc-poll-choice-list" data-poll-choice-list="'+esc(item.id)+'" data-multiple="'+(multiple?'true':'false')+'">'+options.map(option=>'<button type="button" class="kc-poll-choice '+(multiple?'is-multiple':'')+'" data-vote-id="'+esc(item.id)+'" data-choice="'+esc(option)+'" '+(closed?'disabled':'')+'>'+(multiple?'<span class="kc-poll-choice-mark" aria-hidden="true">✓</span>':'')+'<span>'+esc(option)+'</span></button>').join('')+'</div>'+(multiple&&!closed?'<button type="button" class="primary full kc-poll-submit-vote" data-poll-submit="'+esc(item.id)+'">Submit vote →</button>':'')+'<button type="button" class="kc-exact-poll-results" data-poll-results="'+esc(item.id)+'">View results</button></article>';
  }
  return '<button class="kc-exact-update" data-view="notifications"><span class="kc-exact-update-icon">'+(['•','↗','▧'][i%3])+'</span><span><b>'+esc(item.title||'Crew update')+'</b><small>'+esc(item.body||item.message||'A new update from your crew')+'</small></span></button>';
 }).join('')||'<div class="kc-exact-update kc-exact-empty">Crew announcements, polls and rehearsal updates will appear here.</div>';
 const slideMarkup=slides.map((slide,i)=>{
  const image=safeSocialUrl(slide.image||''),hasImage=!!image;
  return '<article class="kc-home-feature-slide '+(i===0?'is-active ':'')+(hasImage?'has-image ':'no-image ')+(slide.kind==='event'?'kc-slide-event':'kc-slide-empty')+(slide.kind==='event'&&!slide.showCountdown?' kc-slide-no-countdown':'')+'" data-home-slide="'+i+'" data-event-id="'+esc(slide.id||'')+'" data-event-mode="'+esc(slide.mode||'events')+'" data-starts-at="'+esc(slide.startsAt||'')+'" aria-hidden="'+(i===0?'false':'true')+'">'+
   (hasImage?'<img class="kc-home-feature-image" src="'+esc(image)+'" alt="" aria-hidden="true" loading="eager" decoding="async">':'')+
   '<div class="kc-event-countdown-stage">'+
    '<div class="kc-countdown-watermark" aria-hidden="true">KC</div>'+
    '<div class="kc-event-countdown-content">'+
     (slide.kind==='event'&&slide.startsAt?'<div class="kc-event-countdown" data-event-countdown '+(slide.showCountdown?'':'hidden')+'>'+(slide.showCountdown?'<div class="kc-countdown-units"><span><b data-countdown-days>00</b><small>DAYS</small></span><i>:</i><span><b data-countdown-hours>00</b><small>HRS</small></span><i>:</i><span><b data-countdown-minutes>00</b><small>MIN</small></span><i>:</i><span><b data-countdown-seconds>00</b><small>SEC</small></span></div>':'')+'</div>':(slide.kind==='empty'?'<div class="kc-event-countdown is-empty"><strong>NO UPCOMING EVENTS</strong></div>':''))+
     (slide.kind==='event'?'<div class="kc-countdown-event-details"><b>'+esc(slide.title)+'</b>'+(slide.eventDateLabel?'<span>◷ &nbsp;'+esc(slide.eventDateLabel)+'</span>':'')+(slide.location?'<span>⌖ &nbsp;'+esc(slide.location)+'</span>':'')+(slide.description?'<small>'+esc(slide.description)+'</small>':'')+'<span class="kc-home-slide-cta">VIEW EVENT <i>↗</i></span></div>':'')+
    '</div>'+
   '</div>'+
  '</article>';
 }).join('');
 return '<div class="kc-exact-home kc-home-reference">'+
 '<header class="kc-home-reference-header"><div class="kc-home-user"><span><small>YOUR KINETIC CREW SPACE</small><b>Welcome back, '+esc(name)+'</b></span></div><button type="button" class="kc-home-theme-toggle" data-theme-toggle aria-label="Switch colour theme" title="Switch colour theme"><span aria-hidden="true">'+(document.documentElement.dataset.theme==='dark'?'☀':'☾')+'</span></button></header>'+
 '<section class="kc-home-greeting"><div class="kc-home-greeting-copy"><h1>'+greeting+', <em>'+esc(name)+'.</em></h1><p class="kc-home-greeting-lead">'+esc(homeMood)+'</p><small class="kc-home-greeting-sub">'+esc(homePrompt)+'</small></div><div class="kc-home-greeting-mark" aria-label="Kinetic Crew logo">'+brandMarkMarkup('kc-home-greeting-logo')+'</div></section>'+
 +(S.profileCompletionPending?'<section class="kc-home-profile-pending" role="status"><div><b>Profile completion pending</b><small>Finish your profile to complete your Kinetic Crew setup.</small></div><button type="button" data-view="profile">Complete profile →</button></section>':'')+
 
 '<section class="kc-home-featured" aria-label="Featured crew updates"><div class="kc-home-featured-track">'+slideMarkup+'</div>'+(slides.length>1?'<div class="kc-home-featured-dots" aria-label="Featured carousel pages">'+slides.map((_,i)=>'<button type="button" data-home-slide-to="'+i+'" class="'+(i===0?'active':'')+'" aria-label="Show slide '+(i+1)+'"></button>').join('')+'</div>':'')+'</section>'+
 '<section class="kc-home-reference-section kc-home-latest-section"><div class="kc-home-reference-section-head"><h2>Latest from your crew</h2><button type="button" data-view="notifications">See all <span>→</span></button></div><div class="kc-exact-update-row">'+updates+'</div></section>'+
 
  '<section class="kc-fun-people kc-home-online-crew" aria-label="Crew members online" '+(onlinePeople.length?'':'hidden')+'><div class="kc-fun-section-title"><div><small>LIVE PRESENCE</small><h2>Crew online <span class="kc-online-count">'+onlinePeople.length+'</span></h2></div></div><div class="kc-fun-people-rail">'+onlinePeople.map(p=>'<button type="button" class="kc-fun-person is-online" data-open-profile="'+esc(p.auth_id)+'">'+avatarMarkup(p)+'<i class="kc-online-dot" aria-label="Online"></i><b>'+esc((p.name||'Crew').split(' ')[0])+'</b></button>').join('')+'</div></section>'+
  '<div class="kc-fun-hub-foot">ONE CREW. MANY WAYS TO HAVE FUN. <span>✦</span></div>'+
 '</div>';
}
function morePage(){
const u=S.user||{};
const icon=(name)=>({
jobs:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></svg>',
events:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4m8-4v4M3 9h18"/><path d="m9 14 2 2 4-4"/></svg>',
people:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 7m2 3a6 6 0 0 1 3 5v2"/></svg>',
gigs:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v3m-5 2h10l3 4v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8l3-4Z"/><path d="M15 11c-.5-1.5-4-1.5-4 0s4 1 4 3-3.5 2-5 0m2-6v10"/></svg>',
bookmark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a2 2 0 0 1 2 2v17l-8-5-8 5V5a2 2 0 0 1 2-2Z"/></svg>',
meetings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M2 21v-2a6 6 0 0 1 12 0v2m1-6a5 5 0 0 1 7 4v2"/></svg>',
rehearsal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M3 9h3m-3 4h3"/></svg>',
polls:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m8 10V4m8 16v-7"/><path d="M2 20h20"/></svg>',
attendance:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 2v4m8-4v4M8 13l2.5 2.5L16 10"/></svg>',
chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.8-4.4a8 8 0 1 1 16.2-5.1Z"/><path d="M8 11h8m-8 4h5"/></svg>',
feed:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
announcements:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 13z"/><path d="M6 14l2 7h4l-2-6M21 10v6"/></svg>',
notifications:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
bank:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 9 10-6 10 6H2Zm2 2v8m5-8v8m6-8v8m5-8v8M2 21h20"/></svg>',
settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.9Z"/></svg>',
gift:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18v11H3zM2 6h20v4H2zM12 6v15"/><path d="M12 6H7a2.5 2.5 0 1 1 2.5-2.5C9.5 5 12 6 12 6Zm0 0h5a2.5 2.5 0 1 0-2.5-2.5C14.5 5 12 6 12 6Z"/></svg>',
bug:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Z"/><path d="M9 13h.01M15 13h.01M9 17h6M12 8V5m-4 3L6 6m10 2 2-2"/></svg>'
}[name]||'');
const pill=(view,key,label,disabled=false)=>'<button type="button" class="kc-more-pill '+(disabled?'is-disabled':'')+'" '+(disabled?'disabled':'data-view="'+view+'"')+'><span class="kc-more-pill-icon">'+icon(key)+'</span><b>'+label+'</b>'+(disabled?'<em>COMING SOON</em>':'')+'</button>';
const other=(view,key,label,disabled=false)=>'<button type="button" class="kc-more-other '+(disabled?'is-disabled':'')+'" '+(disabled?'disabled':'data-view="'+view+'"')+'><span class="kc-more-other-icon">'+icon(key)+'</span><b>'+label+'</b></button>';
return '<div class="kc-more-reference">'+
'<header class="kc-more-reference-header"><button type="button" class="kc-more-back" data-view="overview" aria-label="Back to home"><svg viewBox="0 0 24 24"><path d="m15 4-8 8 8 8"/></svg></button><h1><em>More</em></h1><span class="kc-more-spacer"></span></header>'+
'<div class="kc-more-logo-wrap kc-more-intro kc-more-reference-hero kc-more-event-ads-host" aria-label="One crew. One rhythm."><div class="kc-more-reference-hero-copy">ONE CREW.<br>ONE <em>RHYTHM.</em></div></div>'+
'<section class="kc-more-reference-group"><h2>My Crew</h2><div class="kc-more-reference-pills">'+
pill('events','events','Events')+
pill('rehearsals','rehearsal','Rehearsals')+pill('polls','polls','Polls & voting')+pill('attendance','attendance','Attendance')+
pill('people','people','Crew Members')+
pill('memories','bookmark','Memories')+
'</div></section>'+
(admin()?'<section class="kc-more-reference-group kc-more-admin-group"><h2>Crew administration</h2><div class="kc-more-reference-pills">'+
pill('crew-management','people','Crew Members & Roles')+
pill('member-requests','notifications','Pending Requests')+
'<button type="button" class="kc-more-pill" data-audition-admin><span class="kc-more-pill-icon">'+icon('gigs')+'</span><b>Audition Management</b><em>ADMIN</em></button>'+
(admin()?pill('kc-more-ads-admin','announcements','Promotions'):'')+
'</div></section>':'')+
'<section class="kc-more-reference-group kc-more-reference-others"><h2>More</h2><div class="kc-more-reference-others-grid">'+
other('updates','announcements','Announcements')+other('notifications','notifications','Notifications')+
other('profile','profile','My Profile')+other('settings','settings','Settings')+other('kc-connect','gift','Refer a Friend')+(superadmin()?other('kc-rewards-admin','gift','Rewards Management'):'')+
'</div></section>'+
'<button type="button" class="kc-more-signout" data-kc-signout><span>↗</span><b>Sign out</b><small>Sign out of this device</small></button>'+
'<div class="kc-more-reference-footer">Made for <span>✦</span> Kinetic Crew</div>'+
'<div class="kc-more-reference-watermark" aria-hidden="true">KC</div></div>';
}


function kcConnectPage(){
 return '<section class="kc-connect-page"><header class="kc-connect-hero"><span>ONE CREW · MORE CONNECTIONS</span><h1>KC <em>Connect</em></h1><p>Bring your friends into the movement. Every member has a personal invite identity.</p></header><div id="kcConnectLoading" class="kc-connect-loading"><span class="kc-connect-spinner"></span><b>Preparing your personal invite…</b></div><div id="kcConnectDashboard" hidden></div></section>';
}
let kcConnectRequest=0;
async function loadKCConnectDashboard(){
 const root=document.getElementById('kcConnectDashboard'),loading=document.getElementById('kcConnectLoading');
 if(!root||!loading||!S.user)return;
 const request=++kcConnectRequest;
 try{
  const [refResult,rewardResult]=await Promise.all([rpc('crew_referral_get_dashboard',{}),rpc('crew_rewards_member_get',{})]);
  if(refResult.error)throw refResult.error;if(rewardResult.error)throw rewardResult.error;
  const data=refResult.data,rewards=rewardResult.data;
  if(request!==kcConnectRequest||S.view!=='kc-connect'||!root.isConnected)return;
  if(!data?.ok||!data.code)throw Error('Your personal referral code could not be created.');
  const code=String(data.code),landing=new URL(window.kcPath('kc-connect.html'),location.href);landing.searchParams.set('ref',code);
  const url=landing.toString(),badges=Array.isArray(data.badges)?data.badges:[],referrals=Array.isArray(data.referrals)?data.referrals:[];
  const tiers=[['connector','KC Connector','1 approved referral'],['influencer','KC Influencer','3 approved referrals'],['ambassador','KC Ambassador','5 approved referrals']];
  const badgeCards=tiers.map(t=>{const earned=badges.some(b=>b.id===t[0]);return '<article class="'+(earned?'earned':'locked')+'"><span>'+(earned?'✦':'◇')+'</span><b>'+t[1]+'</b><small>'+t[2]+'</small><em>'+(earned?'UNLOCKED':'LOCKED')+'</em></article>';}).join('');
  const referralRows=referrals.map(item=>'<article><span class="kc-connect-referral-avatar">'+esc((item.name||'KC').trim().slice(0,1).toUpperCase())+'</span><div><b>'+esc(item.name||'New applicant')+'</b><small>'+new Date(item.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+'</small></div><em class="'+(item.status==='approved'?'approved':'pending')+'">'+(item.status==='approved'?'APPROVED':'PENDING')+'</em></article>').join('');
  const catalog=Array.isArray(rewards.catalog)?rewards.catalog:[],redemptions=Array.isArray(rewards.redemptions)?rewards.redemptions:[];
  const rewardCards=catalog.map(item=>{const stock=Number(item.available_quantity||0),available=stock>0;return '<article class="kc-reward-card"><div class="kc-reward-image">'+'<img src="'+esc(item.image_url||window.kcPath('kc-reward-image-fallback.svg'))+'" alt="'+esc(item.title)+'" loading="eager" decoding="async">'+'</div><div class="kc-reward-info"><small>'+(item.reward_type==='voucher'?'DIGITAL VOUCHER':'KC GIFT')+'</small><b>'+esc(item.title)+'</b><p>'+esc(item.description||'A reward from Kinetic Crew.')+'</p><strong>'+Number(item.points_cost).toLocaleString('en-IN')+' PTS</strong><small class="kc-reward-stock">'+(available?stock+' available':'Currently unavailable')+'</small>'+(item.reward_type==='gift'?'<input class="kc-reward-delivery" data-kc-delivery="'+esc(item.id)+'" placeholder="Delivery details (optional)" maxlength="1000">':'')+'<button type="button" data-kc-redeem="'+esc(item.id)+'" '+(available&&Number(rewards.points_balance)>=Number(item.points_cost)?'':'disabled')+'>'+(available?(Number(rewards.points_balance)>=Number(item.points_cost)?'Request redemption':'Not enough points'):'Out of stock')+'</button></div></article>';}).join('');
  const redemptionRows=redemptions.map(item=>'<article class="kc-redemption-row"><div><b>'+esc(item.reward_title||'KC Reward')+'</b><small>'+new Date(item.requested_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+' · '+Number(item.points_cost)+' pts</small>'+(item.voucher_code?'<code>'+esc(item.voucher_code)+'</code><button type="button" class="kc-voucher-copy" data-kc-copy-voucher="'+esc(item.voucher_code)+'">Copy voucher</button>':'')+(item.admin_note?'<small>Admin note: '+esc(item.admin_note)+'</small>':'')+'</div><em class="'+esc(item.status)+'">'+esc(item.status.toUpperCase())+'</em></article>').join('');
  root.innerHTML='<div class="kc-connect-code-card"><div class="kc-connect-code-head"><span>YOUR PERMANENT REFERRAL CODE</span><i>KC / ID</i></div><strong>'+esc(code)+'</strong><p>Your code stays yours. Share your invite link to bring friends into the movement.</p><div class="kc-connect-actions"><button type="button" data-kc-connect-share data-url="'+esc(url)+'">↗ Share invite</button><button type="button" data-kc-connect-copy data-url="'+esc(url)+'">▢ Copy link</button></div><div class="kc-connect-qr-wrap"><div id="kcConnectQr" aria-label="Your referral QR code"></div><small>SCAN TO JOIN KINETIC CREW</small></div></div><div class="kc-connect-stats"><article><small>INVITES</small><b>'+Number(data.total_referrals||0)+'</b></article><article><small>APPROVED</small><b>'+Number(data.approved_referrals||0)+'</b></article><article><small>KC POINTS</small><b>'+Number(rewards.points_balance||data.points||0)+'</b></article></div><section class="kc-connect-section"><div class="kc-connect-section-title"><div><small>YOUR RECOGNITION</small><h2>KC Achievements</h2></div><span>✦</span></div><div class="kc-connect-badges">'+badgeCards+'</div></section><section class="kc-connect-section"><div class="kc-connect-section-title"><div><small>INVITE ACTIVITY</small><h2>Your referrals</h2></div><span>'+referrals.length+'</span></div>'+(referrals.length?'<div class="kc-connect-referrals">'+referralRows+'</div>':'<div class="kc-connect-empty"><span>✧</span><b>Your crew story starts here.</b><small>Share your invite link to welcome your first friend.</small></div>')+'</section><section class="kc-connect-section kc-rewards-store"><div class="kc-connect-section-title"><div><small>POINTS THAT MOVE YOU</small><h2>KC Rewards Store</h2></div><span>🎁</span></div><p class="kc-rewards-intro">Use your approved referral points to request real gifts and vouchers. Redemptions are reviewed by the Super Admin.</p>'+(rewardCards?'<div class="kc-reward-grid">'+rewardCards+'</div>':'<div class="kc-connect-empty"><span>✦</span><b>New rewards are on the way.</b><small>The Super Admin will publish gifts and vouchers here.</small></div>')+'</section><section class="kc-connect-section"><div class="kc-connect-section-title"><div><small>YOUR REQUESTS</small><h2>Redemption history</h2></div><span>'+redemptions.length+'</span></div>'+(redemptions.length?'<div class="kc-redemption-list">'+redemptionRows+'</div>':'<div class="kc-connect-empty"><b>No redemptions yet.</b><small>Your gift and voucher requests will appear here.</small></div>')+'</section><p class="kc-connect-footnote">100 points are credited for each approved new member. Points are deducted only when the Super Admin approves a redemption.</p>';
  root.querySelectorAll('.kc-reward-image img').forEach(img=>{img.addEventListener('error',()=>{if(img.dataset.fallbackApplied==='yes')return;img.dataset.fallbackApplied='yes';img.src=window.kcPath('kc-reward-image-fallback.svg');img.alt='Reward image';},{once:true});});
  const typeField=document.getElementById('kcRewardType');if(typeField){const voucher=typeField.value==='voucher';const qtyWrap=document.getElementById('kcRewardQuantityWrap'),codesWrap=document.getElementById('kcRewardVouchersWrap');if(qtyWrap)qtyWrap.hidden=voucher;if(codesWrap)codesWrap.hidden=!voucher;}loading.hidden=true;root.hidden=false;
  const qr=document.getElementById('kcConnectQr');if(qr&&window.QRCode)new QRCode(qr,{text:url,width:168,height:168,colorDark:'#18151b',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});else if(qr)qr.textContent='QR code is loading. Use Copy link instead.';
 }catch(error){if(request!==kcConnectRequest||!root.isConnected)return;loading.innerHTML='<b>Could not load KC Connect</b><small>'+esc(error.message||'Please retry when your connection is stable.')+'</small><button type="button" data-kc-connect-retry>Try again</button>';}
}
function kcRewardsAdminPage(){
 if(!superadmin())return empty('Super Admin access required','Only the Super Admin can configure rewards, approve redemptions and adjust KC points.');
 return '<section class="kc-rewards-admin"><header class="kc-rewards-admin-hero"><span>SUPER ADMIN · KC CONNECT</span><h1>Rewards <em>Control</em></h1><p>Publish gifts and vouchers, set point prices, manage inventory and review member redemption requests.</p></header><div id="kcRewardsAdminLoading" class="kc-connect-loading"><span class="kc-connect-spinner"></span><b>Loading rewards management…</b></div><div id="kcRewardsAdminContent" hidden></div></section>';
}
let kcRewardsAdminRequest=0;
function setKCRewardsAdminTab(tab){
 const root=document.getElementById('kcRewardsAdminContent');if(!root)return;
 root.querySelectorAll('[data-kc-rewards-tab]').forEach(button=>{const active=button.dataset.kcRewardsTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
 root.querySelectorAll('[data-kc-rewards-panel]').forEach(panel=>{panel.hidden=panel.dataset.kcRewardsPanel!==tab;});
 try{sessionStorage.setItem('kc-rewards-admin-tab',tab);}catch{}
}
async function loadKCRewardsAdmin(){
 const root=document.getElementById('kcRewardsAdminContent'),loading=document.getElementById('kcRewardsAdminLoading');if(!root||!loading||!superadmin())return;
 const request=++kcRewardsAdminRequest;
 try{
  const result=await rpc('crew_rewards_admin_get',{});if(result.error)throw result.error;const data=result.data;
  if(request!==kcRewardsAdminRequest||S.view!=='kc-rewards-admin'||!root.isConnected)return;
  const catalog=Array.isArray(data.catalog)?data.catalog:[],redemptions=Array.isArray(data.redemptions)?data.redemptions:[];
  const members=(S.members||[]).filter(m=>m.approval_status==='approved'||m.role==='member'||m.role==='admin'||m.role==='super_admin');
  const rewardRows=catalog.map(r=>'<article class="kc-admin-reward-row"><div><b>'+esc(r.title)+'</b><small>'+esc(r.reward_type.toUpperCase())+' · '+Number(r.points_cost)+' pts · '+(r.reward_type==='voucher'?Number(r.available_vouchers)+' voucher codes':Number(r.quantity_available)+' stock')+'</small></div><em class="'+(r.is_active?'active':'inactive')+'">'+(r.is_active?'ACTIVE':'INACTIVE')+'</em><button type="button" data-kc-reward-edit="'+esc(r.id)+'">Edit</button></article>').join('');
  const redemptionRows=redemptions.map(d=>'<article class="kc-admin-redemption" data-kc-redemption-row="'+esc(d.id)+'"><div class="kc-admin-redemption-head"><div><b>'+esc(d.member_name||'Crew member')+'</b><small>'+esc(d.member_email||d.member_username||'')+' · '+esc(d.reward_title)+' · '+Number(d.points_cost)+' pts</small></div><em class="'+esc(d.status)+'">'+esc(d.status.toUpperCase())+'</em></div>'+(d.delivery_details?'<p><b>Delivery details:</b> '+esc(d.delivery_details)+'</p>':'')+(d.voucher_code?'<p><b>Issued voucher:</b> <code>'+esc(d.voucher_code)+'</code></p>':'')+'<textarea data-kc-admin-note placeholder="Optional note to member" rows="2">'+esc(d.admin_note||'')+'</textarea><div class="kc-admin-redemption-actions">'+(d.status==='pending'?'<button type="button" data-kc-redemption-action="approved" data-id="'+esc(d.id)+'">Approve</button><button type="button" class="secondary" data-kc-redemption-action="rejected" data-id="'+esc(d.id)+'">Reject</button>':d.status==='approved'?'<button type="button" data-kc-redemption-action="fulfilled" data-id="'+esc(d.id)+'">Mark fulfilled</button>':'')+'</div></article>').join('');
  root.innerHTML='<nav class="kc-rewards-admin-tabs" aria-label="Rewards management sections">'+[['create','Create reward'],['inventory','Inventory'],['requests','Redemptions'],['points','Member points']].map(([key,label])=>'<button type="button" data-kc-rewards-tab="'+key+'" class="'+(key==='create'?'active':'')+'">'+label+'</button>').join('')+'</nav>'+
  '<section class="kc-rewards-admin-panel kc-rewards-admin-section" data-kc-rewards-panel="create"><div class="kc-rewards-admin-title"><div><small>REWARD CATALOGUE</small><h2>Create or edit a reward</h2></div><span>'+catalog.length+' items</span></div><form id="kcRewardForm" class="kc-reward-admin-form"><input type="hidden" id="kcRewardEditId"><div class="kc-reward-admin-fields"><label>Reward name<input id="kcRewardTitle" required maxlength="90" placeholder="e.g. KC Limited Edition Tee"></label><label>Reward type<select id="kcRewardType"><option value="gift">Physical gift</option><option value="voucher">Voucher</option></select></label></div><label>Description<textarea id="kcRewardDescription" rows="2" placeholder="What will the member receive?"></textarea></label><div class="kc-reward-admin-fields"><label>Points price<input id="kcRewardPoints" type="number" min="1" required value="100"></label><label id="kcRewardQuantityWrap">Gift quantity<input id="kcRewardQuantity" type="number" min="0" value="0"></label></div><label>Reward image<input id="kcRewardImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><small>Upload the actual product image (JPG, PNG, WebP or GIF · max 5 MB).</small></label><label>Image URL <small>Optional direct image URL only — not a product page link.</small><input id="kcRewardImage" type="url" placeholder="https://…"></label><div id="kcRewardImagePreviewWrap" class="kc-reward-image-preview-wrap" hidden><img id="kcRewardImagePreview" alt="Reward image preview"></div><label id="kcRewardVouchersWrap" hidden>Available voucher codes <small>One code per line. Saving synchronizes the available inventory; already-issued codes remain in history.</small><textarea id="kcRewardVouchers" rows="3" placeholder="KC-VOUCHER-001&#10;KC-VOUCHER-002"></textarea></label><label class="kc-reward-active"><input id="kcRewardActive" type="checkbox" checked> Publish this reward in the member store</label><div class="kc-reward-admin-actions"><button type="submit">Save reward</button><button type="button" class="secondary" data-kc-reward-reset>Clear form</button></div></form></section>'+
  '<section class="kc-rewards-admin-panel kc-rewards-admin-section" data-kc-rewards-panel="inventory" hidden><div class="kc-rewards-admin-title"><div><small>LIVE INVENTORY</small><h2>Published rewards</h2></div><span>'+catalog.length+' items</span></div>'+(rewardRows?'<div class="kc-admin-reward-list">'+rewardRows+'</div>':'<p class="kc-admin-empty">No rewards have been published yet.</p>')+'</section>'+
  '<section class="kc-rewards-admin-panel kc-rewards-admin-section" data-kc-rewards-panel="requests" hidden><div class="kc-rewards-admin-title"><div><small>MEMBER REQUESTS</small><h2>Redemption approvals</h2></div><span>'+redemptions.filter(d=>d.status==='pending').length+' pending</span></div>'+(redemptionRows?'<div class="kc-admin-redemption-list">'+redemptionRows+'</div>':'<p class="kc-admin-empty">No redemption requests yet.</p>')+'</section>'+
  '<section class="kc-rewards-admin-panel kc-rewards-admin-section" data-kc-rewards-panel="points" hidden><div class="kc-rewards-admin-title"><div><small>MANUAL ADJUSTMENT</small><h2>Adjust member points</h2></div></div><form id="kcPointsForm" class="kc-reward-admin-form"><label>Member<select id="kcPointsMember" required><option value="">Select approved member</option>'+members.map(m=>'<option value="'+esc(m.auth_id)+'">'+esc(m.name||m.username||m.email)+' · '+esc(m.role||'member')+'</option>').join('')+'</select></label><div class="kc-reward-admin-fields"><label>Points change<input id="kcPointsDelta" type="number" required placeholder="e.g. 100 or -50"></label><label>Reason<input id="kcPointsReason" required minlength="3" maxlength="300" placeholder="Reason for adjustment"></label></div><button type="submit">Apply audited adjustment</button></form></section>';
  loading.hidden=true;root.hidden=false;
 }catch(error){if(request!==kcRewardsAdminRequest||!root.isConnected)return;loading.innerHTML='<b>Could not load rewards management</b><small>'+esc(error.message||'Please retry.')+'</small><button type="button" data-kc-rewards-admin-retry>Try again</button>';}
}

function meetPage(){
 return '<div class="kc-meet-page"><header class="kc-meet-hero"><span class="kc-meet-eyebrow">KINETIC CREW · CONNECT</span><div class="kc-meet-orbit" aria-hidden="true"><span>KC</span><i></i><i></i><i></i></div><h1>KC <em>Meet</em></h1><p>'+(admin()?'Host meetings, rehearsals and crew sessions.':'Join a live crew meeting using the code shared by your host.')+'</p><div class="kc-meet-actions">'+(admin()?'<button type="button" class="kc-meet-primary" data-kc-meet-create>＋ Start instant meeting</button>':'')+'<label class="kc-meet-join"><input id="kcMeetCode" maxlength="24" autocomplete="off" placeholder="Enter a meeting code" aria-label="Meeting code"><button type="button" data-kc-meet-join>Join</button></label></div></header>'+(admin()?'<button type="button" class="kc-meet-create-event-tile" data-kc-meet-schedule><span>◷</span><span><small>PLAN AHEAD</small><b>Create a KC Meet event</b><em>Schedule a date, invite your crew and manage who joins</em></span><i>↗</i></button>':'')+'<section class="kc-meet-scheduled-section"><div><span>UPCOMING</span><h2>Scheduled meeting events</h2><p>No tickets. No event registration. Just the invite link.</p></div><div id="kcMeetScheduledEvents" class="kcml-scheduled-grid"><p class="kcml-scheduled-empty">Loading scheduled meetings…</p></div></section><section class="kc-meet-info-grid"><article><span>▣</span><b>Video & audio</b><small>Meet face to face with your crew.</small></article><article><span>▤</span><b>Share your screen</b><small>Show choreography, plans and presentations.</small></article><article><span>♙</span><b>Approved crew access</b><small>Members can join; only admins and Super Admins can host.</small></article></section><section class="kc-meet-note"><b>How KC Meet works</b><p>Admins and Super Admins create and host meetings. Members join using the meeting code or invitation link. Your camera and microphone permissions are controlled by your device.</p></section></div>';
}
function isRehearsalEvent(event){return String(event?.category||'').trim().toLowerCase()==='rehearsals';}
function rehearsalsPage(){
 const originalMode=S.eventMode,originalFilter=S.eventsFilter,originalQuery=S.eventQuery;
 S.eventMode='rehearsals';S.eventsFilter=S.rehearsalFilter||'all';S.eventQuery=String(S.rehearsalQuery||'');
 let html=eventsPage();
 S.eventMode=originalMode;S.eventsFilter=originalFilter;S.eventQuery=originalQuery;
 html=html.replace('KINETIC CREW / LIVE EXPERIENCES','KINETIC CREW / PRACTICE SESSIONS')
  .replace('Find your <em>next moment.</em>','Train together. <em>Move as one.</em>')
  .replace('Discover what’s happening around your crew.','Plan practice sessions, reserve your place and stay in sync with the crew.')
  .replace('data-view="new-event">＋ Create event','data-view="new-rehearsal">＋ Schedule rehearsal')
  .replace('id="kceEventSearch"','id="kceRehearsalSearch"')
  .replace('Search concerts, workshops, events...','Search rehearsals, practice sessions, locations...')
  .replace('aria-label="Search concerts, workshops and events"','aria-label="Search rehearsals"')
  .replace('class="kce-events kce-nightpulse"','class="kce-events kce-nightpulse kce-rehearsal-mode"')
  .replace('data-event-filter="all"','data-event-filter="all" data-mode="rehearsals"')
  .replace('data-event-filter="tickets"','data-event-filter="tickets" data-mode="rehearsals"');
 html=html.replace(/<nav class="kce-tabs"[^>]*>[\s\S]*?<\/nav>/,'<nav class="kce-tabs" aria-label="Rehearsal filters"><button type="button" data-event-filter="all" data-mode="rehearsals" class="active" aria-pressed="true">Upcoming</button><button type="button" data-event-filter="tickets" data-mode="rehearsals" aria-pressed="false">My registrations</button><button type="button" data-event-filter="past" data-mode="rehearsals" aria-pressed="false">Past</button></nav>');
 html=html.replace(/<section class="kce-category-mosaic"[\s\S]*?<\/section>/,'').replace(/<button type="button" class="kce-meet-category-cta"[\s\S]*?<\/button>/,'');
 html=html.replace(/data-open-event="([^"]+)"/g,'data-open-event="$1" data-mode="rehearsals"');
 return html;
}
function eventsPage(){
 const now=Date.now(),all=[...(S.events||[])].filter(e=>S.eventMode==='rehearsals'?isRehearsalEvent(e):!isRehearsalEvent(e)).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)),upcoming=all.filter(e=>new Date(e.starts_at).getTime()>=now),registered=all.filter(e=>e.registered),past=all.filter(e=>new Date(e.starts_at).getTime()<now).reverse();
 const filter=S.eventsFilter||'all',query=String(S.eventQuery||'').trim().toLowerCase(),base=filter==='tickets'?registered:filter==='past'?past:filter==='all'?upcoming:upcoming.filter(e=>{const category=String(e.category||'').toLowerCase(),words=String((e.category||'')+' '+(e.title||'')+' '+(e.description||'')).toLowerCase();return filter==='auditions'?category==='auditions'||/audition|tryout|selection/.test(words):filter==='performances'?category==='performances'||/performance|showcase|concert|flashmob|stage/.test(words):filter==='workshops'?category==='workshops'||/workshop|class|training|masterclass/.test(words):filter==='rehearsals'?category==='rehearsals'||/rehearsal|practice/.test(words):filter==='other'?category==='other':category==='community'||/community|social|meet|festival|celebrat/.test(words);});
 const pool=base.filter(e=>!query||String((e.title||'')+' '+(e.category||'')+' '+(e.location||'')+' '+(e.description||'')).toLowerCase().includes(query));
 const featured=upcoming.find(e=>e.featured)||upcoming[0],image=e=>safeSocialUrl(e?.cover_url||e?.image_url||e?.banner_url||e?.poster_url||e?.image||'');
 const art=(e,kind='event')=>{const src=image(e),style=src?' style="background-image:linear-gradient(180deg,#090b0b05 20%,#090b0be8 100%),url('+JSON.stringify(src)+')"':'';return '<div class="kce-art kce-art-'+kind+'"'+style+'>'+(e&&e.event_status&&e.event_status!=='scheduled'?'<span class="pill kce-event-lifecycle">'+esc(e.event_status.toUpperCase())+'</span>':'')+(kind==='featured'?'':'<span class="kce-art-kicker">'+(e?esc(e.category||'KINETIC CREW'):'KINETIC CREW')+'</span>'+(e?'<b>'+esc(e.title)+'</b><small>'+esc(ds(e.starts_at))+' · '+esc(e.location||'Venue TBA')+'</small>':'<b>Make your next move.</b><small>Discover what’s happening with your crew.</small>'))+'</div>';};
 const cardUI=e=>filter==='tickets'?'<article class="kce-ticket-wallet-card"><button type="button" class="kce-ticket-wallet-main" data-open-event="'+esc(e.id)+'">'+art(e,'ticket')+'<span class="kce-event-meta"><b>'+esc(e.title)+'</b><small>'+esc(dt(e.starts_at))+' · '+esc(e.location||'Location TBA')+'</small><span>✓ Registration confirmed <i>↗</i></span></span></button><button type="button" class="kce-wallet-qr" data-event-qr="'+esc(e.id)+'">View QR ticket <span>↗</span></button></article>':'<button type="button" class="kce-event-card" data-open-event="'+esc(e.id)+'">'+art(e)+'<span class="kce-event-meta"><b>'+esc(e.title)+'</b>'+eventUpdatedLabel(e)+'<small>'+esc(ds(e.starts_at))+' · '+esc(e.location||'Location TBA')+'</small><span>'+(e.registered?'✓ Ticket reserved':Number(e.registration_count||0)+' joined')+' <i>↗</i></span></span></button>';
 const tabs=[['auditions','Auditions'],['performances','Performances'],['workshops','Workshops'],['community','Community'],['other','Other'],['tickets','My tickets'],['past','Past']];
 return '<div class="kce-events kce-nightpulse">'+
 '<header class="kce-events-head"><div><span class="kce-eyebrow">KINETIC CREW / LIVE EXPERIENCES</span><h1>Find your <em>next moment.</em></h1><p>Discover what’s happening around your crew.</p></div><div class="kce-events-head-actions">'+(admin()?'<button type="button" class="kce-admin-event" data-view="new-event">＋ Create event</button>':'')+'<button type="button" class="kce-ticket-shortcut" data-event-filter="all">✦ Discover</button><button type="button" class="kce-ticket-shortcut" data-event-filter="tickets">▣ My tickets <b>'+registered.length+'</b></button></div></header>'+
 '<label class="kce-event-search"><input id="kceEventSearch" type="search" placeholder="Search concerts, workshops, events..." value="'+esc(S.eventQuery||'')+'" autocomplete="off" aria-label="Search concerts, workshops and events"></label>'+
 (featured&&filter==='all'&&!query?'<button type="button" class="kce-featured-event" data-open-event="'+esc(featured.id)+'">'+art(featured,'featured')+'<span class="kce-featured-info"><i>✦ FEATURED EXPERIENCE</i><b>'+esc(featured.title)+'</b><small>'+esc(dt(featured.starts_at))+' · '+esc(featured.location||'Venue to be announced')+'</small><strong>View event <span>↗</span></strong></span></button>':'')+
(filter==='all'&&!query?'<section class="kce-category-mosaic" aria-label="Explore event categories"><button type="button" class="kce-category kce-cat-performances" data-event-filter="performances"><i>♫</i><b>Concerts & Shows</b><small>Live performances</small></button><button type="button" class="kce-category kce-cat-workshops" data-event-filter="workshops"><i>✳</i><b>Workshops</b><small>Learn with the crew</small></button><button type="button" class="kce-category kce-cat-community" data-event-filter="community"><i>◎</i><b>Community</b><small>Meet your people</small></button><button type="button" class="kce-category kce-cat-auditions" data-event-filter="auditions"><i>✦</i><b>Auditions</b><small>Join the movement</small></button></section><button type="button" class="kce-meet-category-cta" data-view="meet"><span class="kc-meet-category-icon">KC</span><span><small>CREW CONNECTION</small><b>KC Meet</b><em>Start or join a live crew meeting</em></span><i>↗</i></button>':'')+
'<section id="kcMeetEventsSection" class="kc-meet-scheduled-section kce-live-connections" hidden><div><span>LIVE CONNECTIONS</span><h2>KC Meet events</h2><p>Join by invitation link. The host controls admission.</p></div><div id="kcMeetEventsScheduled" class="kcml-scheduled-grid"></div></section>'+
'<nav class="kce-tabs" aria-label="Event categories">'+tabs.map(([id,label])=>'<button type="button" data-event-filter="'+id+'" class="'+(filter===id?'active':'')+'" aria-pressed="'+(filter===id)+'">'+label+'</button>').join('')+'</nav>'+
'<div class="kce-discover-label"><div><span class="kce-eyebrow">'+(filter==='past'?'EVENT ARCHIVE':filter==='tickets'?'YOUR REGISTRATIONS':'DISCOVER THE CREW')+'</span><h2>'+(filter==='past'?'Past events':filter==='tickets'?'My tickets':filter==='all'?'Upcoming events':tabs.find(t=>t[0]===filter)?.[1]||'Events')+'</h2></div><span>'+pool.length+' '+(pool.length===1?'EVENT':'EVENTS')+'</span></div>'+
'<div class="kce-events-grid" id="kceEventsGrid">'+(pool.length?pool.map(cardUI).join(''):'<div class="kce-empty-state"><span>✦</span><b>'+(query?'No matching events':filter==='tickets'?'No tickets yet':filter==='past'?'No past events':'No events in this category yet')+'</b><small>'+(query?'Try another event name, category or venue.':filter==='tickets'?'Register for an event and your tickets will appear here.':'New crew events will appear here when they are published.')+'</small>'+(filter!=='all'&&!query?'<button type="button" data-event-filter="all">Browse all events</button>':'')+'</div>')+'</div>'+
 '</div>';
}

function chatPage(){
 const items=(S.featureItems.chat||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
 const messages=items.map(item=>'<article class="wa-message '+(item.author_id===S.user.auth_id?'mine':'theirs')+'"><small>'+esc(item.author_name||'Crew member')+'</small><p>'+esc(item.body||item.title)+'</p><time>'+esc(new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</time></article>').join('');
 return welcome('Crew chat','The crew group chat — quick messages, shared energy, one conversation.')+'<section class="wa-chat-shell"><header class="wa-chat-head"><div class="wa-chat-mark">KC</div><div><b>Kinetic Crew</b><small>'+items.length+' messages · Crew group</small></div><span class="wa-online"><i></i> LIVE</span></header><div class="wa-chat-messages" id="waMessages">'+(messages||'<div class="wa-empty">✳<b>Start the conversation</b><small>Your crew messages will appear here.</small></div>')+'</div><form class="wa-chat-compose" data-feature-form="chat"><input type="hidden" name="title" value="Crew message"><textarea name="body" rows="1" maxlength="5000" required placeholder="Message the crew…"></textarea><button class="wa-send" type="submit" aria-label="Send message">➤</button></form></section>';
}

function openGramCreate(){
 if(!S.user||S.user.role==='audition_participant'){notice('Kinetic Gram posting is available to approved crew members.');return;}
 $('#modalRoot').innerHTML='<div class="modalback" id="kgCreateBackdrop"><section class="modal kg-create-modal" role="dialog" aria-modal="true" aria-labelledby="kgCreateTitle"><button type="button" class="iconbutton modalclose" data-gram-create-close aria-label="Close">×</button><span class="eyebrow">KINETIC GRAM</span><h2 id="kgCreateTitle">Create something</h2><form id="gramCreateForm"><div class="kg-create-kind"><label><input type="radio" name="kind" value="story"><span>Story</span></label><label><input type="radio" name="kind" value="reel"><span>Reel</span></label><label><input type="radio" name="kind" value="post" checked><span>Post</span></label></div><label class="field"><span>Photo or video</span><input type="file" name="media" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" required></label><label class="field"><span>Caption</span><textarea name="caption" rows="3" maxlength="1200" placeholder="Write a caption…"></textarea></label><small>Stories disappear after 24 hours. Posts and reels stay on your crew feed.</small><button type="submit" class="primary">Share with crew ↗</button></form></section></div>';
 $('#kgCreateBackdrop')?.addEventListener('click',e=>{if(e.target.id==='kgCreateBackdrop')$('#modalRoot').innerHTML='';});
}
function socialFeedPage(){
 const posts=S.socialPosts||[],stories=S.socialStories||[],people=S.publicMembers||[],tab=S.gramTab||'home';
 window.__kcGramPosts=posts;window.__kcGramPeople=people;
 const tabs=[['home','Home'],['posts','Posts'],['reels','Reels'],['messages','Messages']];
 const nav='<nav class="kg-top-tabs" aria-label="Kinetic Gram navigation">'+tabs.map(([key,label])=>'<button type="button" data-gram-tab="'+key+'" class="'+(tab===key?'active':'')+'">'+label+'</button>').join('')+'</nav>';
 const create='<button type="button" class="kg-create-button" data-gram-create aria-label="Create story, reel or post">＋</button>';
 const header='<header class="kg-header"><h1>Kinetic <em>Gram</em></h1>'+create+'</header>';
 const storyRail='<section class="kg-stories"><div class="kg-story-row"><button type="button" class="kg-story-item" data-gram-create><span class="kg-story-avatar">'+avatarMarkup(S.user)+'</span><small>Your story</small></button>'+stories.map(st=>{const person=people.find(p=>String(p.auth_id)===String(st.author_id))||{name:'Crew member'};return '<button type="button" class="kg-story-item" data-gram-story-open="'+esc(st.id)+'"><span class="kg-story-ring"><img src="'+esc(st.signed_media_url||'')+'" alt="" loading="lazy"></span><small>'+esc((person.name||'Crew').split(' ')[0])+'</small></button>';}).join('')+'</div></section>';
 const empty='<section class="kg-empty"><div class="kg-empty-mark">✳</div><b>Your crew feed starts here</b><p>Share the first reel, performance or moment with everyone.</p></section>';
 let body='';
 if(tab==='messages'){
  const grouped=new Map();
  (S.gramMessages||[]).forEach(m=>{const other=String(m.sender_id)===String(S.user.auth_id)?m.recipient_id:m.sender_id;if(!grouped.has(other))grouped.set(other,m);});
  body='<section class="kg-inbox"><div class="kg-section-head"><h2>Messages</h2><span>PRIVATE CREW CHATS</span></div>'+(grouped.size?[...grouped.entries()].map(([id,m])=>{const person=people.find(p=>String(p.auth_id)===String(id))||{auth_id:id,name:'Crew member'};return '<button type="button" class="kg-inbox-row" data-gram-message="'+esc(id)+'">'+avatarMarkup(person,'kg-inbox-avatar')+'<span><b>'+esc(person.name||'Crew member')+'</b><small>'+esc(m.body||'')+'</small></span><time>'+esc(dt(m.created_at))+'</time></button>';}).join(''):'<section class="kg-empty"><div class="kg-empty-mark">✉</div><b>Your messages appear here</b><p>Open a crew member profile to start a private chat.</p><button type="button" class="outline" data-view="people">Find crew</button></section>')+'</section>';
 }else if(tab==='reels'){
  const reels=posts.filter(p=>p.post_type==='reel');
  body='<section class="kg-reels">'+(reels.length?reels.map(p=>'<article class="kg-reel-card">'+(p.signed_media_url?'<video src="'+esc(p.signed_media_url)+'" controls playsinline preload="metadata"></video>':socialEmbed(p.link_url))+'<p>'+esc(p.caption||'')+'</p>'+socialPostCard(p)+'</article>').join(''):empty)+'</section>';
 }else{
  const visible=tab==='posts'?posts.filter(p=>p.post_type!=='reel'):posts;
  body='<section class="kg-feed-section"><div class="kg-section-head"><h2>'+(tab==='posts'?'Posts':'For the crew')+'</h2><span>'+visible.length+' POSTS</span></div><div class="social-feed-list">'+(visible.map(socialPostCard).join('')||empty)+'</div></section>';
 }
 return '<div class="kc-feed-page kg-page">'+header+nav+(tab==='home'?storyRail:'')+body+'</div>';
}

function updatesPage(){return welcome('Crew updates','Announcements, changes, and the latest from your people.',admin()?button('＋ New update','new-update'):'')+'<div class="twoCol"><div class="announcements">'+(S.announcements.map(announcement).join('')||empty('It is quiet in here','Updates will appear here when published.'))+'</div>'+(admin()?updateForm():'')+'</div>';}
async function removeCustomAlertImage(){const path=S.customAlertImagePath;S.customAlertImageUrl='';S.customAlertImagePath='';if(path){const {error}=await client.storage.from('crew-alert-media').remove([path]);if(error)console.warn('Could not remove unused alert image:',error);}}
async function uploadCustomAlertImage(file){
 if(!file||!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){notice('Choose a JPG, PNG, WebP or GIF image.');return;}
 if(file.size>5*1024*1024){notice('Choose an image smaller than 5 MB.');return;}
 const input=$('#kcAlertImageFile'),status=$('#kcAlertImageStatus');
 if(status)status.textContent='Uploading image…';
 const previousPath=S.customAlertImagePath;
 S.customAlertImageUrl='';S.customAlertImagePath='';
 if(previousPath)await client.storage.from('crew-alert-media').remove([previousPath]).catch(()=>{});
 try{
  const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' })[file.type];
  const path='alerts/'+String(S.user.auth_id)+'/'+crypto.randomUUID()+'.'+ext;
  const {data,error}=await kcUploadWithProgress('crew-alert-media',path,file,{contentType:file.type,cacheControl:'3600',upsert:false,activityLabel:'Uploading alert image'});
  if(error)throw error;
  const {data:publicData}=client.storage.from('crew-alert-media').getPublicUrl(data.path);
  S.customAlertImageUrl=publicData.publicUrl;S.customAlertImagePath=data.path;
  const preview=$('#kcAlertImagePreview');
  if(preview)preview.innerHTML='<img src="'+esc(S.customAlertImageUrl)+'" alt="Alert image preview"><button type="button" data-alert-image-remove aria-label="Remove image">×</button>';
  if(status)status.textContent='Image ready to send';
 }catch(error){S.customAlertImageUrl='';S.customAlertImagePath='';if(status)status.textContent='';notice('Image upload failed: '+(error.message||'Please try again.'));}
 if(input)input.value='';
}
function customAlertsPage(){if(!admin())return empty('Admin access required','Only Admins and Super Admins can send custom app alerts.');return welcome('Custom App Alerts','Send now or schedule a push notification for a specific date and time. Alerts are not saved as announcements or added to the in-app feed.')+'<div class="kc-custom-alert-layout"><section class="surface kc-custom-alert-composer"><div class="kc-custom-alert-heading"><span class="kc-custom-alert-icon">♧</span><div><small>ADMIN CONTROL · NOTIFICATION ONLY</small><h2>Compose alert</h2><p>Send a phone notification immediately or schedule it for later. It will not create an announcement or activity-feed post.</p></div></div><form id="customAlertForm"><label class="field">Alert title<input name="title" maxlength="120" required placeholder="Important crew alert"></label><label class="field">Message<textarea name="body" rows="4" maxlength="1000" required placeholder="Write the notification message…"></textarea></label><section class="kc-alert-image-picker" id="kcAlertImageDrop"><div class="kc-alert-image-copy"><b>Attach an image</b><small>Paste an image, drop it here, or choose from your gallery · JPG, PNG, WebP or GIF · up to 5 MB</small></div><input id="kcAlertImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden><button type="button" class="kc-alert-image-button" data-alert-image-choose>＋ Add image</button><div id="kcAlertImagePreview" class="kc-alert-image-preview">'+(S.customAlertImageUrl?'<img src="'+esc(S.customAlertImageUrl)+'" alt="Alert image preview"><button type="button" data-alert-image-remove aria-label="Remove image">×</button>':'')+'</div><small id="kcAlertImageStatus" class="kc-alert-image-status">'+(S.customAlertImageUrl?'Image ready to send':'')+'</small></section><label class="field">Send to<select name="audience"><option value="all">Everyone</option><option value="member">Members only</option><option value="admin">Admins only</option><option value="super_admin">Super Admins only</option></select></label><label class="field">Schedule date &amp; time<input id="kcAlertScheduleAt" name="scheduledAt" type="datetime-local" min="'+esc(new Date(Date.now()+60000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16))+'"><small class="hint">Uses your device’s local time. Leave empty to send immediately.</small></label><div class="kc-custom-alert-actions"><button class="primary" type="submit">Send now ↗</button><button class="outline" type="button" data-alert-schedule>Schedule notification ◷</button><small>Only approved crew members with registered push devices will receive it.</small></div></form></section><section class="surface kc-custom-alert-history"><div class="kc-custom-alert-history-head"><div><small>SCHEDULE QUEUE</small><h2>Upcoming notifications</h2></div><button type="button" class="outline" data-alert-schedule-refresh>↻ Refresh</button></div><div id="kcScheduledAlerts" class="kc-scheduled-alert-list"><p class="hint">Loading scheduled notifications…</p></div></section></div>';}

async function loadScheduledCustomAlerts(){const host=$('#kcScheduledAlerts');if(!host||!admin()||!window.kcPush?.listScheduled)return;host.innerHTML='<p class="hint">Loading scheduled notifications…</p>';try{const result=await window.kcPush.listScheduled();if(result?.error)throw Error(result.error);const items=Array.isArray(result?.items)?result.items:[];if(!host.isConnected||S.view!=='custom-alerts')return;host.innerHTML=items.length?items.map(item=>'<article class="kc-scheduled-alert-item"><div><b>'+esc(item.title)+'</b><p>'+esc(item.body)+'</p><small>'+esc(new Date(item.scheduledAt).toLocaleString())+' · '+Number(item.recipients||0)+' recipient(s)</small></div><button type="button" class="outline" data-alert-cancel="'+esc(item.id)+'">Cancel</button></article>').join(''):'<p class="hint">No upcoming notifications. Scheduled alerts will appear here.</p>';}catch(error){if(host.isConnected)host.innerHTML='<p class="hint">Could not load scheduled notifications: '+esc(error.message||'Please try again.')+'</p>';}}
async function scheduleCustomAlert(form,button){if(!form||!admin())return;const data=new FormData(form),localTime=String(data.get('scheduledAt')||''),when=new Date(localTime);if(!localTime||!Number.isFinite(when.getTime())){notice('Choose a date and time for the scheduled notification.');$('#kcAlertScheduleAt')?.focus();return;}if(when.getTime()<Date.now()+60000){notice('Choose a time at least one minute in the future.');return;}const imageAttached=!!form.querySelector('#kcAlertImagePreview img')&&!!S.customAlertImagePath&&!!S.customAlertImageUrl;if(button){button.disabled=true;button.textContent='Scheduling…';}try{await action(async()=>{const result=await window.kcPush.schedule(data.get('title'),data.get('body'),data.get('audience'),{imageUrl:imageAttached?S.customAlertImageUrl:'',scheduledAt:when.toISOString()});if(Number(result?.scheduled||0)===0){notice(result?.message||'No registered push devices were found for this audience.');return;}notice('Notification scheduled for '+when.toLocaleString()+' ('+result.scheduled+' recipient(s)).');S.customAlertImageUrl='';S.customAlertImagePath='';form.reset();const preview=$('#kcAlertImagePreview'),status=$('#kcAlertImageStatus');if(preview)preview.innerHTML='';if(status)status.textContent='';await loadScheduledCustomAlerts();});}finally{if(button?.isConnected){button.disabled=false;button.textContent='Schedule notification ◷';}}}
async function cancelScheduledCustomAlert(button){const id=String(button?.dataset.alertCancel||'');if(!id)return;button.disabled=true;try{await action(async()=>{const result=await window.kcPush.cancelScheduled(id);notice('Cancelled scheduled notification ('+Number(result?.cancelled||0)+' recipient record(s)).');await loadScheduledCustomAlerts();});}finally{if(button.isConnected)button.disabled=false;}}

async function loadMemberActionState(){
 S.memberFavorites=[];S.blockedMemberIds=[];
 try{const {data,error}=await client.from('crew_member_favorites').select('favorite_auth_id').eq('owner_auth_id',S.user.auth_id);if(error)throw error;S.memberFavorites=(data||[]).map(row=>String(row.favorite_auth_id));}
 catch(error){console.warn('Member favorites need the member-action migration:',error);}
 if(admin()){try{const {data,error}=await client.functions.invoke('member-actions',{body:{action:'list'}});if(error)throw error;if(data?.error)throw Error(data.error);S.blockedMemberIds=Array.isArray(data?.blocked)?data.blocked.map(String):[];}catch(error){console.warn('Blocked member status is unavailable until the member-actions function is deployed:',error);}}
}
function memberFavorite(id){return (S.memberFavorites||[]).includes(String(id));}
async function toggleMemberFavorite(id){
 await rpc('crew_assert_not_blocked',{});
 const key=String(id),exists=memberFavorite(key),table=client.from('crew_member_favorites');
 const result=exists?await table.delete().eq('owner_auth_id',S.user.auth_id).eq('favorite_auth_id',key):await table.upsert({owner_auth_id:S.user.auth_id,favorite_auth_id:key},{onConflict:'owner_auth_id,favorite_auth_id'});
 if(result.error)throw result.error;
 S.memberFavorites=exists?S.memberFavorites.filter(x=>x!==key):[...(S.memberFavorites||[]),key];
 notice(exists?'Removed from favourites.':'Added to favourites.');paint();
}
function memberActionRingMarkup(memberId,memberRole,memberName){
 const canManage=admin()&&(superadmin()||memberRole==='member'),blocked=(S.blockedMemberIds||[]).includes(String(memberId));
 const actions=[['favorite',memberFavorite(memberId)?'★':'☆',memberFavorite(memberId)?'Remove favourite':'Add to favourites'],['message','✉','Message']];
 if(canManage&&memberRole!=='super_admin')actions.push([blocked?'unblock':'block',blocked?'↗':'⊘',blocked?'Unblock member':'Block member']);
 if(canManage&&memberRole!=='super_admin')actions.push(['delete','⌫','Delete member']);
 const buttons=actions.map(([action,icon,label])=>{
  return action==='delete'?'<button type="button" class="kc-member-action kc-member-action-delete" data-member-remove="'+esc(memberId)+'" data-member-name="'+esc(memberName||'Crew member')+'" aria-label="'+esc(label)+'" title="'+esc(label)+'"><span>'+icon+'</span><small>'+esc(label)+'</small></button>':'<button type="button" class="kc-member-action kc-member-action-'+action+'" data-member-action="'+action+'" data-member-id="'+esc(memberId)+'" data-member-name="'+esc(memberName||'Crew member')+'" aria-label="'+esc(label)+'" title="'+esc(label)+'"><span>'+icon+'</span><small>'+esc(label)+'</small></button>';
 }).join('');
 return '<div class="kc-member-action-ring" role="group" aria-label="Member actions"><div class="kc-member-action-orbit">'+buttons+'</div></div>';
}
async function openDirectMessage(memberId){
 const id=String(memberId||''),uid=String(S.user?.auth_id||'');
 if(!id||id===uid)return;
 const safeId=value=>/^[a-zA-Z0-9-]{16,64}$/.test(String(value));
 if(!safeId(id)||!safeId(uid))throw Error('This member account ID is invalid.');
 const {data,error}=await rpc('kg_open_direct_chat',{p_other_user_id:id});
 if(error)throw error;
 window.__kgOpenConversation=String(data);
 await go('gram-chat');
}
async function refreshDirectMessageThread(recipientId){
 const uid=String(S.user.auth_id),rid=String(recipientId);
 const {data,error}=await client.from('crew_direct_messages').select('id,sender_id,recipient_id,body,created_at,read_at').or('and(sender_id.eq.'+uid+',recipient_id.eq.'+rid+'),and(sender_id.eq.'+rid+',recipient_id.eq.'+uid+')').order('created_at',{ascending:true}).limit(100);
 if(error)throw error;await client.from('crew_direct_messages').update({read_at:new Date().toISOString()}).eq('recipient_id',uid).eq('sender_id',rid).is('read_at',null);const thread=$('#kcDmThread');if(!thread)return;
 thread.innerHTML=(data||[]).map(message=>'<article class="kc-dm-bubble '+(String(message.sender_id)===uid?'own':'')+'"><p>'+esc(message.body)+'</p><time>'+esc(dt(message.created_at))+(String(message.sender_id)===uid?(message.read_at?' · Seen':' · Sent'):'')+'</time></article>').join('')||'<p class="hint">No messages yet. Start the conversation.</p>';thread.scrollTop=thread.scrollHeight;
}
function peoplePage(){
 const people=S.publicMembers||[],query=String(S.peopleQuery||'').trim().toLowerCase();
 const filtered=people.filter(m=>(String(m.name||'')+' '+String(m.username||'')+' '+String(m.role||'')+' '+String(m.bio||'')).toLowerCase().includes(query));
 return welcome('Find your crew','Search members and connect with your crew.')+
 '<section class="profile-discovery-bar"><label class="profile-search"><span aria-hidden="true">⌕</span><input id="peopleSearch" type="search" value="'+esc(S.peopleQuery||'')+'" placeholder="Search members…" autocomplete="off"></label><span class="profile-search-count" id="peopleSearchCount">'+filtered.length+' / '+people.length+'</span></section>'+
 '<div class="profile-directory" id="profileDirectoryGrid">'+(filtered.length?filtered.map(m=>'<article class="surface crew-profile-tile kc-member-directory-card" data-member-action-card="'+esc(m.auth_id)+'" data-member-role="'+esc(m.role||'member')+'" data-member-name="'+esc(m.name||'Crew member')+'"><div class="kc-member-card-heading"><button class="crew-profile-open" data-open-profile="'+esc(m.auth_id)+'">'+avatarMarkup(m)+'<span><b>'+esc(m.name||'Crew member')+'</b><small>@'+esc(m.username||'crew-member')+'</small></span></button><span class="role-pill '+esc(m.role)+'">'+esc(role(m.role))+'</span></div><p>'+esc(memberDescriptor(m))+'</p><div class="kc-member-directory-footer"><button type="button" class="outline" data-open-profile="'+esc(m.auth_id)+'">View profile <span aria-hidden="true">→</span></button>'+'<button type="button" class="outline kc-member-actions-toggle" data-member-actions-toggle aria-label="Member actions" title="Member actions">•••</button></div></article>').join(''):empty(query?'No matching members':'No crew members yet',query?'Try a different name or username.':'Crew members will appear here after they join.'))+'</div>';
}

function attendanceSubpageHead(title,description){
 return '<div class="kc-attendance-subpage-head"><button type="button" class="kc-attendance-back" data-attendance-back>← Attendance overview</button><span class="kc-attendance-kicker">KINETIC CREW / OPERATIONS</span><h1>'+title+'</h1><p>'+description+'</p></div>';
}

async function loadProfileHistoryStatus(){
 S.historyLoading=true;
 try{
  const {data,error}=await rpc('crew_profile_history_pin_status',{});
  if(error)throw error;
  S.profileHistoryPinStatus=data||{};
  S.historyBiometricRegistered=false;S.historyBiometricReason='';
  if(data?.pin_configured){try{const biometric=await import('./kc-biometric.js');const result=await biometric.checkKCBiometric();S.historyBiometricRegistered=!!result.registered;S.historyBiometricReason=result.availability?.reason||'';}catch(error){S.historyBiometricReason=error.message||'Biometric authentication is unavailable on this device.';}}
  if(admin()){
   const directory=await rpc('crew_profile_directory',{});
   if(directory.error)throw directory.error;
   S.historyMembers=Array.isArray(directory.data)?directory.data:[];
   if(!S.historyTargetId)S.historyTargetId=String(S.user?.auth_id||S.user?.id||'');
  }else{
   S.historyMembers=[];
   S.historyTargetId=String(S.user?.auth_id||S.user?.id||'');
  }
 }finally{S.historyLoading=false;}
}
function profileHistorySubpageHead(description){return '<div class="kc-attendance-subpage-head"><button type="button" class="kc-attendance-back" data-profile-history-back>← Back to Crew Members & Roles</button><span class="kc-attendance-kicker">KINETIC CREW / CREW MANAGEMENT</span><h1>Profile history</h1><p>'+description+'</p></div>';}
function profileHistoryPage(){
 const status=S.profileHistoryPinStatus||{},isAdmin=admin(),target=String(S.historyTargetId||S.user?.auth_id||'');
 const memberOptions=(S.historyMembers||[]).map(m=>'<option value="'+esc(m.auth_id)+'" '+(String(m.auth_id)===target?'selected':'')+'>'+esc(m.name||m.username||'Crew member')+' · @'+esc(m.username||'no-username')+'</option>').join('');
 const select=isAdmin?'<label class="kc-history-member-select"><span>MEMBER ACCOUNT</span><select id="profileHistoryMemberSelect">'+memberOptions+'</select></label>':'';
 if(S.historyLoading)return '<main class="kc-attendance-home kc-attendance-subpage">'+profileHistorySubpageHead('Secure member activity and account history.')+'<section class="kc-history-lock-card"><b>Loading secure history…</b></section></main>';
 if(!status.pin_configured)return '<main class="kc-attendance-home kc-attendance-subpage">'+profileHistorySubpageHead('Secure member activity and account history.')+'<section class="kc-history-lock-card"><span class="kc-attendance-kicker">SECURITY SETUP · ONE TIME</span><h2>Create your mPIN</h2><p>Set a four-digit mPIN. You will need it every time you open private Profile History.</p>'+select+'<form id="kcHistoryPinSetup" class="kc-history-pin-form"><label>New four-digit mPIN<input name="pin" type="text" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" maxlength="4" pattern="[0-9]{4}" required placeholder="••••" style="-webkit-text-security:disc"></label><label>Confirm mPIN<input name="confirmPin" type="text" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" maxlength="4" pattern="[0-9]{4}" required placeholder="••••" style="-webkit-text-security:disc"></label><button type="submit" class="kc-attendance-verify-btn">Save secure mPIN →</button></form><small class="kc-history-security-note">Your mPIN is stored as a one-way password hash. Admins cannot view it.</small></section></main>';
 if(!S.profileHistoryUnlocked||!S.profileHistoryData)return '<main class="kc-attendance-home kc-attendance-subpage">'+profileHistorySubpageHead('Private account and participation records. Unlock to continue.')+'<section class="kc-history-lock-card"><span class="kc-attendance-kicker">PROTECTED INFORMATION</span><h2>Verify it’s you</h2><p>Enter your own mPIN to view '+(isAdmin?'this member’s':'your')+' complete profile history. Admins must use their own mPIN.</p>'+select+'<form id="kcHistoryPinUnlock" class="kc-history-pin-form"><label>Four-digit mPIN<input name="pin" type="text" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" maxlength="4" pattern="[0-9]{4}" required placeholder="••••" style="-webkit-text-security:disc"></label><button type="submit" class="kc-attendance-verify-btn">Unlock profile history →</button></form>'+(S.historyBiometricRegistered&&S.profileHistoryPinSession?'<button type="button" class="kc-attendance-verify-btn" data-history-biometric-unlock>Unlock Profile History with fingerprint / face</button>':'')+'<small class="kc-history-security-note">Five incorrect attempts temporarily lock verification for 15 minutes.</small></section></main>';
 const data=S.profileHistoryData||{},p=data.profile||{},st=data.stats||{},events=data.events||[],days=data.login_days||[];
 const metric=(value,label,sub)=>'<article class="kc-history-metric"><small>'+label+'</small><b>'+value+'</b><span>'+sub+'</span></article>';
 const eventRows=events.map(e=>'<article class="kc-history-event"><div><b>'+esc(e.title)+'</b><small>'+esc(dt(e.starts_at))+'</small></div><span class="kc-history-status '+esc(e.status)+'">'+esc(String(e.status||'').replace('_',' '))+'</span></article>').join('');
 const loginRows=days.slice(0,30).map(d=>'<span class="kc-history-login-day">'+esc(new Date(d.login_day+'T00:00:00').toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'}))+'</span>').join('');
 const field=(label,value)=>'<div class="kc-history-field"><small>'+label+'</small><b>'+esc(value||'—')+'</b></div>';
 const score=st.activity_score==null?'—':Number(st.activity_score).toFixed(1)+'%';
 const attendance=st.attendance_percentage==null?'—':Number(st.attendance_percentage).toFixed(1)+'%';
 const registration=st.registration_percentage==null?'—':Number(st.registration_percentage).toFixed(1)+'%';
 const missingProfileFields=[['Full name',p.name],['Username',p.username],['Date of birth',p.date_of_birth],['Registration number',p.registration_number],['Instagram username',p.instagram_username],['Bio',p.bio],['Profile photo',p.avatar_url]].filter(([,value])=>!String(value||'').trim()).map(([label])=>label);
 const reminderPanel=missingProfileFields.length&&target!==String(S.user?.auth_id||'')?'<section class="kc-history-panel kc-profile-reminder-panel"><header><div><span class="kc-attendance-kicker">MEMBER PROFILE</span><h2>Profile completion needed</h2><p>Missing: '+esc(missingProfileFields.join(', '))+'.</p></div><b>'+missingProfileFields.length+' ITEMS</b></header><button type="button" class="kc-profile-reminder-send" data-send-profile-reminder="'+esc(target)+'">Send profile completion reminder ↗</button><small class="kc-history-footnote">Sends this member an in-app notification, a device push notification when enabled, and an email.</small></section>':(missingProfileFields.length?'<section class="kc-history-panel"><h2>Your profile needs completion</h2><p>Missing details: '+esc(missingProfileFields.join(', '))+'.</p><button type="button" class="kc-profile-reminder-send" data-view="profile">Complete profile →</button></section>':'<section class="kc-history-panel"><h2>Profile complete</h2><p>All required profile details are filled in.</p></section>');
 return '<main class="kc-attendance-home kc-attendance-subpage kc-profile-history-page">'+attendanceSubpageHead('Profile history','A complete, read-only view of account details, attendance and participation.')+
 '<section class="kc-history-topbar">'+select+'<button type="button" class="kc-history-lock-button" data-history-biometric-setup>'+(S.historyBiometricRegistered?'Remove Profile History biometrics':'Enable Profile History biometrics')+'</button><button type="button" class="kc-history-lock-button" data-history-lock>Lock history</button></section>'+
 '<section class="kc-history-hero"><div><span class="kc-attendance-kicker">MEMBER ACTIVITY INDEX</span><h2>'+(score==='—'?'Not enough finalized events':score)+'</h2><p>Transparent participation score · 70% attendance + 30% registration engagement</p></div><div class="kc-history-hero-ring"><b>'+(score==='—'?'—':Math.round(Number(st.activity_score))+'')+'</b><small>/100</small></div></section>'+
 '<section class="kc-history-metrics">'+metric(st.present??0,'PRESENT','Verified attendance')+metric(st.absent??0,'ABSENT','Finalized absences')+metric(st.registered??0,'REGISTERED','Event registrations')+metric(st.not_registered??0,'NOT REGISTERED','Eligible events not joined')+'</section>'+
 '<section class="kc-history-panel"><header><div><span class="kc-attendance-kicker">PARTICIPATION BREAKDOWN</span><h2>Engagement overview</h2></div></header><div class="kc-history-progress-row"><span>Attendance rate</span><b>'+attendance+'</b></div><div class="kc-history-progress"><i style="width:'+(st.attendance_percentage==null?0:Math.max(0,Math.min(100,Number(st.attendance_percentage))))+'%"></i></div><div class="kc-history-progress-row"><span>Registration engagement</span><b>'+registration+'</b></div><div class="kc-history-progress"><i style="width:'+(st.registration_percentage==null?0:Math.max(0,Math.min(100,Number(st.registration_percentage))))+'%"></i></div><p class="kc-history-footnote">'+(st.attendance_percentage==null?'Attendance score becomes available after at least one event has finalized attendance.':'Pending registrations are not counted as absences.')+' '+(st.eligible_events||0)+' eligible events · '+(st.pending||0)+' pending · '+(st.not_attending||0)+' marked not attending.</p></section>'+
 '<section class="kc-history-panel"><header><div><span class="kc-attendance-kicker">ACCOUNT OVERVIEW</span><h2>'+esc(p.name||'Crew member')+'</h2><p>Read-only account information. Password values are never accessible.</p></div></header><div class="kc-history-fields">'+field('USERNAME',p.username?'@'+p.username:'—')+field('EMAIL',p.email)+field('ROLE',role(p.role))+field('ACCOUNT STATUS',p.approval_status)+field('REGISTRATION NUMBER',p.registration_number)+field('DATE OF BIRTH',p.date_of_birth)+field('INSTAGRAM',p.instagram_username?'@'+p.instagram_username:'—')+field('CREW DESIGNATION',p.designation||p.crew_title)+field('ACCOUNT CREATED',p.auth_created_at?dt(p.auth_created_at):dt(p.created_at))+field('MEMBERSHIP APPROVED',p.approved_at?dt(p.approved_at):'Not recorded')+field('LAST SIGN-IN',p.last_sign_in_at?dt(p.last_sign_in_at):'Not recorded')+field('EMAIL CONFIRMED',p.email_confirmed_at?'Confirmed':'Not confirmed')+field('PASSWORD SECURITY',p.must_change_password?'Password change required':'Password value hidden by design')+field('PASSWORD CHANGE REQUIRED SINCE',p.password_change_required_since?dt(p.password_change_required_since):'—')+'</div></section>'+
 '<section class="kc-history-panel"><header><div><span class="kc-attendance-kicker">LOGIN ACTIVITY</span><h2>Recent account days</h2><p>Recorded sign-in days, newest first · up to 180 days.</p></div><b>'+days.length+' DAYS</b></header><div class="kc-history-login-grid">'+(loginRows||'<p class="kc-history-footnote">No login-day history is available yet.</p>')+'</div></section>'+
 '<section class="kc-history-panel"><header><div><span class="kc-attendance-kicker">EVENT-BY-EVENT HISTORY</span><h2>Participation timeline</h2><p>Eligible events with registration and finalized attendance status.</p></div><b>'+events.length+' EVENTS</b></header><div class="kc-history-event-list">'+(eventRows||'<p class="kc-history-footnote">No eligible events found for this account.</p>')+'</div></section>'+
 reminderPanel+'</main>';
}
function attendancePage(){
 if(!admin())return memberAttendancePage();
 const section=S.attendanceSection||'home';
 const selected=S.events.find(e=>String(e.id)===String(S.rosterEvent));
 const eventOptions='<option value="">Select an event</option>'+S.events.map(e=>'<option value="'+esc(e.id)+'" '+(String(S.rosterEvent)===String(e.id)?'selected':'')+'>'+esc(e.title)+'</option>').join('');
 const reportEvents='<option value="">Select an event</option>'+S.events.map(e=>'<option value="'+esc(e.id)+'" '+(String(S.attendanceReportEvent)===String(e.id)?'selected':'')+'>'+esc(e.title)+'</option>').join('');
 const rows=S.roster?.roster||[];
 const finalized=!!S.roster?.finalized;
 const total=rows.length;
 const present=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='present').length;
 const absent=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='absent').length;
 const pending=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='pending').length;
 const notAttending=Math.max(0,Number(S.roster?.eligible_members||total)-total);
 const pct=total?Math.round(present/total*100):0;
 if(section==='history')return profileHistoryPage();
 if(section==='scan')return '<main class="kc-attendance-home kc-attendance-subpage">'+attendanceSubpageHead('Scan QR','Scan a member ticket to identify the event and mark attendance automatically.')+'<section class="kc-attendance-feature-panel"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">INSTANT CHECK-IN</span><h2>Member QR scanner</h2><p>Point the camera at the QR code on the member’s event ticket. The event and member are detected automatically.</p></div><span class="kc-attendance-round-icon">▦</span></div><button type="button" class="kc-attendance-scan-btn" id="openQrScanner">▦ &nbsp; Start QR scanner</button><div id="qrScanner" class="qr-scanner kc-attendance-scanner" hidden><div class="kc-qr-stage" id="kcQrStage" data-state="scanning"><video id="qrVideo" autoplay playsinline muted></video><div class="kc-qr-mask" aria-hidden="true"><span class="kc-qr-corner tl"></span><span class="kc-qr-corner tr"></span><span class="kc-qr-corner bl"></span><span class="kc-qr-corner br"></span><i class="kc-qr-scan-line"></i></div><div class="kc-qr-state" id="kcQrState" role="status" aria-live="polite"><span class="kc-qr-state-mark" id="kcQrMark">⌗</span><b id="kcQrTitle">Align QR code inside the square</b><small id="kcQrMessage">Keep the ticket steady and within the frame.</small><button type="button" id="kcQrViewRoster" data-attendance-section="roster" hidden>View event roster →</button></div></div><button type="button" class="outline full" id="closeQrScanner">Close scanner</button></div><p class="kc-attendance-note">Camera permission is required. QR check-in does not require choosing an event or member manually.</p></section></main>';
 if(section==='otp')return '<main class="kc-attendance-home kc-attendance-subpage">'+attendanceSubpageHead('Verify with OTP','Choose the event and registered member, then enter their six-digit code.')+'<section class="kc-attendance-feature-panel"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">MANUAL CHECK-IN</span><h2>Verify event OTP</h2><p>Use the member’s six-digit code to confirm attendance.</p></div><span class="kc-attendance-round-icon">⌗</span></div><form id="attendanceOtpForm" class="kc-attendance-otp-form"><label><span>Event</span><select name="eventId" id="otpEventSelect" required>'+eventOptions+'</select></label><label><span>Registered member</span><select name="memberEmail" id="otpMemberSelect" required '+(!S.roster?.roster?.length?'disabled':'')+'><option value="">'+(S.roster?.roster?.length?'Select registered member':'Select an event first')+'</option>'+(S.roster?.roster||[]).filter(m=>!['present'].includes(m.status||(m.attended?'present':'pending'))).map(m=>'<option value="'+esc(m.email)+'">'+esc(m.name)+' · '+esc(m.email)+'</option>').join('')+'</select></label><label><span>Event OTP</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required></label><button type="submit" class="kc-attendance-verify-btn" '+(!S.rosterEvent||finalized?'disabled':'')+'>Verify & check in <span>→</span></button></form><p class="kc-attendance-note">If the member has a ticket QR code, use Scan QR instead for automatic event and member detection.</p></section></main>';
 if(section==='roster')return '<main class="kc-attendance-home kc-attendance-subpage">'+attendanceSubpageHead('Event roster','Choose an event to review check-in progress, update member statuses and finalize attendance.')+'<section class="kc-attendance-feature-panel"><div class="kc-attendance-next-head"><span class="kc-attendance-kicker">EVENT SELECTION</span><span class="kc-attendance-event-count">'+S.events.length+' EVENTS</span></div><label class="kc-attendance-event-select"><span>◷</span><select id="rosterSelect">'+eventOptions+'</select><span>⌄</span></label>'+(selected?'<div class="kc-attendance-event-meta"><b>'+esc(selected.title)+'</b><small>'+esc(dt(selected.starts_at))+' · '+esc(selected.location||'Venue to be announced')+'</small></div>':'<div class="kc-attendance-event-meta"><b>Choose your event</b><small>The event roster and check-in summary will appear here.</small></div>')+'</section>'+(S.roster?'<section class="kc-attendance-summary"><div class="kc-attendance-summary-head"><div><span class="kc-attendance-kicker">CHECK-IN PROGRESS</span><h2>'+pct+'% <small>present</small></h2></div><span class="kc-attendance-lock '+(finalized?'locked':'')+'">'+(finalized?'▣ LOCKED':'● OPEN')+'</span></div><div class="kc-attendance-progress"><span style="width:'+pct+'%"></span></div><div class="kc-attendance-stat-grid"><div><b>'+present+'</b><small>Present</small></div><div><b>'+pending+'</b><small>Pending</small></div><div><b>'+absent+'</b><small>Absent</small></div><div><b>'+notAttending+'</b><small>Not registered</small></div></div></section><section class="kc-attendance-roster"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">YOUR PEOPLE</span><h2>Registered members</h2><p>'+total+' registered '+(total===1?'member':'members')+' · Tap a status to update it.</p></div><button type="button" class="kc-attendance-export" id="exportAttendance">↓ CSV</button></div><label class="kc-attendance-search"><span>⌕</span><input id="attendanceSearch" type="search" value="'+esc(S.attendanceQuery||'')+'" placeholder="Find a member…" autocomplete="off"></label><div id="rosterBody">'+rosterRows(rows)+'</div><div class="kc-attendance-finalize"><p>'+(finalized?'This event is locked. Only the Super Admin can reopen attendance.':'Finalizing marks all remaining pending members absent and locks the roster.')+'</p><button type="button" id="finalizeAttendance" '+(finalized?'disabled':'')+'>'+(finalized?'Attendance locked':'Finalize attendance <span>→</span>')+'</button>'+(finalized&&superadmin()?'<button type="button" id="reopenAttendance" class="kc-attendance-reopen">Reopen attendance</button>':'')+'</div><section class="kc-attendance-audit"><span class="kc-attendance-kicker">ACTIVITY</span><h3>Recent changes</h3>'+((S.attendanceAudit||[]).length?S.attendanceAudit.slice(0,12).map(a=>'<div class="attendance-audit-row"><span><b>'+esc(a.member_name)+'</b><small>'+esc(a.actor_name)+' · '+esc(String(a.action||'').replace('_',' '))+'</small></span><span>'+esc((a.previous_status||'—')+' → '+a.new_status)+'<small>'+esc(dt(a.changed_at))+'</small></span></div>').join(''):'<p class="kc-attendance-note">No changes recorded yet.</p>')+'</section></section>':'<section class="kc-attendance-summary kc-attendance-empty"><h2>Select an event to load its roster.</h2><p>Attendance progress, member statuses and activity history will appear here.</p></section>')+'</main>';
 if(section==='report')return '<main class="kc-attendance-home kc-attendance-subpage">'+attendanceSubpageHead('Attendance report','One complete report covering all recorded events and attendance from the beginning of Kinetic Crew through today.')+'<section class="kc-attendance-feature-panel"><div class="kc-attendance-next-head"><span class="kc-attendance-kicker">FULL CREW HISTORY</span><span class="kc-attendance-event-count">'+S.events.length+' EVENTS</span></div><div class="kc-attendance-event-meta"><b>All events · All recorded attendance</b><small>No event selection required. The report includes the complete available history.</small></div>'+attendanceReportCard(false)+'</section></main>';
 return '<main class="kc-attendance-home"><header class="kc-attendance-heading"><div><span class="kc-attendance-kicker">KINETIC CREW / OPERATIONS</span><h1>Attendance <em>overview.</em></h1><p>Keep your crew in sync. Verify, track and manage event check-ins.</p></div><span class="kc-attendance-live"><i></i> LIVE DESK</span></header><section class="kc-attendance-feature-grid"><button type="button" class="kc-attendance-feature-card kc-task-scan" data-attendance-section="scan"><span class="kc-task-icon">▦</span><b>Scan QR</b><small>Instant member check-in</small><i>↗</i></button><button type="button" class="kc-attendance-feature-card kc-task-otp" data-attendance-section="otp"><span class="kc-task-icon">⌗</span><b>Verify OTP</b><small>Six-digit event code</small><i>↗</i></button><button type="button" class="kc-attendance-feature-card kc-task-roster" data-attendance-section="roster"><span class="kc-task-icon">☷</span><b>Event roster</b><small>Manage member attendance</small><i>↗</i></button><button type="button" class="kc-attendance-feature-card kc-task-report" data-attendance-section="report"><span class="kc-task-icon">✉</span><b>Attendance report</b><small>Send summary as PDF</small><i>↗</i></button></section><section class="kc-attendance-hub-note"><span class="kc-attendance-kicker">ATTENDANCE DESK</span><h2>Everything in its place.</h2><p>Select a feature above. Each tool opens on its own page, without stacking all attendance controls into one long screen.</p></section></main>';
}
function funZonePage(){
 const posts=S.socialPosts||[];
 const people=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(S.user?.auth_id)).slice(0,8);
 const cards=[
  ['lounge','✉','Crew Lounge','Talk with your crew','chat','OPEN LOUNGE'],
  ['memes','▧','Meme Zone','Memes, clips and funny moments','memes','EXPLORE MEMES'],
  ['games','✦','Mini Games','Quick games and dance challenges','fun-zone-games','PLAY NOW'],
  ['polls','◉','Polls & Challenges','Vote, decide and take on challenges','polls','JOIN IN']
 ];
 return '<div class="kc-fun-hub">'+
  '<header class="kc-fun-hub-head"><div><span class="kc-fun-kicker">KINETIC CREW / PLAY TOGETHER</span><h1>Fun <em>Zone</em><span class="kc-fun-spark">✦</span></h1><p>Your crew’s space to laugh, compete and connect.</p></div></header>'+
  '<section class="kc-fun-featured"><div class="kc-fun-featured-orb">✦</div><div><small>THE CREW NEVER STOPS</small><h2>Make some noise.</h2><p>'+posts.length+' shared moments · '+people.length+' crew members to discover</p></div><button type="button" data-view="memes">Explore moments ↗</button></section>'+
  '<div class="kc-fun-section-title"><div><small>YOUR PLAYGROUND</small><h2>Pick your vibe</h2></div><span>04 SPACES</span></div>'+
  '<section class="kc-fun-grid">'+cards.map((c,i)=>'<button type="button" class="kc-fun-card kc-fun-card-'+c[0]+'" data-view="'+c[4]+'"><span class="kc-fun-card-icon">'+c[1]+'</span><span class="kc-fun-card-copy"><b>'+c[2]+'</b><small>'+c[3]+'</small></span><span class="kc-fun-card-arrow">↗</span><em>'+c[5]+'</em></button>').join('')+'</section>'+
  '<section class="kc-fun-people"><div class="kc-fun-section-title"><div><small>YOUR PEOPLE</small><h2>Crew is online</h2></div><button type="button" data-view="people">Discover all ↗</button></div><div class="kc-fun-people-rail">'+(people.length?people.map(p=>'<button type="button" class="kc-fun-person" data-open-profile="'+esc(p.auth_id)+'">'+avatarMarkup(p)+'<b>'+esc((p.name||'Crew').split(' ')[0])+'</b></button>').join(''):'<button type="button" class="kc-fun-person" data-view="people"><span class="kc-fun-person-add">＋</span><b>Find crew</b></button>')+'</div></section>'+
  '<div class="kc-fun-hub-foot">ONE CREW. MANY WAYS TO HAVE FUN. <span>✦</span></div>'+
 '</div>';
}

function memeZonePage(){
 const posts=S.socialPosts||[];
 const people=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(S.user?.auth_id)).slice(0,8);
 return '<div class="kc-meme-page"><header class="kc-fun-subhead"><button type="button" class="kc-fun-back" data-view="fun-zone">← Fun Zone</button><span>THE FUNNY SIDE OF KC</span><h1>Meme Zone</h1><p>Drop a meme, share a clip, make the crew laugh.</p></header>'+
 '<form id="socialPostForm" class="surface social-share-composer kc-meme-composer"><div class="kc-feed-compose-avatar">'+avatarMarkup(S.user)+'</div><div class="kc-feed-compose-main"><label class="field"><textarea name="caption" rows="2" maxlength="1200" placeholder="What’s the joke? Give it a caption…" aria-label="Meme caption"></textarea></label><div class="kc-feed-link-field"><span>↗</span><input name="link_url" type="url" inputmode="url" placeholder="Paste meme image, video or reel link" required></div><div class="social-composer-foot"><small>Keep it crew-friendly ✦</small><button type="submit" class="primary">Share meme ↗</button></div></div></form>'+
 '<div class="kc-fun-section-title"><div><small>FRESH FROM THE CREW</small><h2>Latest moments</h2></div><span>'+posts.length+' POSTS</span></div><div class="social-feed-list">'+(posts.map(socialPostCard).join('')||empty('No memes yet','Be the first to share something funny with the crew.'))+'</div>'+
 '<div class="kc-fun-hub-foot"><button type="button" data-view="fun-zone">Back to Fun Zone</button></div></div>';
}
function miniGamesPage(){
 const round=S.funRound||{state:'ready',best:null,last:null};
 const status=round.state==='waiting'?'Wait for the glow…':round.state==='go'?'TAP NOW!':round.state==='early'?'Too soon! Try again.':round.state==='done'?'Nice reflexes!':'Tap start when you’re ready';
 const tone=round.state==='go'?'go':round.state==='waiting'?'wait':round.state==='early'?'early':'ready';
 return '<div class="kc-games-page"><header class="kc-fun-subhead"><button type="button" class="kc-fun-back" data-view="fun-zone">← Fun Zone</button><span>PLAY · COMPETE · REPEAT</span><h1>Mini Games</h1><p>Quick challenges to test your reflexes and your dance energy.</p></header>'+
 '<section class="kc-game-panel"><div class="kc-game-panel-top"><span>01 / REFLEX TEST</span><span class="kc-game-live"><i></i> SOLO GAME</span></div><h2>Beat the blink.</h2><p>Wait until the circle turns cyan, then tap as fast as you can.</p><button type="button" class="kc-reaction-target '+tone+'" data-fun-'+(round.state==='go'||round.state==='waiting'?'hit':'start')+'><span>'+ (round.state==='go'?'TAP!':round.state==='waiting'?'WAIT':'✦') +'</span><small>'+status+'</small></button><div class="kc-game-stats"><div><small>LAST TIME</small><b>'+(round.last!=null?round.last+' ms':'—')+'</b></div><div><small>PERSONAL BEST</small><b>'+(round.best!=null?round.best+' ms':'—')+'</b></div></div><button type="button" class="kc-game-reset" data-fun-reset>Reset game ↻</button></section>'+
 '<section class="kc-dance-challenge"><div><small>02 / DANCE CHALLENGE</small><h2>Random move generator</h2><p id="dancePrompt">Ready for a new crew challenge? Generate your next move.</p></div><button type="button" data-dance-prompt>Surprise me ✦</button></section>'+
 '<div class="kc-fun-hub-foot"><button type="button" data-view="fun-zone">Back to all Fun Zone activities</button></div></div>';
}
function creditsPage(){
 return welcome('Credits','The people, tools and community behind Kinetic Crew.')+
 '<section class="surface credits-hero"><span class="settings-kicker">BUILT FOR THE BEAT</span><h2>KINETIC CREW</h2><p>A private student community for dance, events, rehearsals and shared memories.</p><div class="credits-version">KINETIC CREW · v1.2.5</div></section>'+
 '<div class="settings-grid credits-grid"><section class="surface settings-card"><span class="settings-kicker">COMMUNITY</span><h3>Made by the crew</h3><p>Designed around the people who rehearse, perform, organize and create together.</p></section><section class="surface settings-card"><span class="settings-kicker">PLATFORM</span><h3>Technology</h3><p>Built with web technologies, Supabase services and an installable progressive web app experience.</p></section><section class="surface settings-card"><span class="settings-kicker">SUPPORT</span><h3>Keep it respectful</h3><p>Use crew features responsibly. Report access or content issues to a Kinetic Crew Admin.</p><button class="outline" data-view="settings">App settings →</button></section></div>';
}
function calendarPage(){
 const rows=S.events.slice().sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const groups={};
 rows.forEach(e=>{const d=new Date(e.starts_at);const k=Number.isNaN(+d)?'Date TBA':d.toLocaleDateString([],{month:'long',year:'numeric'});(groups[k]||(groups[k]=[])).push(e);});
 return welcome('Crew calendar','A clear schedule of performances, events and crew moments.')+
 '<div class="calendar-list">'+(Object.keys(groups).map(k=>'<section class="calendar-month"><h2>'+esc(k)+'</h2><div class="eventgrid">'+groups[k].map(card).join('')+'</div></section>').join('')||empty('No events scheduled','Published events will appear on the calendar.'))+'</div>';
}
function leaderboardPage(){
 const sorted=S.leaderboard||S.members.slice().sort((a,b)=>Number(b.event_count||0)-Number(a.event_count||0));
 return welcome('Crew leaderboard','Recognizing participation across the crew.')+
 '<div class="surface leaderboard-list">'+(sorted.length?sorted.map((m,i)=>'<div class="leader-row"><b class="leader-rank">#'+(i+1)+'</b><div class="avatar">'+esc(initials(m.name))+'</div><div class="leader-person"><b>'+esc(m.name)+'</b><small>'+esc(role(m.role))+'</small></div><strong>'+Number(m.event_count||0)+' <small>events</small></strong></div>').join(''):empty('Leaderboard is warming up','Member participation will appear as the crew grows.'))+'</div><p class="hint">Current ranking is based on event registrations, not verified attendance. A future scoring upgrade can include attendance and volunteering.</p>';
}


function legacySettingsPage(){return profilePage()+'<section class="surface app-settings-panel"><div class="formtitle"><div class="formicon">☼</div><div><h3>Appearance</h3><p>Choose how Kinetic Crew looks on this device.</p></div></div><div class="settings-choice"><button type="button" class="outline" data-set-theme="dark">☾ Dark mode</button><button type="button" class="outline" data-set-theme="light">☀ Light mode</button></div></section>';}
function crewManagementPage(){
  if(S.profileHistoryInCrew){if(!admin()){S.profileHistoryInCrew=false;return empty('Admin access required','Profile History is available only to Admins and Super Admins.');}return profileHistoryPage();}
 if(!admin())return empty('Admin access required','Admins and Super Admins can review crew membership. Only the Super Admin can change roles.');
 const memberQuery=String(S.managedMemberQuery||'').trim().toLowerCase();
 const visibleMembers=(S.members||[]).filter(m=>(String(m.name||'')+' '+String(m.username||'')+' '+String(m.role||'')+' '+String(m.crew_title||'')).toLowerCase().includes(memberQuery));
 const rows=visibleMembers.map(m=>'<article class="crew-manage-row" data-managed-member="'+esc(m.auth_id)+'" data-member-action-card="'+esc(m.auth_id)+'" data-member-role="'+esc(m.role||'member')+'" data-member-name="'+esc(m.name||'Crew member')+'"><div class="crew-manage-person">'+avatarMarkup(m)+'<span><b>'+esc(m.name||'Crew member')+'</b><small>'+esc(m.username?'@'+m.username:'Crew member')+'</small></span></div><span class="roletag '+esc(m.role)+'">'+esc(role(m.role))+'</span><button type="button" class="outline kc-member-actions-toggle" data-member-actions-toggle aria-label="Member actions" title="Member actions">•••</button>'+(superadmin()&&m.auth_id!==S.user.auth_id&&m.role!=='super_admin'?'<div class="kc-role-tools"><label class="kc-role-change"><span>Access role</span><select class="select role-select" data-role-change="'+esc(m.auth_id)+'" data-current-role="'+esc(m.role||'member')+'"><option value="member" '+(m.role==='member'?'selected':'')+'>Member</option><option value="admin" '+(m.role==='admin'?'selected':'')+'>Admin</option></select></label><form class="kc-define-role" data-designation-form="'+esc(m.auth_id)+'"><label><span>Define crew role</span><input maxlength="40" name="designation" value="'+esc(m.crew_title||'')+'" placeholder="e.g. Choreographer, Team Lead"></label><button type="submit" class="outline" data-save-designation="'+esc(m.auth_id)+'">Save</button></form></div>':'')+'</article>').join('');
 const visiblePending=(S.pendingMembers||[]).filter(m=>(String(m.name||'')+' '+String(m.username||'')+' '+String(m.email||'')).toLowerCase().includes(memberQuery));
 const pendingRows=visiblePending.map(m=>'<article class="crew-manage-row kc-pending-member"><div class="crew-manage-person"><span class="kc-pending-avatar">⌛</span><span><b>'+esc(m.name||'New member')+'</b><small>'+esc(m.email||'')+' · @'+esc(m.username||'crew-member')+'</small><small>Requested '+esc(dt(m.requested_at))+'</small></span></div><div class="kc-pending-actions"><button type="button" class="primary" data-review-member="approve" data-member-id="'+esc(m.auth_id)+'">Approve</button><button type="button" class="outline" data-review-member="reject" data-member-id="'+esc(m.auth_id)+'">Reject</button></div></article>').join('');
 return welcome('Crew Members','Manage approved members, roles and new membership requests.')+
  '<button type="button" class="kc-attendance-feature-card kc-task-history" data-profile-history-open><span class="kc-task-icon">◉</span><b>Profile history</b><small>Member activity, attendance and account details</small><i>↗</i></button>'+
 '<section class="surface crew-manage-list"><div class="directoryhead"><div><span class="settings-kicker">'+(superadmin()?'SUPER ADMIN · ROLE MANAGEMENT':'ADMIN · CREW DIRECTORY')+'</span><h3>Members & roles</h3><p>'+(superadmin()?'Set account access and define custom crew designations. Super Admin accounts and your own role are protected.':'View approved crew members. Role changes are reserved for the Super Admin.')+'</p></div></div><label class="profile-search kc-managed-member-search"><span aria-hidden="true">⌕</span><input id="managedMemberSearch" type="search" value="'+esc(S.managedMemberQuery||'')+'" placeholder="Search members by name, username or role…" autocomplete="off"></label><span class="profile-search-count">'+visibleMembers.length+' / '+(S.members||[]).length+' members</span>'+(rows||empty(memberQuery?'No matching members':'No members yet',memberQuery?'Try another name, username or role.':'Approved crew accounts will appear here.'))+'</section>'+
 '<section class="surface crew-manage-list kc-pending-list"><div class="directoryhead"><div><span class="settings-kicker">ADMIN · SUPER ADMIN</span><h3>Pending membership requests <span class="kc-pending-count">'+(S.pendingMembers||[]).length+'</span></h3><p>Approve or reject new verified registrations. Approved members receive the Kinetic Crew registration email.</p></div></div>'+(pendingRows||empty(memberQuery?'No matching pending requests':'No pending requests',memberQuery?'Try another name, username or email.':'New verified signups will appear here automatically.'))+'</section>';
}
function memberRequestsPage(){
 if(!admin())return empty('Admin access required','Only Admins and Super Admins can review membership requests.');
 const pendingRows=(S.pendingMembers||[]).map(m=>'<article class="crew-manage-row kc-pending-member"><div class="crew-manage-person"><span class="kc-pending-avatar">⌛</span><span><b>'+esc(m.name||'New member')+'</b><small>'+esc(m.email||'')+' · @'+esc(m.username||'crew-member')+'</small><small>Requested '+esc(dt(m.requested_at))+'</small></span></div><div class="kc-pending-actions"><button type="button" class="primary" data-review-member="approve" data-member-id="'+esc(m.auth_id)+'">Approve</button><button type="button" class="outline" data-review-member="reject" data-member-id="'+esc(m.auth_id)+'">Reject</button></div></article>').join('');
 const rejectedRows=(S.rejectedMembers||[]).map(m=>'<article class="crew-manage-row kc-pending-member"><div class="crew-manage-person"><span class="kc-pending-avatar">×</span><span><b>Rejected application · #'+esc(m.reference)+'</b><small>Personal details and account data deleted</small><small>Rejected '+esc(dt(m.rejected_at))+'</small></span></div><span class="roletag member">REJECTED</span></article>').join('');
 return welcome('Member Requests','Review new Kinetic Crew registrations. Rejected applicants have their personal data deleted.')+'<section class="surface crew-manage-list kc-pending-list"><div class="directoryhead"><div><span class="settings-kicker">ADMIN · SUPER ADMIN</span><h3>Pending membership requests <span class="kc-pending-count">'+(S.pendingMembers||[]).length+'</span></h3><p>Approve verified signups or permanently reject requests. Approved members receive their welcome email.</p></div><button type="button" class="outline" id="exportMemberRegistrations">↓ Excel</button></div>'+(pendingRows||empty('No pending requests','New verified signups will appear here automatically.'))+'</section><section class="surface crew-manage-list kc-pending-list"><div class="directoryhead"><div><span class="settings-kicker">PRIVACY-SAFE HISTORY · LAST 90 DAYS</span><h3>Rejected requests <span class="kc-pending-count">'+(S.rejectedMembers||[]).length+'</span></h3><p>Rejected entries are shown with anonymized references only. Names, emails, usernames and profile data are not retained.</p></div></div>'+(rejectedRows||empty('No rejected requests','Rejected applications will appear here as anonymized entries.'))+'</section>';
}
function chatMessagesMarkup(items){const rows=(items||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));return rows.length?rows.map(m=>{const own=String(m.author_id)===String(S.user.auth_id);return '<article class="wa-message '+(own?'own':'')+'"><small>'+esc(own?'You':m.author_name||'Crew member')+'</small><p>'+esc(m.body||m.title)+'</p><time>'+esc(dt(m.created_at))+'</time></article>';}).join(''):'<div class="wa-empty"><b>Start the crew conversation</b><small>Messages from your crew will appear here.</small></div>';}
function whatsAppChatPage(){const items=S.featureItems.chat||[];return welcome('Crew Chat','One crew conversation. Share plans, quick updates and moments.')+'<section class="wa-shell"><aside class="wa-rail"><div class="wa-rail-head"><b>KC MESSAGES</b><span>● ONLINE</span></div><div class="wa-room active"><span class="wa-room-avatar">KC</span><span><b>Main Crew</b><small>Everyone in Kinetic Crew</small></span></div></aside><div class="wa-conversation"><header class="wa-chat-head"><span class="wa-room-avatar">KC</span><span><b>Main Crew</b><small>Kinetic Crew group conversation · '+items.length+' messages</small></span></header><div class="wa-messages" id="waMessages">'+chatMessagesMarkup(items)+'</div><form class="wa-composer" data-feature-form="chat"><input type="hidden" name="title" value="Crew message"><textarea name="body" rows="1" maxlength="5000" required placeholder="Message the crew…"></textarea><button type="submit" aria-label="Send message">➤</button></form></div></section>';}

function kcApplyFeaturePageNavigation(){
 const root=$('#app');if(!root)return;
 root.querySelectorAll('[data-kc-feature-navigation]').forEach(node=>node.remove());
 root.querySelectorAll('[data-kc-feature-panel]').forEach(node=>{
  node.removeAttribute('data-kc-feature-panel');
  node.hidden=false;
 });
 root.querySelectorAll('.kc-feature-page-back').forEach(node=>node.remove());
 kcApplyCollectionPagination(root);
}
function kcApplyCollectionPagination(root){
 const selectors=['.eventgrid','.profile-directory','.feature-feed','.social-feed-list','.announcements','.kc-poll-list','.leaderboard-list','.crew-manage-list','.calendar-list'];
 selectors.forEach(selector=>{
  root.querySelectorAll(selector).forEach((list,index)=>{
   if(list.closest('[data-kc-feature-panel][hidden]'))return;
   const items=[...list.children].filter(node=>!node.matches('[data-kc-pagination-control]'));
   if(items.length<=6)return;
   const key=selector.replace(/[^a-z]/gi,'')+'-'+index;
   const old=list.parentElement?.querySelector(':scope > [data-kc-pagination-control="'+key+'"]');
   if(old)old.remove();
   const state=Number(list.dataset.kcPageSize||6);
   items.forEach((item,i)=>{item.hidden=i>=state;});
   if(state>=items.length)return;
   const more=document.createElement('button');more.type='button';more.className='kc-collection-more';more.dataset.kcPaginationControl=key;more.dataset.kcPaginationList=selector;more.textContent='Show '+Math.min(6,items.length-state)+' more · '+(items.length-state)+' remaining';
   list.insertAdjacentElement('afterend',more);
  });
 });
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-kc-pagination-control]');
 if(!button)return;
 event.preventDefault();
 const list=button.previousElementSibling,selector=button.dataset.kcPaginationList||'';
 if(!list||!selector||!list.matches(selector))return;
 const items=[...list.children].filter(node=>!node.matches('[data-kc-pagination-control]'));
 const current=Math.max(6,Number(list.dataset.kcPageSize||6));
 list.dataset.kcPageSize=String(Math.min(items.length,current+6));
 kcApplyCollectionPagination(button.closest('#app')||document.getElementById('app'));
});
function kcOpenFeaturePage(index){
 const menu=$('#app [data-kc-feature-navigation]');const panels=[...document.querySelectorAll('#app [data-kc-feature-panel]')];
 if(!menu||!panels.length)return;
 const panel=panels.find(node=>node.dataset.kcFeaturePanel===String(index));if(!panel)return;
 menu.hidden=true;panels.forEach(node=>{node.hidden=node!==panel;});
 let back=panel.querySelector(':scope > .kc-feature-page-back');
 if(!back){back=document.createElement('button');back.type='button';back.className='kc-feature-page-back';back.dataset.kcFeatureBack='true';back.textContent='← All sections';panel.insertBefore(back,panel.firstChild);}
 kcApplyCollectionPagination(panel);panel.scrollIntoView({behavior:'instant',block:'start'});
}
function kcBackToFeatureMenu(){
 const menu=$('#app [data-kc-feature-navigation]');if(!menu)return;
 document.querySelectorAll('#app [data-kc-feature-panel]').forEach(node=>node.hidden=true);
 menu.hidden=false;menu.scrollIntoView({behavior:'smooth',block:'start'});
}

function paint(){
document.body.classList.toggle('kc-more-open',S.view==='more');document.body.classList.toggle('kc-home-screen',S.view==='overview');const headerBell=document.querySelector('.kc-header-notifications');if(headerBell)headerBell.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>'+(unread()?'<i></i>':'');const headerProfile=document.querySelector('.kc-header-profile');if(headerProfile)headerProfile.innerHTML=avatarMarkup(S.user||{},'small');
const communityItems=[['polls','◉','Polls & voting'],['memories','▧','KC Memories'],['leave','↗','Leave requests'],['updates','↗','Crew updates'],['people','♙','Discover crew']];
const groups=[
 ['overview',superadmin()?'SUPER ADMIN':admin()?'ADMIN SPACE':'MEMBER SPACE',superadmin()?'Full platform control':admin()?'Crew operations':'Your crew at a glance',[['overview','⌂','Overview']]],
 ['events','EVENTS','Performances & sessions',[['events','▦','Events'],['rehearsals','◷','Rehearsals'],['calendar','▦','Calendar'],['attendance','◎','Attendance report']]],
 ['chat',admin()?'CREW COMMUNITY':'CREW SPACE',admin()?'Member community and activity':'Talk, vote and share',communityItems],
 ['notifications','NOTIFICATIONS','Updates & alerts',[['notifications','♧','Notifications']]],
 ...(admin()?[
 ['management','CREW MANAGEMENT',superadmin()?'Roles, members and pending requests':'Crew members and pending requests',[['crew-management','♙','Crew Members'],['member-requests','⌛','Member Requests'],['custom-alerts','♧','Custom App Alerts']]],
 ['audition-portal','AUDITION PORTAL','Review applicants and audition videos',[['audition-admin','◎','Audition Management']]]
 ]:[]),
 ['kc-meet','KC MEET','Live crew connection',[['meet','◉','KC Meet']]],
 ['settings','MY ACCOUNT','Your preferences',[['profile','◉','My profile'],['settings','⚙','App settings'],['credits','✧','Credits']]]
]
$('#nav').innerHTML=groups.map(([id,label,sub,items])=>{
const expanded=S.navOpen===id;
return '<section class="nav-group '+(expanded?'expanded':'')+'" data-nav-group-panel="'+id+'"><button type="button" class="nav-group-toggle '+(expanded?'expanded':'')+'" data-nav-group="'+id+'" aria-expanded="'+expanded+'"><span class="nav-group-symbol">'+({overview:'⌂',events:'▦',chat:'✉',notifications:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',management:'♙','audition-portal':'◎',settings:'⚙','kc-meet':'◉'}[id])+'</span><span class="nav-group-label"><b>'+label+'</b><small>'+sub+'</small></span><span class="nav-group-chevron">⌄</span></button><div class="nav-group-items" '+(expanded?'':'hidden')+'>'+items.map(n=>n[0]==='audition-admin'?'<button type="button" class="navitem '+(S.view==='audition-admin'?'active':'')+'" data-audition-admin><span class="nicon">'+n[1]+'</span><span>'+n[2]+'</span><span class="count">PORTAL</span></button>':'<button class="navitem '+(S.view===n[0]?'active':'')+'" data-view="'+n[0]+'"><span class="nicon">'+n[1]+'</span><span>'+n[2]+'</span>'+(n[0]==='notifications'&&unread()?'<span class="count">'+unread()+'</span>':'')+(n[0]==='member-requests'&&(S.pendingMembers||[]).length?'<span class="count">'+S.pendingMembers.length+'</span>':'')+'</button>').join('')+'</div></section>';
}).join('')+'<button type="button" class="kc-nav-signout" data-kc-signout><span>↗</span><b>Sign out</b></button>';
const crumb=$('#crumb');if(crumb)crumb.textContent=({overview:'Overview',more:'More','kc-more-ads-admin':'Promotional Banner',events:'Events',meet:'KC Meet','new-event':'Create event','event-edit':'Edit event',chat:'Crew chat','gram-chat':'Kinetic Gram Chats','kc-connect':'KC Connect','kc-rewards-admin':'Rewards Management',feed:'Crew Feed',memes:'Meme Zone','fun-zone-games':'Mini Games',notifications:'Notifications',people:'Discover crew','fun-zone':'Fun Zone',credits:'Credits','public-profile':'Crew profile','crew-management':'Crew Management','member-requests':'Member Requests','custom-alerts':'Custom App Alerts',attendance:'Attendance','brand-settings':'Brand identity',profile:'My profile',settings:'App settings',developer:'Meet the developer','appearance-settings':'Appearance','notification-settings':'Notification settings','device-settings':'Device & session','app-info':'About Kinetic Crew','app-suggestions':'App suggestions',calendar:'Calendar',rehearsals:'Rehearsals',auditions:'Auditions',leaderboard:'Leaderboard'}[S.view]||'Crew management');
const fn={overview:home,more:morePage,events:eventsPage,rehearsals:rehearsalsPage,meet:meetPage,'event-detail':eventDetailPage,'event-edit':()=>eventForm(S.events.find(x=>String(x.id)===String(S.editingEventId))||null,S.eventMode||'events'),'new-event':()=>eventForm(null,'events'),'new-rehearsal':()=>eventForm(null,'rehearsals'),'rehearsal-edit':()=>eventForm(S.events.find(x=>String(x.id)===String(S.editingEventId))||null,'rehearsals'),chat:chatPage,'gram-chat':()=>window.kcGramChatPage?window.kcGramChatPage():empty('Kinetic Gram chats','Messaging is loading. Please reopen this page.'),'kc-connect':kcConnectPage,'kc-rewards-admin':kcRewardsAdminPage,'kc-more-ads-admin':()=>window.kcMoreAdsAdminPage?window.kcMoreAdsAdminPage():empty('Promotional Banner','Banner manager is loading.'),feed:socialFeedPage,memes:memeZonePage,'fun-zone-games':miniGamesPage,notifications:notificationsPage,updates:updatesPage,profile:profilePage,'app-settings':settingsPage,people:peoplePage,'public-profile':publicProfilePage,'crew-management':crewManagementPage,'member-requests':memberRequestsPage,'custom-alerts':customAlertsPage,attendance:attendancePage,'brand-settings':brandSettingsPage,settings:settingsPage,developer:developerPage,'appearance-settings':appearanceSettingsPage,'notification-settings':notificationSettingsPage,'device-settings':deviceSettingsPage,'app-info':appInfoPage,'app-suggestions':appSuggestionsPage,calendar:calendarPage,polls:()=>featurePage('polls'),memories:()=>featurePage('memories'),achievements:()=>featurePage('achievements'),leave:()=>featurePage('leave'),'fun-zone':funZonePage,credits:creditsPage}[S.view]||home;
$('#app').innerHTML=(S.error?'<div class="alert"><span>'+esc(S.error)+'</span><button data-clear>×</button></div>':'')+(S.offline?'<div class="offline-strip">OFFLINE · LAST SAVED DATA</div>':'')+fn();savePageState();
if(S.view==='custom-alerts')loadScheduledCustomAlerts();
if(S.view==='app-info'&&!S.aboutDataLoaded&&!S.aboutDataLoading)loadAppInfoData();
if(S.view==='kc-connect')loadKCConnectDashboard();
if(S.view==='kc-rewards-admin')loadKCRewardsAdmin();
if(S.view==='kc-more-ads-admin'&&window.loadKcMoreAdsAdmin)window.loadKcMoreAdsAdmin();
if(S.view==='more'){
 const cleanAdminMenu=()=>{
  const page=document.querySelector('.kc-more-reference');
  if(!page)return;
  page.querySelectorAll('#kc-admin-menu-shortcuts,.kc-admin-shortcuts').forEach(node=>node.remove());
  const groups=[...page.querySelectorAll('.kc-more-reference-group')].filter(node=>node.querySelector(':scope > h2')?.textContent.trim()==='Crew administration');
  if(groups.length>1){
   const keep=groups.find(node=>node.querySelector('[data-audition-admin]'))||groups[0];
   groups.forEach(node=>{if(node!==keep)node.remove();});
  }
 };
 requestAnimationFrame(cleanAdminMenu);
}
if(S.view==='event-detail'&&admin())loadTicketRecipientRoster(S.selectedEvent);
renderProfileQrCards();
kcApplyFeaturePageNavigation();
const founderProfileEntry=S.view==='profile'&&superadmin()&&!document.body.classList.contains('kc-founder-profile-open');
if(S.view!=='profile')document.body.classList.remove('kc-founder-profile-open');
if(founderProfileEntry){
 document.body.classList.add('kc-founder-profile-open');
 const founderApp=$('#app');founderApp.classList.add('kc-founder-enter');
 setTimeout(()=>founderApp.classList.remove('kc-founder-enter'),1650);
}
if(S.homeCarouselTimer){clearInterval(S.homeCarouselTimer);S.homeCarouselTimer=null;}if(S.homeRailTimer){clearInterval(S.homeRailTimer);S.homeRailTimer=null;}if(S.homeCountdownTimer){clearInterval(S.homeCountdownTimer);S.homeCountdownTimer=null;}
if(S.view==='overview'){
 const updateEventCountdowns=()=>{
  document.querySelectorAll('.kc-home-feature-slide[data-starts-at]').forEach(slide=>{
   const target=new Date(slide.dataset.startsAt).getTime(),remaining=target-Date.now(),box=slide.querySelector('[data-event-countdown]');
   if(!box||!Number.isFinite(target))return;
   if(remaining<=0){
    if(!box.classList.contains('is-started')){
     box.classList.add('is-started');
     box.hidden=false;
     box.innerHTML='<strong>EVENT STARTED</strong>';
     const justStarted=true;
     let alreadyShown=false;
     try{alreadyShown=localStorage.getItem('kc-event-started-'+slide.dataset.eventId)==='1';}catch{}
     if(justStarted&&!alreadyShown){
      try{localStorage.setItem('kc-event-started-'+slide.dataset.eventId,'1');}catch{}
      const celebration=document.createElement('div');celebration.className='kc-countdown-celebration';celebration.setAttribute('aria-hidden','true');
      celebration.innerHTML='<strong>EVENT STARTED</strong><div class="kc-countdown-confetti">'+Array.from({length:24},(_,i)=>'<i style="--x:'+((i*37+9)%100)+'%;--i:'+i+';--drift:'+(i%2?24:-24)+'px"></i>').join('')+'</div>';
      slide.appendChild(celebration);slide.classList.add('is-celebrating');
      setTimeout(()=>{slide.classList.remove('is-celebrating');celebration.remove();},3200);
     }
    }
    return;
   }
   const total=Math.floor(remaining/1000),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
   const put=(key,value)=>{const node=box.querySelector('[data-countdown-'+key+']');if(node)node.textContent=String(value).padStart(2,'0');};
   put('days',days);put('hours',hours);put('minutes',minutes);put('seconds',seconds);
  });
 };
 updateEventCountdowns();
 S.homeCountdownTimer=setInterval(updateEventCountdowns,1000);
 // Remove the stray legacy placeholder text seen on the home screen.
 const homeRoot=document.getElementById('app');
 if(homeRoot){const cleanStrayText=()=>{const walker=document.createTreeWalker(homeRoot,NodeFilter.SHOW_TEXT);const stray=[];while(walker.nextNode()){const value=(walker.currentNode.nodeValue||'').trim();if(value==='ONaN'||value==='NaN'||value==='0')stray.push(walker.currentNode);}stray.forEach(node=>node.remove());};cleanStrayText();requestAnimationFrame(cleanStrayText);}
 const homeCarousel=document.querySelector('.kc-home-featured');
 const homeSlides=[...(homeCarousel?.querySelectorAll('[data-home-slide]')||[])];
 const homeDots=[...(homeCarousel?.querySelectorAll('[data-home-slide-to]')||[])];
 if(homeCarousel&&homeSlides.length){
  let current=Math.max(0,homeSlides.findIndex(slide=>slide.classList.contains('is-active')));
  let swipeStartX=0,swipeStartY=0,swipePointer=null,mouseStart=null,suppressSlideClickUntil=0;
  const reducedMotion=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const stopCarousel=()=>{if(S.homeCarouselTimer){clearInterval(S.homeCarouselTimer);S.homeCarouselTimer=null;}};
  const show=next=>{
   current=((Math.trunc(Number(next)||0)%homeSlides.length)+homeSlides.length)%homeSlides.length;
   homeSlides.forEach((slide,i)=>{
    const active=i===current,previous=homeSlides.length>2&&i===(current-1+homeSlides.length)%homeSlides.length,next=homeSlides.length>1&&i===(current+1)%homeSlides.length;
    slide.classList.toggle('is-active',active);slide.classList.toggle('is-prev',previous&&!active);slide.classList.toggle('is-next',next&&!active);slide.classList.toggle('is-hidden-side',!active&&!previous&&!next);
    slide.setAttribute('aria-hidden',active?'false':'true');if('inert' in slide)slide.inert=!active;
   });
   homeDots.forEach((dot,i)=>{const active=i===current;dot.classList.toggle('active',active);dot.setAttribute('aria-current',active?'true':'false');dot.setAttribute('aria-label','Show slide '+(i+1)+' of '+homeSlides.length);});
  };
  const startCarousel=()=>{stopCarousel();if(homeSlides.length>1&&!document.hidden&&!reducedMotion()&&homeCarousel.isConnected&&!homeCarousel.matches(':hover')&&!homeCarousel.contains(document.activeElement))S.homeCarouselTimer=setInterval(()=>show(current+1),5200);};
  const finishSwipe=(x,y)=>{const dx=x-swipeStartX,dy=y-swipeStartY;if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.15){show(current+(dx<0?1:-1));suppressSlideClickUntil=Date.now()+700;}swipePointer=null;mouseStart=null;startCarousel();};
  show(current);
  homeDots.forEach(dot=>dot.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show(Number(dot.dataset.homeSlideTo));startCarousel();}));
  homeCarousel.addEventListener('click',event=>{if(Date.now()<suppressSlideClickUntil||event.target.closest('.kc-home-featured-dots'))return;const slide=event.target.closest('[data-home-slide]');if(!slide||slide.classList.contains('kc-slide-empty'))return;const id=slide.dataset.eventId;if(!id)return;S.selectedEvent=id;S.eventMode=slide.dataset.eventMode==='rehearsals'?'rehearsals':'events';go('event-detail');});
  homeCarousel.addEventListener('keydown',event=>{if(event.target.closest('.kc-home-featured-dots'))return;if(event.key!=='Enter'&&event.key!==' ')return;const slide=event.target.closest('[data-home-slide]');if(!slide||slide.classList.contains('kc-slide-empty'))return;event.preventDefault();S.selectedEvent=slide.dataset.eventId;S.eventMode=slide.dataset.eventMode==='rehearsals'?'rehearsals':'events';go('event-detail');});
  homeSlides.forEach(slide=>{if(!slide.classList.contains('kc-slide-empty')){slide.setAttribute('role','link');slide.setAttribute('tabindex','0');slide.setAttribute('aria-label','Open event: '+(slide.querySelector('.kc-countdown-event-details>b')?.textContent||'Crew event'));}});
  homeCarousel.style.setProperty('touch-action','pan-y pinch-zoom','important');
  homeCarousel.addEventListener('pointerdown',event=>{if(event.target.closest('.kc-home-featured-dots'))return;if(event.pointerType==='touch'||event.pointerType==='pen'){stopCarousel();swipeStartX=event.clientX;swipeStartY=event.clientY;swipePointer=event.pointerId;}else if(event.pointerType==='mouse'){stopCarousel();mouseStart={x:event.clientX,y:event.clientY};}},{passive:true});
  document.addEventListener('pointerup',event=>{if(swipePointer===event.pointerId)finishSwipe(event.clientX,event.clientY);else if(mouseStart){const dx=event.clientX-mouseStart.x,dy=event.clientY-mouseStart.y;mouseStart=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.15){show(current+(dx<0?1:-1));suppressSlideClickUntil=Date.now()+700;}startCarousel();}},{passive:true});
  document.addEventListener('pointercancel',event=>{if(swipePointer===event.pointerId){swipePointer=null;startCarousel();}},{passive:true});
  homeCarousel.addEventListener('touchstart',event=>{if(swipePointer!==null)return;const t=event.changedTouches[0];if(!t)return;stopCarousel();swipeStartX=t.clientX;swipeStartY=t.clientY;swipePointer='touch';},{passive:true});
  homeCarousel.addEventListener('touchend',event=>{if(swipePointer!=='touch')return;const t=event.changedTouches[0];if(t)finishSwipe(t.clientX,t.clientY);else{swipePointer=null;startCarousel();}},{passive:true});
  homeCarousel.addEventListener('touchcancel',()=>{if(swipePointer==='touch'){swipePointer=null;startCarousel();}},{passive:true});
  homeCarousel.addEventListener('mouseenter',stopCarousel);homeCarousel.addEventListener('mouseleave',startCarousel);
  homeCarousel.addEventListener('focusin',stopCarousel);homeCarousel.addEventListener('focusout',()=>requestAnimationFrame(()=>{if(!homeCarousel.contains(document.activeElement))startCarousel();}));
  homeSlides.forEach(slide=>{const img=slide.querySelector('.kc-home-feature-image');if(img&&!img.dataset.kcCarouselErrorBound){img.dataset.kcCarouselErrorBound='true';img.addEventListener('error',()=>{img.hidden=true;img.style.setProperty('display','none','important');slide.style.removeProperty('--kc-home-feature-image');slide.classList.add('has-image-error');});img.addEventListener('load',()=>{img.hidden=false;img.style.removeProperty('display');slide.classList.remove('has-image-error');});}});
  if(S.homeCarouselVisibilityHandler)document.removeEventListener('visibilitychange',S.homeCarouselVisibilityHandler);
  S.homeCarouselVisibilityHandler=()=>{if(!homeCarousel.isConnected)return;if(document.hidden)stopCarousel();else startCarousel();};
  document.addEventListener('visibilitychange',S.homeCarouselVisibilityHandler);startCarousel();
 }
 const rail=document.querySelector('.kc-home-updates'),track=rail?.querySelector('.kc-home-updates-track'),dots=[...(rail?.querySelectorAll('.kc-home-update-dots span')||[])],count=dots.length;
 if(track&&count>1){
  let index=0;
  const move=next=>{index=(next+count)%count;track.style.transform='translate3d('+(-index*100)+'%,0,0)';dots.forEach((dot,i)=>dot.classList.toggle('active',i===index));const label=rail.querySelector('.kc-home-update-count');if(label)label.textContent=String(index+1).padStart(2,'0')+' / '+String(count).padStart(2,'0');};
  S.homeRailTimer=setInterval(()=>move(index+1),5500);
  rail.addEventListener('mouseenter',()=>clearInterval(S.homeRailTimer));
  rail.addEventListener('mouseleave',()=>{clearInterval(S.homeRailTimer);S.homeRailTimer=setInterval(()=>move(index+1),5500);});
  rail.addEventListener('touchstart',()=>clearInterval(S.homeRailTimer),{passive:true});
  rail.addEventListener('touchend',()=>{clearInterval(S.homeRailTimer);S.homeRailTimer=setInterval(()=>move(index+1),5500);},{passive:true});
 }
}
}
function brandSettingsPage(){
 if(!superadmin())return empty('Super Admin access required','Only the Super Admin can change the official Kinetic Crew logo.');
 const brandAssets=S.appSettings?.brand_logo_assets||{};
 const current=brandAssets.app||S.appSettings?.brand_logo_url||window.KC_BRAND_LOGO_URL||window.kcPath('kinetic-crew-logo.svg');
 const brandTargets={app:true,browser:true,pwa:true,signin:true,email:false,notifications:true,share_cards:true,...(S.appSettings?.brand_logo_targets||{}),external_forms:true};
 const allBrandTargets=['app','browser','pwa','signin','email','notifications','share_cards','external_forms'].every(key=>brandTargets[key]);
 setTimeout(()=>{kcBrandDraw();kcBrandSetControls(!!kcBrandEditor.image);},0);
 return welcome('Brand identity','Choose exactly where the new official logo should appear across Kinetic Crew.')+
 '<section class="surface settings-card kc-brand-settings-card">'+
 '<span class="settings-kicker">SUPER ADMIN ONLY</span><h3>Official Kinetic Crew logo</h3>'+
 '<p>Choose an image, then position and scale it inside the square brand canvas before publishing. Drag to move, pinch with two fingers to zoom, or use the controls below.</p>'+
 '<div class="kc-brand-editor-layout">'+
 '<div class="kc-brand-editor-stage" id="brandLogoDropStage"><canvas id="brandLogoCanvas" width="512" height="512" role="img" tabindex="0" aria-label="Logo crop preview. Drag to reposition or pinch to zoom"></canvas><span class="kc-brand-editor-hint">DRAG TO MOVE · PINCH TO ZOOM</span><span class="kc-brand-editor-drop">DROP IMAGE TO REPLACE</span></div>'+
 '<div class="kc-brand-current"><img id="brandLogoCurrent" src="'+esc(current)+'" alt="Current official Kinetic Crew logo"><span>CURRENT LIVE LOGO</span></div>'+
 '</div>'+
 '<label class="kc-brand-file-label" for="brandLogoFile"><span>＋</span> Choose image</label>'+
 '<input id="brandLogoFile" type="file" accept="image/png,image/jpeg,image/webp">'+
 '<p class="kc-brand-editor-status" id="brandLogoEditorStatus" aria-live="polite">'+esc(kcBrandEditor.status||'Choose a PNG, JPG or WebP image to start editing.')+'</p>'+
 '<div class="kc-brand-editor-tools">'+
 '<div class="kc-brand-tool-head"><span>IMAGE POSITION</span><button type="button" class="kc-brand-text-btn" id="brandLogoReset">Reset</button></div>'+
 '<div class="kc-brand-mode-row"><button type="button" class="kc-brand-mode active" data-brand-fit="contain">Fit image</button><button type="button" class="kc-brand-mode" data-brand-fit="cover">Fill square</button></div>'+
 '<label class="kc-brand-zoom-label" for="brandLogoZoom"><span>Zoom</span><output id="brandLogoZoomValue">100%</output></label>'+
 '<input id="brandLogoZoom" type="range" min="50" max="300" step="1" value="100" disabled>'+
 '<div class="kc-brand-editor-actions"><button type="button" id="brandLogoRotate" disabled>↻ Rotate 90°</button><button type="button" id="brandLogoCenter" disabled>Center image</button></div>'+
 '</div>'+
 '<small class="kc-brand-file-help">PNG, JPG or WebP · maximum 5 MB · transparent areas are preserved. The final icon is exported at 512 × 512.</small><div class="kc-brand-targets"><div class="kc-brand-targets-head"><b>WHERE SHOULD THIS LOGO UPDATE?</b><span>Select destinations</span></div><label class="kc-brand-select-all"><input type="checkbox" data-brand-select-all '+(allBrandTargets?'checked':'')+'><span><b>Select all destinations</b><small>Update every brand location with this image</small></span></label><label><input type="checkbox" data-brand-target="app" '+(brandTargets.app?'checked':'')+'><span><b>App interface</b><small>Headers, menus, profile and in-app logo placements</small></span></label><label><input type="checkbox" data-brand-target="browser" '+(brandTargets.browser?'checked':'')+'><span><b>Browser icon</b><small>Favicon and browser tab branding</small></span></label><label><input type="checkbox" data-brand-target="pwa" '+(brandTargets.pwa?'checked':'')+'><span><b>Installed app icon</b><small>Android / iOS home-screen and PWA icon</small></span></label><label><input type="checkbox" data-brand-target="signin" '+(brandTargets.signin?'checked':'')+'><span><b>Sign-in & welcome screens</b><small>Login, signup and entry branding</small></span></label>'+
 '<label><input type="checkbox" data-brand-target="email" '+(brandTargets.email?'checked':'')+'><span><b>Authentication emails</b><small>Verification and one-time login email header</small></span></label><label><input type="checkbox" data-brand-target="notifications" '+(brandTargets.notifications?'checked':'')+'><span><b>Notifications</b><small>Push notification icon and notification branding</small></span></label><label><input type="checkbox" data-brand-target="share_cards" '+(brandTargets.share_cards?'checked':'')+'><span><b>Promotional share cards</b><small>Use this logo in campaign promotion cards</small></span></label><label><input type="checkbox" data-brand-target="external_forms" checked disabled><span><b>Public advertiser form</b><small>Always sync the official logo to Advertise with Kinetic Crew</small></span></label></div>'+
 '<button type="button" class="primary" id="uploadBrandLogo" disabled>Publish logo everywhere →</button>'+
 (brandAssets.external_forms?'<div class="kc-brand-external-url"><label for="externalFormsLogoUrl">External forms logo URL</label><div><input id="externalFormsLogoUrl" type="url" readonly value="'+esc(brandAssets.external_forms)+'"><button type="button" data-copy-external-brand-url>Copy URL</button></div><small>This URL is automatically used by the public advertiser request form whenever the official logo is published.</small></div>':'')+'<p class="kc-brand-security-note">Your Super Admin account can publish the official logo. PNG, JPG or WebP images up to 5 MB are supported.</p>'+
 '</section>';
}
async function loadAppSuggestions(){
 let query=client.from('crew_app_suggestions').select('id,author_id,category,title,details,status,admin_note,created_at').order('created_at',{ascending:false}).limit(60);
 if(!admin())query=query.eq('author_id',S.user.auth_id);
 const {data,error}=await query;if(error)throw error;S.appSuggestions=data||[];
}
function appSuggestionsSettingsMarkup(){
 const rows=S.appSuggestions||[];
 const statusLabel={new:'New',reviewing:'Reviewing',planned:'Planned',implemented:'Implemented',declined:'Declined'};
 return '<section class="surface settings-card kc-app-suggestions"><span class="settings-kicker">HELP SHAPE KINETIC CREW</span><h3>App suggestions</h3><p>Suggest a feature, report a bug or share an improvement idea. Available to every crew role.</p><form id="appSuggestionForm" class="kc-app-suggestion-form"><label>Suggestion type<select name="category"><option value="feature">New feature</option><option value="bug">Report a bug</option><option value="design">Design & usability</option><option value="performance">Performance</option><option value="other">Other</option></select></label><label>Title<input name="title" maxlength="120" minlength="3" required placeholder="What should we improve?"></label><label>Details<textarea name="details" rows="3" minlength="10" maxlength="3000" required placeholder="Describe the idea or issue…"></textarea></label><button class="primary" type="submit">Send app suggestion ↗</button></form><div class="kc-app-suggestion-list"><h4>'+(admin()?'Crew suggestions':'Your suggestions')+'</h4>'+(rows.length?rows.map(row=>'<article class="kc-app-suggestion-item"><div class="kc-app-suggestion-meta"><span>'+esc(String(row.category||'other').toUpperCase())+'</span><b class="kc-suggestion-status kc-status-'+esc(row.status)+'">'+esc(statusLabel[row.status]||row.status)+'</b></div><h5>'+esc(row.title)+'</h5><p>'+esc(row.details)+'</p>'+(admin()?'<form class="kc-suggestion-review-form" data-suggestion-admin-form="'+esc(row.id)+'"><label>Status<select name="status">'+Object.entries(statusLabel).map(([value,label])=>'<option value="'+value+'" '+(row.status===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Admin note<textarea name="admin_note" rows="2" maxlength="1000" placeholder="Optional reply to the member…">'+esc(row.admin_note||'')+'</textarea></label><button class="outline" type="submit">Save review</button></form>':(row.admin_note?'<p class="kc-suggestion-admin-note"><b>Admin response:</b> '+esc(row.admin_note)+'</p>':''))+'</article>').join(''):'<p class="hint">No suggestions yet. Your ideas can help improve the app.</p>')+'</div></section>';
}
function settingsIcon(name){
 const paths={
  profile:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.2 3-5 7-5s6.3 1.8 7 5"/>',
  appearance:'<path d="M12 3a9 9 0 1 0 0 18z"/><path d="M12 3a9 9 0 0 1 0 18"/>',
  notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  device:'<rect x="6" y="2.8" width="12" height="18.4" rx="2.4"/><path d="M10 18h4"/>',
  about:'<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
  brand:'<path d="m12 2 9 10-9 10L3 12z"/>',
  developer:'<circle cx="12" cy="8" r="3.5"/><path d="M4 21c.8-4 3.4-6 8-6s7.2 2 8 6"/>',
  suggestions:'<path d="m4 20 4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16z"/><path d="m14.5 6.5 3 3M4 20l-1 1"/>',
  voice:'<path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3m-4 0h8"/>'
 };
 return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.about)+'</svg>';
}
function settingsPage(){
 const version=window.KC_APP_VERSION||'1.2.2';
 const tiles=[
  ['change-password','settings','Change password','Update your sign-in password'],
  ['profile','profile','My profile','Photo, name and crew identity'],
  ['appearance-settings','appearance','Appearance','Theme and display preferences'],
  ['notification-settings','notifications','Notifications','Push alerts and in-app sound'],
  ['device-settings','device','Device & session','Cache maintenance'],
  ['app-info','about','About Kinetic Crew','App version and information'],
  ['developer','developer','Meet the developer','The person behind the app'],
  ['app-suggestions','suggestions','App suggestions','Share an idea or report an issue']
 ];
 if(superadmin())tiles.splice(5,0,['brand-settings','brand','App icon & logo','Update the official app identity']);
 return welcome('App settings','Choose a section. Each option opens its own focused page.')+
 '<div class="kc-settings-hub">'+tiles.map(([view,icon,title,sub])=>'<button type="button" class="kc-settings-tile" '+(view==='change-password'?'data-open-change-password':'data-view="'+view+'"')+'><span class="kc-settings-tile-icon">'+settingsIcon(icon)+'</span><span class="kc-settings-tile-copy"><b>'+title+'</b><small>'+sub+'</small></span><span class="kc-settings-tile-arrow" aria-hidden="true">↗</span></button>').join('')+
 '<button type="button" class="kc-settings-tile" data-kc-voice-settings><span class="kc-settings-tile-icon">'+settingsIcon('voice')+'</span><span class="kc-settings-tile-copy"><b>KC Voice</b><small>Hands-free commands · English, Hindi & Telugu</small></span><span class="kc-settings-tile-arrow" aria-hidden="true">↗</span></button></div>'+
 '<div class="kc-settings-signout"><span><b>Sign out</b><small>End your session on this device</small></span><button type="button" id="settingsSignOut" aria-label="Sign out">Sign out <span aria-hidden="true">↗</span></button></div>'+
 '<p class="kc-settings-version">KINETIC CREW · v'+esc(version)+'</p>';
}
function settingsSubpage(title,sub,body){
 return welcome(title,sub,'<button type="button" class="outline kc-page-back" data-view="settings">← Back to settings</button>')+body;
}
function appearanceSettingsPage(){
 return settingsSubpage('Appearance','Choose how Kinetic Crew looks on this device.',
 '<section class="surface settings-card kc-settings-detail"><span class="settings-kicker">DISPLAY THEME</span><h3>Make it yours</h3><p>Your choice applies across the app.</p><div class="settings-choice"><button type="button" class="outline" data-set-theme="dark">☾ Dark</button><button type="button" class="outline" data-set-theme="light">☀ Light</button></div></section>');
}
function notificationSettingsPage(){
 const prefs=notificationPrefs();
 return settingsSubpage('Notification settings','Control how Kinetic Crew alerts you.',
 '<section class="surface settings-card kc-settings-detail"><span class="settings-kicker">ALERT PREFERENCES</span><h3>Stay in the loop</h3><label class="settings-toggle"><span><b>In-app sound</b><small>Play a louder, longer alert tone for crew activity.</small></span><input id="settingsSound" type="checkbox" '+(prefs.sound?'checked':'')+'></label><label class="settings-toggle"><span><b>Push notifications</b><small>Receive alerts when Kinetic Crew is not open.</small></span><button type="button" class="outline" id="enablePush">'+(prefs.push?'Enabled ✓':'Enable')+'</button></label>'+(S.user?.role!=='audition_participant'?'<label class="settings-toggle"><span><b>Promotional updates</b><small>Occasional event promotions, crew inspiration and app highlights. Delivery times vary. You can turn this off anytime.</small></span><input type="checkbox" id="promotionalUpdates" '+(S.promotionalUpdatesEnabled?'checked':'')+'></label>':'')+'<button type="button" class="outline" data-view="notifications">Open notification inbox →</button></section>');
}
function deviceSettingsPage(){
 return settingsSubpage('Device & session','Manage temporary app files on this device.',
 '<section class="surface settings-card kc-settings-detail"><span class="settings-kicker">DEVICE MAINTENANCE</span><h3>App cache</h3><p>Clear temporary cached files without changing your crew account.</p><button type="button" class="outline" id="clearAppCache">Clear app cache</button></section>');
}
async function loadAppInfoData(){
 if(S.aboutDataLoading||S.aboutDataLoaded)return;
 S.aboutDataLoading=true;
 try{
  const result=await rpc('crew_app_info_get',{});
  if(result.error)throw result.error;
  S.aboutData=result.data||{releases:[],update_details:{}};
  S.aboutDataError='';
 }catch(error){S.aboutDataError=error.message||'App information could not be loaded.';S.aboutData=S.aboutData||{releases:[],update_details:{}};}
 S.aboutDataLoading=false;S.aboutDataLoaded=true;
 if(S.view==='app-info')paint();
}
function appInfoPage(){
 const meta=window.kcAppVersionMetadata||{},data=S.aboutData||{},details=data.update_details||{},releases=Array.isArray(data.releases)?data.releases:[];
 const version=String(details.version||window.KC_APP_VERSION||meta.version||'1.7.02'),title=String(details.title||'Latest improvements'),summary=String(details.summary||meta.release_notes||'The latest Kinetic Crew improvements and fixes.');
 const features=Array.isArray(details.features)?details.features:[],fixes=Array.isArray(details.fixes)?details.fixes:[];
 const history=releases.map(item=>'<details class="kc-about-history-item"><summary><span><b>v'+esc(item.version)+'</b><strong>'+esc(item.title)+'</strong></span><small>'+esc(item.published_at?new Date(item.published_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'')+'</small></summary><p>'+esc(item.summary||'')+'</p>'+(Array.isArray(item.features)&&item.features.length?'<ul>'+item.features.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+(Array.isArray(item.fixes)&&item.fixes.length?'<p class="kc-about-history-fixes">Fixes: '+item.fixes.map(esc).join(' · ')+'</p>':'')+'</details>').join('');
 const editForm=superadmin()?'<div class="kc-about-admin-actions"><button type="button" class="outline" data-kc-about-edit>✎ Manage version & updates</button></div><form id="kcAboutEditForm" class="kc-about-edit-form" hidden><label>App version number<input name="version" maxlength="32" pattern="[0-9]+[.][0-9]+[.][0-9]+([+-][A-Za-z0-9.-]+)?" required value="'+esc(version)+'" placeholder="1.7.02"></label><small>Version label shown in the app. Publishing code changes still requires a deployment.</small><label>Update heading<input name="title" maxlength="140" required value="'+esc(title)+'"></label><label>What’s new<textarea name="summary" rows="3" maxlength="2000" required>'+esc(summary)+'</textarea></label><label>New features <small>One item per line</small><textarea name="features" rows="3">'+esc(features.join('\\n'))+'</textarea></label><label>Fixes <small>One item per line</small><textarea name="fixes" rows="2">'+esc(fixes.join('\\n'))+'</textarea></label><div class="kc-about-edit-actions"><button type="submit" class="primary">Publish update details</button><button type="button" class="outline" data-kc-about-cancel>Cancel</button></div><small class="kc-about-edit-status" aria-live="polite"></small></form>':'';
 return settingsSubpage('About Kinetic Crew','Software information, update notes and release history.','<section class="surface settings-card kc-settings-detail kc-about-software"><div class="kc-about-version-head"><span class="settings-kicker">KINETIC CREW · SOFTWARE</span><span class="kc-about-current-pill">CURRENT VERSION</span></div><h3>Kinetic Crew</h3><div class="kc-about-version-number">v'+esc(version)+'</div><p class="kc-about-developer">Developer · '+esc((S.appSettings||{}).developer||'Kinetic Crew Development Team')+'</p><div class="kc-about-update-state"><span class="kc-about-update-dot"></span><span>Updates are checked automatically when the app opens and returns to the foreground.</span><button type="button" class="outline kc-about-check-updates" data-kc-check-updates>Check for updates</button></div><div class="kc-about-whats-new"><span class="settings-kicker">WHAT’S NEW</span><h4>'+esc(title)+'</h4><p>'+esc(summary)+'</p>'+(features.length?'<ul>'+features.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+(fixes.length?'<p class="kc-about-history-fixes">Fixes: '+fixes.map(x=>esc(x)).join(' · ')+'</p>':'')+'</div>'+editForm+'<details class="kc-about-version-history"><summary><span>Version history</span><small>'+releases.length+' release'+(releases.length===1?'':'s')+'</small></summary><div class="kc-about-history-list">'+(history||'<p class="kc-about-history-empty">'+(S.aboutDataLoading?'Loading release history…':'No previous release notes have been published yet.')+'</p>')+'</div></details>'+(S.aboutDataError?'<p class="kc-about-history-empty">'+esc(S.aboutDataError)+'</p>':'')+'</section>');
}
function developerPage(){
 const links=[['GitHub','https://github.com/jamidineshkumar','GH'],['LinkedIn','https://in.linkedin.com/in/jami-dinesh-kumar-696478358','in'],['Instagram','https://www.instagram.com/dinuvox/','◎'],['YouTube','https://www.youtube.com/@Dinuvoxx','▶']];
 const photo=S.appSettings?.developer_photo_url||'';
 return '<section class="kc-developer-profile" aria-label="Developer profile">'+
 '<div class="kc-developer-cover">'+(photo?'<img class="kc-developer-cover-photo" src="'+esc(photo)+'" alt="Jami Dinesh Kumar" loading="eager" onerror="this.hidden=true">':'<div class="kc-developer-cover-placeholder" aria-hidden="true"></div>')+
 '<button type="button" class="kc-developer-back" data-view="settings" aria-label="Back to settings">‹</button>'+
 (superadmin()?'<label class="kc-developer-photo-edit" for="kcDeveloperPhotoInput">✎ Edit photo</label><input id="kcDeveloperPhotoInput" class="kc-developer-photo-input" type="file" accept="image/jpeg,image/png,image/webp">':'')+
 '<span class="kc-developer-cover-mark">KINETIC CREW</span></div>'+
 '<div class="kc-developer-profile-body">'+
 '<h1>JAMI DINESH KUMAR</h1><p class="kc-developer-handle">@dinuvox</p><span class="kc-developer-role">FOUNDER · DEVELOPER</span>'+
 '<p class="kc-developer-bio">The person behind Kinetic Crew.</p>'+
 '<nav class="kc-developer-links" aria-label="Developer social links">'+links.map(([name,url,mark])=>'<a class="kc-developer-link" href="'+url+'" target="_blank" rel="noopener noreferrer" aria-label="'+name+'" title="'+name+'"><span aria-hidden="true">'+mark+'</span></a>').join('')+'</nav></div></section>';
}
function appSuggestionsPage(){
 return settingsSubpage('App suggestions','Help improve Kinetic Crew by sharing an idea or reporting an issue.',appSuggestionsSettingsMarkup());
}
let kcNavigationSequence=0;
async function go(v,options={}){if(S.user&&S.profileCompletionPending&&!profileIsComplete(S.user)&&v!=='profile'){notice('Complete your profile, including your college registration number, before continuing.');v='profile';}if(v!=='crew-management'&&S.profileHistoryInCrew){S.profileHistoryInCrew=false;S.profileHistoryUnlocked=false;S.profileHistoryData=null;}const navigationSequence=++kcNavigationSequence;if(S.view==='custom-alerts'&&v!=='custom-alerts'&&(S.customAlertImagePath||S.customAlertImageUrl)){await removeCustomAlertImage();}if(v==='crew-management'&&!admin()){notice('Admin access required.');v='overview';}if(v==='member-requests'&&!admin()){notice('Member Requests is available only to Admins and Super Admins.');v='overview';}if(!options.fromPop&&(!history.state?.kcApp||history.state.kcView!==v)){try{history.pushState({kcApp:true,kcView:v},'',location.href);}catch(error){console.warn('App navigation history could not be updated:',error);}}const routeChanged=S.view!==v;S.view=v;S.error='';if(v==='attendance')S.attendanceSection='home';savePageState();S.navOpen=({overview:'overview',events:'events',rehearsals:'events','event-detail':'events','event-edit':'events','new-event':'events','new-rehearsal':'events','rehearsal-edit':'events',chat:'chat','gram-chat':'chat',notifications:'notifications',people:'chat',feed:'chat','public-profile':'chat','crew-management':'management','member-requests':'management',meet:'chat',attendance:'management','brand-settings':'management',profile:'settings',settings:'settings',developer:'settings','appearance-settings':'settings','notification-settings':'settings','device-settings':'settings','app-info':'settings','app-suggestions':'settings',calendar:'events',polls:'chat',memories:'chat',achievements:'chat',leave:'chat',auditions:'chat',more:'overview','kc-connect':'overview','kc-rewards-admin':'overview'}[v]||'overview');if(routeChanged)paint();if(S.chatPoll){clearInterval(S.chatPoll);S.chatPoll=null;}if(S.pendingPoll){clearInterval(S.pendingPoll);S.pendingPoll=null;}if(v==='crew-management'||v==='member-requests'){try{if(v==='crew-management'){const directory=await rpc('crew_profile_directory',{});if(directory.error)throw directory.error;S.members=Array.isArray(directory.data)?directory.data:[];}const [pending,rejected]=await Promise.all([rpc('crew_pending_members',{}),rpc('crew_rejected_members',{})]);if(pending.error)throw pending.error;if(rejected.error)throw rejected.error;S.pendingMembers=Array.isArray(pending.data)?pending.data:[];S.rejectedMembers=Array.isArray(rejected.data)?rejected.data:[];}catch(e){S.error=e.message||'Could not load Crew Members data.';}S.pendingPoll=setInterval(async()=>{if(document.hidden||!['crew-management','member-requests'].includes(S.view)||!admin()||S.pendingPollBusy)return;S.pendingPollBusy=true;try{const [pending,rejected]=await Promise.all([rpc('crew_pending_members',{}),rpc('crew_rejected_members',{})]);if(pending.error)throw pending.error;if(rejected.error)throw rejected.error;const next=Array.isArray(pending.data)?pending.data:[],rejectedNext=Array.isArray(rejected.data)?rejected.data:[];const key=x=>JSON.stringify((x||[]).map(m=>[m.auth_id||m.reference,m.requested_at||m.rejected_at]));if(key(next)!==key(S.pendingMembers)||key(rejectedNext)!==key(S.rejectedMembers)){S.pendingMembers=next;S.rejectedMembers=rejectedNext;paint();}}catch(error){console.warn('Pending requests background refresh failed:',error);}finally{S.pendingPollBusy=false;}},60000);}if(v==='people'){try{const {data,error}=await rpc('crew_profile_directory',{});if(error)throw error;S.publicMembers=Array.isArray(data)?data:[];}catch(e){S.publicMembers=[];S.error=e.message||'Could not load crew profiles.';}await loadMemberActionState();}if(v==='feed'||v==='fun-zone'||v==='memes'){try{await loadSocialFeed();}catch(e){S.error=e.message||'Could not load the crew feed.';}}if(v==='app-suggestions'){try{await loadAppSuggestions();}catch(e){S.appSuggestions=[];S.error=e.message||'Could not load app suggestions.';}}if(v==='profile'||v==='public-profile'){try{const {data,error}=await rpc('crew_profile_social',{p_auth_id:v==='public-profile'?S.selectedProfileId:S.user.auth_id});if(error)throw error;S.profileSocial=data||null;if(v!=='public-profile'&&S.profileSocial?.profile)S.user={...S.user,...S.profileSocial.profile};}catch(e){S.profileSocial=null;S.error=e.message||'Could not load profile details.';}}if(v==='profile'){const results=await Promise.allSettled([loadSocialFeed(),(async()=>{const touch=await rpc('crew_profile_login_touch',{});if(touch.error)console.warn('Login streak could not be updated:',touch.error);const [dashboard,stats,achievements]=await Promise.all([rpc('crew_profile_dashboard',{}),rpc('crew_profile_stats',{}),featureApi('list','achievements',{}).catch(error=>{console.warn('Profile achievements could not be loaded:',error);return [];})]);return {dashboard,stats,achievements};})()]);if(results[0].status==='rejected'){S.socialPosts=[];S.socialLikes=[];S.socialComments=[];console.warn('Could not load profile uploads:',results[0].reason);}if(results[1].status==='fulfilled'){const dashboard=results[1].value.dashboard,stats=results[1].value.stats;S.profileAchievements=Array.isArray(results[1].value.achievements)?results[1].value.achievements:[];if(dashboard&&!dashboard.error)S.profileDashboard=dashboard.data||{};else{S.profileDashboard={};console.warn('Could not load profile activity dashboard:',dashboard?.error);}if(stats&&!stats.error)S.profileStats=stats.data||{};else{S.profileStats={};console.warn('Could not load authoritative profile counts:',stats?.error);}}else{S.profileDashboard={};S.profileStats={};console.warn('Could not load profile counters:',results[1].reason);}}setMobileMenu(false);if(v==='notifications'){try{await loadSocialFeed();}catch(error){console.warn('Notification post feed could not refresh:',error);}try{const {data,error}=await client.from('crew_profile_reminders').select('id,title,body,target_url,created_at').order('created_at',{ascending:false}).limit(50);if(error)throw error;S.profileReminders=Array.isArray(data)?data:[];}catch(error){S.profileReminders=[];console.warn('Profile reminders could not be loaded:',error);}}if(v==='memories'){try{const [directory]=await Promise.all([rpc('crew_profile_directory',{}),loadMemories()]);if(directory.error)throw directory.error;S.publicMembers=Array.isArray(directory.data)?directory.data:[];}catch(e){S.error=e.message||'Could not load KC Memories.';}}else if(featureKeys.includes(v)){try{S.featureItems[v]=await featureApi('list',v,{});}catch(e){S.error=e.message||'Could not load this feature.';}}if(v==='leaderboard'){try{S.leaderboard=await featureApi('leaderboard',null,{});}catch(e){S.error=e.message||'Could not load leaderboard.';}}if(navigationSequence!==kcNavigationSequence)return;paint();const viewRoot=$('#app');viewRoot.classList.remove('kc-view-enter');requestAnimationFrame(()=>{if(viewRoot.isConnected)viewRoot.classList.add('kc-view-enter');});viewRoot.addEventListener('animationend',function done(e){if(e.target===viewRoot){viewRoot.classList.remove('kc-view-enter');viewRoot.removeEventListener('animationend',done);}},{once:false});if(v==='chat'){S.chatPoll=setInterval(async()=>{if(document.hidden||S.view!=='chat'||S.chatBusy)return;S.chatBusy=true;try{const rows=await featureApi('list','chat',{});const previous=S.featureItems.chat||[],previousIds=new Set(previous.map(m=>String(m.id)));const incoming=rows.filter(m=>!previousIds.has(String(m.id)));if(incoming.length){const latest=incoming[incoming.length-1];if(String(latest.author_id)!==String(S.user.auth_id)){window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:latest.author_name||'Crew chat',body:latest.body||'Sent you a new message.',target:'chat'}}));if(document.hidden&&'Notification'in window&&Notification.permission==='granted')new Notification('Kinetic Crew · Crew chat',{body:(latest.author_name||'A crew member')+': '+(latest.body||'New message'),icon:window.kcPath('kinetic-crew-logo.svg')});}}if(rows.length!==(S.featureItems.chat||[]).length||incoming.length){S.featureItems.chat=rows;const box=$('#waMessages');if(box){const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;box.innerHTML=chatMessagesMarkup(rows);if(atBottom)box.scrollTop=box.scrollHeight;}}}catch{}finally{S.chatBusy=false;}},20000);}window.scrollTo({top:0,behavior:'auto'});savePageState();}
async function exportMemberRegistrations(){
 if(!admin()){notice('Admin access required.');return;}
 if(!window.XLSX||!window.KcFileExport){notice('Excel export is not ready. Refresh and try again.');return;}
 const pending=(S.pendingMembers||[]).map(m=>({'Name':m.name||'','Email':m.email||'','Username':m.username||'','Registration status':'Pending approval','Requested at':m.requested_at||''}));
 const approved=(S.members||[]).map(m=>({'Name':m.name||'','Username':m.username||'','Role':m.role||'member','Crew title':m.crew_title||''}));
 if(!pending.length&&!approved.length){notice('There are no member registration records to export.');return;}
 const wb=XLSX.utils.book_new();
 if(pending.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(pending),'Pending Registrations');
 if(approved.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(approved),'Approved Members');
 try{const result=await window.KcFileExport.saveXlsx(wb,'Kinetic_Crew_Member_Registrations_'+new Date().toISOString().slice(0,10)+'.xlsx');notice('Member registration Excel saved: '+result.filename+'.');}
 catch(error){notice(error.message||'Could not save the member registration Excel file.');}
}
async function exportAttendance(){
 if(!S.roster?.roster?.length){notice('No attendance rows to export.');return;}
 const rows=[['KINETIC CREW · OFFICIAL ATTENDANCE REPORT'],['Generated by Kinetic Crew'],['Event ID',S.rosterEvent],[],['Member name','Registration number','Email','Attendance status','Registered at'],...S.roster.roster.map(m=>[m.name,m.registration_number||'',m.email,m.status||(m.attended?'present':'pending'),m.registered_at||'']),[],['KINETIC CREW · BUILT TO MOVE TOGETHER']];
 if(window.XLSX){const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:28},{wch:24},{wch:34},{wch:22},{wch:28}];XLSX.utils.book_append_sheet(wb,ws,'Attendance');try{const result=await window.KcFileExport.saveXlsx(wb,'kinetic-crew-attendance-'+S.rosterEvent+'.xlsx');notice('Attendance Excel saved: '+result.filename+'.');}catch(error){notice(error.message||'Could not save the attendance Excel file.');}return;}
 const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kinetic-crew-attendance-'+S.rosterEvent+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notice('Branded attendance CSV downloaded.');
}
async function downloadEventPass(){
 const qr=document.querySelector('#eventQrImage canvas')||document.querySelector('#eventQrImage img');if(!qr){notice('QR code is not ready yet.');return;}
 const eventId=document.querySelector('[data-event-qr]')?.dataset.eventQr||S.selectedEvent;
 const event=S.events.find(x=>String(x.id)===String(eventId))||{};
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1500;const ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,1000,1500);bg.addColorStop(0,'#202822');bg.addColorStop(.58,'#141c19');bg.addColorStop(1,'#0d1512');ctx.fillStyle=bg;ctx.fillRect(0,0,1000,1500);
 ctx.strokeStyle='#b89a4e';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(28,28,944,1444,42);ctx.stroke();
 const draw=(v,x,y,size,color='#f6f0df',weight='600',align='left')=>{ctx.font=weight+' '+size+'px Arial';ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(v||''),x,y,850);};
 draw('KINETIC CREW  /  OFFICIAL PASS',500,112,25,'#e1c56c','700','center');draw('MY TICKET',500,205,34,'#c5b98f','600','center');draw(document.querySelector('#kcTicketTitle')?.textContent||event.title||'Kinetic Crew Event',500,270,46,'#fff8e9','800','center');
 ctx.strokeStyle='#b89a4e';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(120,340,760,700,34);ctx.stroke();draw('PASS ID  '+String(event.id||eventId||'KC-PASS').replace(/-/g,'').slice(-8).toUpperCase(),500,410,25,'#e8dcbf','700','center');
 ctx.setLineDash([16,15]);ctx.beginPath();ctx.moveTo(150,465);ctx.lineTo(850,465);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#f3ecd9';ctx.fillRect(285,500,430,430);ctx.drawImage(qr,300,515,400,400);
 const info=[['NAME',S.user?.name||S.user?.email||'Crew member'],['DATE',event.starts_at?new Date(event.starts_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'To be announced'],['VENUE',event.location||'To be announced'],['TIME',event.starts_at?new Date(event.starts_at).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):'To be announced']];
 info.forEach((item,i)=>{const x=i%2?550:130,y=1115+Math.floor(i/2)*115;draw(item[0],x,y,18,'#aaa99c','600');draw(item[1],x,y+45,25,'#fff8e9','700');});
 ctx.strokeStyle='#777b6d';ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(120,1360);ctx.lineTo(880,1360);ctx.stroke();ctx.setLineDash([]);draw('KINETIC CREW  ·  BUILT TO MOVE TOGETHER',500,1420,19,'#d6b65f','700','center');
 canvas.toBlob(blob=>{if(!blob){notice('Could not create ticket image.');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='kinetic-crew-ticket-'+String(eventId||'pass').slice(0,8)+'.png';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);notice('Ticket saved with Kinetic Crew watermark.');},'image/png');
}
function celebrateSave(){if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const canvas=document.createElement('canvas');canvas.className='kc-save-confetti';canvas.setAttribute('aria-hidden','true');Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',pointerEvents:'none',zIndex:'25000'});document.body.appendChild(canvas);const ctx=canvas.getContext('2d');const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*ratio);canvas.height=Math.floor(innerHeight*ratio);ctx.scale(ratio,ratio);const palette=['#f08cac','#ffd166','#7bdcb5','#86b7ff','#c7a5ff','#ffffff'];const particles=Array.from({length:96},()=>({x:innerWidth/2+(Math.random()-.5)*120,y:Math.max(80,innerHeight*.27)+(Math.random()-.5)*80,vx:(Math.random()-.5)*9,vy:-Math.random()*10-3,g:.22+Math.random()*.12,rot:Math.random()*6.28,vr:(Math.random()-.5)*.24,size:4+Math.random()*6,color:palette[Math.floor(Math.random()*palette.length)],life:85+Math.random()*30}));let frame=0;function draw(){ctx.clearRect(0,0,innerWidth,innerHeight);for(const p of particles){if(p.life<=0)continue;p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.vx*=.992;p.rot+=p.vr;p.life--;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=Math.min(1,p.life/24);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.62);ctx.restore();}frame++;if(frame<125)requestAnimationFrame(draw);else canvas.remove();}requestAnimationFrame(draw);setTimeout(()=>canvas.remove(),2600);}
window.kcCelebrateSave=celebrateSave;
async function action(fn){try{S.error='';await fn();}catch(e){S.error=e.message||'Something went wrong.';}paint();}
function showEventQr(eventId,title){
 const event=S.events.find(x=>String(x.id)===String(eventId))||{},ticketTitle=String(event.title||title||'Kinetic Crew Event').trim(),payload='KC_EVENT_ATTENDANCE:'+eventId+':'+S.user.email;
 const startDate=event.starts_at?new Date(event.starts_at):null;
 const dateLabel=startDate&&!Number.isNaN(startDate.getTime())?startDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'To be announced';
 const timeLabel=startDate&&!Number.isNaN(startDate.getTime())?startDate.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):'To be announced';
 const passId=String(event.id||eventId).replace(/[^a-z0-9]/gi,'').slice(-8).toUpperCase()||'KC-PASS';
 const close=()=>{$('#modalRoot').innerHTML='';document.body.classList.remove('kc-ticket-open');document.removeEventListener('keydown',ticketEscape);};
 const ticketEscape=event=>{if(event.key==='Escape')close();};
 document.body.classList.add('kc-ticket-open');document.addEventListener('keydown',ticketEscape);
 $('#modalRoot').innerHTML='<div class="modalback kce-ticket-backdrop" id="eventQrBackdrop"><section class="modal kce-ticket-modal kce-ticket-stub" role="dialog" aria-modal="true" aria-labelledby="kcTicketTitle" tabindex="-1">'+
 '<button type="button" class="iconbutton modalclose" id="closeEventQr" aria-label="Close ticket">×</button>'+
 '<header class="kce-stub-heading"><span>MY TICKET</span><h2 id="kcTicketTitle">'+esc(ticketTitle)+'</h2></header>'+
 '<div class="kce-stub-qr-panel"><div class="kce-stub-passid">PASS ID <b>'+esc(passId)+'</b></div><div class="kce-stub-perforation"><i></i><span></span><i></i></div><div id="eventQrImage" class="kce-ticket-qr member-qr"></div><small>SCAN AT THE EVENT ENTRANCE</small></div>'+
 '<div class="kce-stub-details"><div><b>'+esc(S.user?.name||S.user?.email||'Crew member')+'</b><small>NAME</small></div><div><b>'+esc(dateLabel)+'</b><small>DATE</small></div><div><b>'+esc(event.location||'Venue to be announced')+'</b><small>VENUE</small></div><div><b>'+esc(timeLabel)+'</b><small>TIME</small></div></div>'+
 '<div class="kce-stub-status"><span>'+(event.attended?'ATTENDANCE CONFIRMED':'REGISTRATION CONFIRMED')+'</span><b>'+(event.attended?'● CHECKED IN':'● VALID PASS')+'</b></div><div class="kce-stub-actions"><button type="button" class="kce-stub-download" id="downloadEventPass" aria-label="Download ticket to phone"><svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></svg><span>Save ticket</span></button><button type="button" class="primary full kce-stub-done" id="doneEventQr">Done</button></div></section></div>';
 ensureKcQrLibrary().then(QR=>{const target=$('#eventQrImage');if(target&&target.isConnected){target.innerHTML='';new QR(target,{text:payload,width:220,height:220,colorDark:'#f1ead8',colorLight:'#17201d',correctLevel:QR.CorrectLevel.M});}}).catch(error=>{const target=$('#eventQrImage');if(target)target.textContent='QR temporarily unavailable. Reload and try again.';console.error('Event QR generation failed:',error);});
 $('#closeEventQr').onclick=$('#doneEventQr').onclick=close;
 $('#eventQrBackdrop').onclick=e=>{if(e.target.id==='eventQrBackdrop')close();};
}
function showAttendanceSuccess(memberName,eventTitle,eventDate,message){
 const dateLabel=eventDate?new Date(eventDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'Event date';
 const root=$('#modalRoot');if(!root)return;
 root.innerHTML='<div class="modalback kc-attendance-success-backdrop" id="attendanceSuccessBackdrop"><section class="modal kc-attendance-success-modal" role="dialog" aria-modal="true" aria-labelledby="attendanceSuccessTitle"><div class="kc-attendance-success-tick" aria-hidden="true">✓</div><span class="kc-attendance-kicker">KINETIC CREW / CHECK-IN</span><h2 id="attendanceSuccessTitle">Attendance marked!</h2><p class="kc-attendance-success-member">'+esc(memberName)+'</p><div class="kc-attendance-success-event"><b>'+esc(eventTitle)+'</b><small>'+esc(dateLabel)+'</small></div><p class="kc-attendance-note">'+esc(message||'Member successfully checked in for this event.')+'</p><button type="button" class="primary full" id="closeAttendanceSuccess">Done ✓</button></section></div>';
 const close=()=>{root.innerHTML='';};$('#closeAttendanceSuccess').onclick=close;$('#attendanceSuccessBackdrop').onclick=e=>{if(e.target.id==='attendanceSuccessBackdrop')close();};
}
function showOtp(code,expires,title){$('#modalRoot').innerHTML='<div class="modalback" id="otpBackdrop"><div class="modal" role="dialog" aria-modal="true"><button class="iconbutton modalclose" id="closeOtp">×</button><div class="modalemblem">◎</div><div class="eyebrow" style="justify-content:center">ATTENDANCE PASS / '+esc(title)+'</div><h2>Your code is ready.</h2><p>Show this six-digit code to an authorized crew admin.</p><div class="code">'+code.split('').map(d=>'<span>'+d+'</span>').join('')+'</div><div class="modalhint">◷ Expires '+esc(new Date(expires).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</div><p>✦ Single-use · Keep your code private</p><button class="primary full" id="doneOtp">Got it ✓</button></div></div>';$('#closeOtp').onclick=()=>$('#modalRoot').innerHTML='';$('#doneOtp').onclick=()=>$('#modalRoot').innerHTML='';$('#otpBackdrop').onclick=e=>{if(e.target.id==='otpBackdrop')$('#modalRoot').innerHTML='';};}

function kcMarkProfileFlipHintSeen(card){
 const hint=card?.parentElement?.querySelector('[data-profile-flip-hint]');
 if(hint){hint.classList.add('is-dismissed');setTimeout(()=>hint.remove(),260);}
 try{localStorage.setItem('kc_profile_flip_hint_seen_v1','1');localStorage.setItem('kc_profile_flip_intro_v1','1');}catch{}
 card?.classList.remove('kc-flip-intro');
}
function kcFlipProfileCard(card){
 if(!card)return;
 card.classList.toggle('is-flipped');
 card.setAttribute('aria-pressed',card.classList.contains('is-flipped')?'true':'false');
 kcMarkProfileFlipHintSeen(card);
}
/* Require two deliberate taps on the card. A WeakMap avoids global state and
   interactive links/buttons (including Instagram) never trigger a face change. */
const kcProfileTapState=new WeakMap();
document.addEventListener('pointerup',event=>{
 const card=event.target.closest('[data-profile-flip]');
 if(!card||event.target.closest('button,a,input,textarea,summary,[contenteditable="true"],select,label'))return;
 if(event.pointerType==='mouse'&&event.button!==0)return;
 const now=Date.now(),previous=kcProfileTapState.get(card)||0;
 if(now-previous<=750){
  kcProfileTapState.set(card,0);
  kcFlipProfileCard(card);
 }else{
  kcProfileTapState.set(card,now);
 }
},{passive:true});
document.addEventListener('keydown',event=>{
 if(event.key!=='Enter'&&event.key!==' ')return;
 const card=event.target.closest?.('[data-profile-flip]');
 if(!card||event.target.closest('button,a,input,textarea,summary,[contenteditable="true"]'))return;
 event.preventDefault();kcFlipProfileCard(card);
});
document.addEventListener('animationend',event=>{
 const card=event.target.closest?.('[data-profile-flip].kc-flip-intro');
 if(!card||event.animationName!=='kc-profile-flip-intro')return;
 card.classList.remove('kc-flip-intro');
 try{localStorage.setItem('kc_profile_flip_intro_v1','1');}catch{}
});
document.addEventListener('click',event=>{const edit=event.target.closest('[data-edit-event]');if(!edit)return;event.preventDefault();if(!admin()){notice('Admin access required to edit '+(S.eventMode==='rehearsals'?'rehearsals':'events')+'.');return;}S.editingEventId=edit.dataset.editEvent;go(S.eventMode==='rehearsals'?'rehearsal-edit':'event-edit');});

document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&S.view==='crew-management'&&S.profileHistoryInCrew){
  S.profileHistoryUnlocked=false;S.profileHistoryData=null;
 }else if(!document.hidden&&S.view==='crew-management'&&S.profileHistoryInCrew){
  paint();
 }
});
function closeMemberActionRings(except){
 document.querySelectorAll('.kc-member-action-open').forEach(card=>{if(card!==except){card.classList.remove('kc-member-action-open');card.querySelector('.kc-member-action-ring')?.remove();}});
}
function openMemberActionRing(card){
 if(!card)return;
 const id=String(card.dataset.memberActionCard||'');
 if(!id||id===String(S.user?.auth_id||''))return;
 const alreadyOpen=card.classList.contains('kc-member-action-open');
 closeMemberActionRings();
 if(alreadyOpen)return;
 card.classList.add('kc-member-action-open');
 card.querySelector('.kc-member-action-ring')?.remove();
 card.insertAdjacentHTML('beforeend',memberActionRingMarkup(id,card.dataset.memberRole,card.dataset.memberName));
}
document.addEventListener('click',event=>{
 const toggle=event.target.closest('[data-member-actions-toggle]');
 if(toggle){event.preventDefault();event.stopImmediatePropagation();openMemberActionRing(toggle.closest('[data-member-action-card]'));return;}
 if(!event.target.closest('[data-member-action-card]'))closeMemberActionRings();
});
document.addEventListener('contextmenu',event=>{if(event.target.closest('[data-member-action-card]'))event.preventDefault();});
document.addEventListener('click',e=>{const feature=e.target.closest('[data-kc-feature-open]');if(feature){kcOpenFeaturePage(feature.dataset.kcFeatureOpen);return;}if(e.target.closest('[data-kc-feature-back]')){kcBackToFeatureMenu();return;}});
document.addEventListener('click',event=>{
 const audition=event.target.closest('[data-audition-admin]');if(audition){location.href=window.kcPath('audition-admin.html')+'?v=20261123-complete-delete-cleanup2';return;}
 const password=event.target.closest('[data-open-change-password]');if(password){location.href=window.kcPath('change-password.html');return;}
});
document.addEventListener('click',async e=>{
 const gramTab=e.target.closest('[data-gram-tab]');if(gramTab){S.gramTab=gramTab.dataset.gramTab;paint();return;}
 const gramCreate=e.target.closest('[data-gram-create]');if(gramCreate){openGramCreate();return;}
 const gramClose=e.target.closest('[data-gram-create-close]');if(gramClose){$('#modalRoot').innerHTML='';return;}
 const gramMessage=e.target.closest('[data-gram-message]');if(gramMessage){try{await openDirectMessage(gramMessage.dataset.gramMessage);}catch(error){notice(error.message||'Could not open this conversation.');}return;}
 const gramStory=e.target.closest('[data-gram-story-open]');if(gramStory){const story=(S.socialStories||[]).find(x=>String(x.id)===String(gramStory.dataset.gramStoryOpen));if(story){if(String(story.author_id)!==String(S.user.auth_id))await client.from('crew_social_story_views').upsert({story_id:story.id,viewer_id:S.user.auth_id},{onConflict:'story_id,viewer_id',ignoreDuplicates:true});$('#modalRoot').innerHTML='<div class="modalback" id="kgStoryBackdrop"><section class="modal kg-story-viewer"><button type="button" class="iconbutton modalclose" data-gram-create-close>×</button>'+(String(story.media_mime_type||'').startsWith('video/')?'<video src="'+esc(story.signed_media_url)+'" controls autoplay playsinline></video>':'<img src="'+esc(story.signed_media_url)+'" alt="Crew story">')+'<p>'+esc(story.caption||'')+'</p></section></div>';}return;}

 const review=e.target.closest('[data-review-member]');if(review){const action=review.dataset.reviewMember,id=review.dataset.memberId;if(!admin()||!id)return;review.disabled=true;try{if(action==='reject'){if(!await kcConfirmDialog({title:'Permanently reject this membership request?',message:'The Auth account, profile, personal uploads and associated personal records will be deleted. Only a one-way email/username hash and rejection time will remain so the person can be shown the application link if they try to sign in again.',confirmText:'Reject & delete data',danger:true})){review.disabled=false;return;}const {data,error}=await client.functions.invoke('reject-crew-member',{body:{authId:id}});if(error){let detail=error.message||'Could not permanently reject this request.';try{if(error.context?.json){const payload=await error.context.json();detail=payload.error||payload.message||detail;}}catch{}throw Error(data?.error||detail);}if(data?.error)throw Error(data.error);notice(data?.message||'Membership rejected and personal data deleted.');}else{const {data,error}=await rpc('crew_review_member',{p_auth_id:id,p_decision:'approve',p_reason:null});if(error)throw error;const {data:mail,error:mailError}=await client.functions.invoke('send-member-welcome',{body:{authId:id}});if(mailError||mail?.error)throw Error(mail?.error||mailError?.message||'Member approved, but welcome email failed.');notice(mail?.message||'Member approved and welcome email sent.');}await go(S.view==='crew-management'?'crew-management':'member-requests');}catch(error){notice(error.message||'Could not review this request.');review.disabled=false;}return;}
 const memberAction=e.target.closest('[data-member-action]');
 if(memberAction){
  const action=memberAction.dataset.memberAction,id=memberAction.dataset.memberId,name=memberAction.dataset.memberName||'Crew member';
  memberAction.disabled=true;
  try{
   if(action==='favorite'){await toggleMemberFavorite(id);}
   else if(action==='message'){closeMemberActionRings();await openDirectMessage(id);}
   else if(action==='block'||action==='unblock'){
    const target=(S.members||[]).concat(S.publicMembers||[]).find(m=>String(m.auth_id)===String(id));
    if(!admin()||!target||target.role==='super_admin'||(!superadmin()&&target.role!=='member'))throw Error('Your role cannot manage this account.');
    const blocking=action==='block';
    if(!await kcConfirmDialog({title:blocking?'Block crew member?':'Unblock crew member?',message:(blocking?'Block ':'Unblock ')+name+'? '+(blocking?'They will be unable to sign in on any device until an admin restores access.':'They will be able to sign in again.'),confirmText:blocking?'Block member':'Unblock member',danger:blocking}))return;
    const {data,error}=await client.functions.invoke('member-actions',{body:{action:action,authId:id}});
    if(error){let message=error.message||'Member action failed.';try{const payload=await error.context?.json?.();message=payload?.error||message;}catch{}throw Error(message);}
    if(data?.error)throw Error(data.error);
    S.blockedMemberIds=blocking?[...(S.blockedMemberIds||[]),String(id)]:(S.blockedMemberIds||[]).filter(x=>x!==String(id));
    notice(data?.message||name+(blocking?' blocked.':' unblocked.'));
    closeMemberActionRings();paint();
   }
  }catch(error){notice(error.message||'Could not complete this action.');}
  finally{if(memberAction.isConnected)memberAction.disabled=false;}
  return;
 }
 if(e.target.closest('#downloadEventPass')){await downloadEventPass();return;}const flipBack=e.target.closest('[data-profile-flip-back]');if(flipBack){flipBack.closest('[data-profile-flip]')?.classList.remove('is-flipped');return;}const shareProfile=e.target.closest('[data-share-profile]');if(shareProfile){const data={title:(S.user?.name||'Kinetic Crew')+' · Kinetic Crew',text:'Connect with '+(S.user?.name||'me')+' on Kinetic Crew · @'+(S.user?.username||'crew-member')};if(navigator.share){try{await navigator.share(data);}catch(err){if(err.name!=='AbortError')notice('Could not share profile.');}}else{try{await navigator.clipboard.writeText(data.text);notice('Profile details copied.');}catch{notice('Sharing is unavailable in this browser.');}}return;}const removeMember=e.target.closest('[data-member-remove]');if(removeMember){if(removeMember.disabled)return;const targetId=removeMember.dataset.memberRemove,name=removeMember.dataset.memberName||'this member';const target=(S.members||[]).concat(S.publicMembers||[]).find(m=>String(m.auth_id)===String(targetId));if(!target){notice('Member list is out of date. Refresh and try again.');return;}const permitted=target.auth_id!==S.user?.auth_id&&target.role!=='super_admin'&&(superadmin()||target.role==='member');if(!permitted){notice('Your role cannot remove this account.');return;}const confirmed=await kcTypeToConfirmDialog({title:'Permanently remove member?',message:'This permanently deletes the member’s sign-in account, profile, uploads, follows, login streak, event registrations, attendance records and personal app data. Shared events and crew-wide records are kept where possible. This cannot be undone.',entityName:name,requiredText:'DELETE',confirmText:'Delete permanently'});if(!confirmed){notice('Removal cancelled. Nothing was deleted.');return;}removeMember.disabled=true;removeMember.textContent='Removing…';try{const {data,error}=await client.functions.invoke('delete-crew-member',{body:{authId:targetId}});if(error){let message=error.message||'Member removal failed.';try{const payload=await error.context?.json?.();message=payload?.error||message;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);S.members=(S.members||[]).filter(m=>String(m.auth_id)!==String(targetId));S.publicMembers=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(targetId));notice(data?.message||name+' was permanently removed.');paint();}catch(error){removeMember.disabled=false;removeMember.textContent='Remove member';notice(error.message||'Could not remove this member.');}return;}const connectionClose=e.target.closest('[data-connections-close]');if(connectionClose){document.getElementById('kcConnectionsModal')?.remove();return;}if(e.target.id==='kcConnectionsModal'){e.target.remove();return;}const connectionOpen=e.target.closest('[data-open-connection]');if(connectionOpen){const id=connectionOpen.dataset.openConnection;document.getElementById('kcConnectionsModal')?.remove();if(String(id)===String(S.user?.auth_id))go('profile');else{S.selectedProfileId=id;go('public-profile');}return;}const connectionButton=e.target.closest('[data-profile-connections]');if(connectionButton){await openProfileConnections(connectionButton.dataset.profileConnections,connectionButton.dataset.profileOwner);return;}const profileScan=e.target.closest('[data-profile-scan]');if(profileScan){window.KC_QR_SCANNER?.open?.();return;}const profileTab=e.target.closest('[data-profile-tab]');if(profileTab){const activityRoot=profileTab.closest('.kc-profile-activity');if(activityRoot){S.profileTab=profileTab.dataset.profileTab;activityRoot.querySelectorAll('[data-profile-tab]').forEach(b=>b.classList.toggle('active',b===profileTab));activityRoot.querySelectorAll('[data-profile-panel]').forEach(panel=>panel.hidden=panel.dataset.profilePanel!==S.profileTab);}return;}const funCreate=e.target.closest('[data-fun-create]');if(funCreate){await go('feed');requestAnimationFrame(()=>document.querySelector('#socialPostForm textarea')?.focus());return;}const shareEvent=e.target.closest('[data-share-event]');if(shareEvent){const item=S.events.find(x=>String(x.id)===String(shareEvent.dataset.shareEvent));if(!item)return;S.eventMode=shareEvent.dataset.mode==='rehearsals'?'rehearsals':'events';await kcShareEventCard(item);return;}const nestButton=e.target.closest('[data-nest-toggle]');if(nestButton){const panel=nestButton.closest('[data-nav-nest]'),items=panel.querySelector('.nav-nest-items'),open=nestButton.getAttribute('aria-expanded')==='true';document.querySelectorAll('[data-nav-nest]').forEach(p=>{p.classList.remove('expanded');p.querySelector('[data-nest-toggle]')?.setAttribute('aria-expanded','false');p.querySelector('.nav-nest-items')?.setAttribute('hidden','');});if(!open){panel.classList.add('expanded');nestButton.setAttribute('aria-expanded','true');items?.removeAttribute('hidden');}return;}const themeChoice=e.target.closest('[data-set-theme]');if(themeChoice){const toggle=document.querySelector('[data-theme-toggle]');if(toggle&&document.documentElement.dataset.theme!==themeChoice.dataset.setTheme)toggle.click();notice('Appearance updated.');return;}const groupButton=e.target.closest('[data-nav-group]');if(groupButton){const key=groupButton.dataset.navGroup;S.navOpen=S.navOpen===key?'':key;paint();return;}const funStart=e.target.closest('[data-fun-start]');if(funStart){S.funRound={state:'waiting',best:S.funRound?.best??null,last:null};paint();const delay=1200+Math.random()*2600;clearTimeout(S.funTimer);S.funTimer=setTimeout(()=>{if((S.view==='fun-zone-games'||S.view==='fun-zone')&&S.funRound?.state==='waiting'){S.funRound={...S.funRound,state:'go',startedAt:Date.now()};paint();}},delay);return;}const funHit=e.target.closest('[data-fun-hit]');if(funHit){if(S.funRound?.state==='waiting'){clearTimeout(S.funTimer);S.funRound={...S.funRound,state:'early'};paint();return;}if(S.funRound?.state==='go'){const ms=Date.now()-S.funRound.startedAt;S.funRound={state:'done',last:ms,best:S.funRound.best==null?ms:Math.min(S.funRound.best,ms)};paint();return;}return;}if(e.target.closest('[data-fun-reset]')){clearTimeout(S.funTimer);S.funRound={state:'ready',best:null,last:null};paint();return;}if(e.target.closest('[data-dance-prompt]')){const prompts=['Freestyle for 30 seconds without stopping.','Create a 4-count move and teach it to someone.','Dance to the next song you hear.','Try a move using only footwork.','Recreate a signature move from your last performance.','Make a 2-person mirror routine.','Do a clean 8-count in slow motion.'];const p=prompts[Math.floor(Math.random()*prompts.length)];const el=$('#dancePrompt');if(el)el.textContent=p;return;}const like=e.target.closest('[data-social-like]');if(like){await action(async()=>{const postId=like.dataset.socialLike;if(like.dataset.liked==='true'){const {error}=await client.from('crew_social_likes').delete().eq('post_id',postId).eq('user_id',S.user.auth_id);if(error)throw error;}else{const {error}=await client.from('crew_social_likes').upsert({post_id:postId,user_id:S.user.auth_id},{onConflict:'post_id,user_id',ignoreDuplicates:true});if(error)throw error;}await loadSocialFeed();});return;}const commentToggle=e.target.closest('[data-social-comments-toggle]');if(commentToggle){const panel=document.querySelector('[data-social-comments="'+commentToggle.dataset.socialCommentsToggle+'"]');if(panel)panel.hidden=!panel.hidden;return;}const share=e.target.closest('[data-social-share]');if(share){const post=S.socialPosts.find(p=>String(p.id)===String(share.dataset.socialShare));if(post){try{if(navigator.share)await navigator.share({title:'Kinetic Crew',text:'Shared by the crew',url:post.link_url});else{await navigator.clipboard.writeText(post.link_url);notice('Link copied.');}}catch(err){if(err?.name!=='AbortError')notice('Could not share this link from the browser.');}}return;}const socialDelete=e.target.closest('[data-social-delete]');if(socialDelete){if(!await kcConfirmDialog({title:'Delete crew post?',message:'This post will be permanently removed from the crew feed.',confirmText:'Delete post',danger:true}))return;await action(async()=>{const {error}=await client.from('crew_social_posts').delete().eq('id',socialDelete.dataset.socialDelete);if(error)throw error;await loadSocialFeed();notice('Post deleted.');});return;}const pollAdd=e.target.closest('[data-poll-add-option]');if(pollAdd){const list=pollAdd.closest('.kc-poll-options-editor')?.querySelector('.kc-poll-option-inputs');if(!list)return;const count=list.querySelectorAll('input[name="poll_option"]').length;if(count>=10){notice('A poll can have up to 10 options.');return;}const row=document.createElement('label');row.className='kc-poll-option-input';row.innerHTML='<span>'+String(count+1)+'</span><input name="poll_option" maxlength="120" required placeholder="Option '+String(count+1)+'"><button type="button" class="kc-poll-remove-option" aria-label="Remove option">×</button>';list.append(row);row.querySelector('input')?.focus();return;}const pollRemove=e.target.closest('.kc-poll-remove-option');if(pollRemove){const list=pollRemove.closest('.kc-poll-option-inputs');if(list?.querySelectorAll('input[name="poll_option"]').length>2){pollRemove.closest('.kc-poll-option-input')?.remove();list.querySelectorAll('.kc-poll-option-input').forEach((row,index)=>{row.querySelector('span').textContent=String(index+1);row.querySelector('input').placeholder='Option '+String(index+1);});}else notice('A poll needs at least two options.');return;}const vote=e.target.closest('[data-vote-id]');if(vote){const list=vote.closest('[data-poll-choice-list]');if(list?.dataset.multiple==='true'){if(vote.disabled)return;vote.classList.toggle('is-selected');vote.setAttribute('aria-pressed',vote.classList.contains('is-selected')?'true':'false');return;}await action(async()=>{vote.disabled=true;const res=await featureApi('vote','polls',{id:vote.dataset.voteId,choice:vote.dataset.choice});notice(res.message);S.featureItems.polls=await featureApi('list','polls',{});if(S.view==='overview')paint();});return;}const pollSubmit=e.target.closest('[data-poll-submit]');if(pollSubmit){const list=pollSubmit.closest('.kc-exact-poll-update,.feature-card')?.querySelector('[data-poll-choice-list]')||document.querySelector('[data-poll-choice-list="'+CSS.escape(pollSubmit.dataset.pollSubmit)+'"]');const choices=[...(list?.querySelectorAll('.kc-poll-choice.is-selected')||[])].map(b=>b.dataset.choice);if(!choices.length){notice('Select at least one option.');return;}pollSubmit.disabled=true;await action(async()=>{const res=await featureApi('vote','polls',{id:pollSubmit.dataset.pollSubmit,choices});notice(res.message);S.featureItems.polls=await featureApi('list','polls',{});if(S.view==='overview')paint();else paint();});return;}const pollResults=e.target.closest('[data-poll-results]');if(pollResults){await action(async()=>{S.selectedPoll=pollResults.dataset.pollResults;S.pollSummary=await featureApi('vote-results','polls',{id:S.selectedPoll});S.pollScreen='summary';go('polls');});return;}const pollScreen=e.target.closest('[data-poll-screen]');if(pollScreen){S.pollScreen=pollScreen.dataset.pollScreen;S.pollRespondents=[];paint();return;}const pollOpen=e.target.closest('[data-poll-open]');if(pollOpen){await action(async()=>{S.selectedPoll=pollOpen.dataset.pollOpen;S.pollSummary=await featureApi('vote-results','polls',{id:S.selectedPoll});S.pollScreen='summary';paint();});return;}const pollDetails=e.target.closest('[data-poll-details]');if(pollDetails){await action(async()=>{const {data,error}=await rpc('crew_poll_respondents',{p_poll_id:pollDetails.dataset.pollDetails});if(error)throw error;S.pollRespondents=Array.isArray(data)?data:[];S.pollScreen='details';paint();});return;}const rehearsalRegister=e.target.closest('[data-rehearsal-register]');if(rehearsalRegister){if(rehearsalRegister.disabled)return;rehearsalRegister.disabled=true;await action(async()=>{const registered=rehearsalRegister.dataset.registered==='true';const {data,error}=await rpc(registered?'crew_rehearsal_unregister':'crew_rehearsal_register',{p_rehearsal_id:rehearsalRegister.dataset.rehearsalRegister});if(error)throw error;S.featureItems.rehearsals=await loadRehearsalItems();paint();notice(data?.message||(registered?'Rehearsal registration cancelled.':'Rehearsal registration confirmed.'));});return;}const rehearsalStatus=e.target.closest('[data-rehearsal-status]');if(rehearsalStatus){await action(async()=>{const {data,error}=await rpc('crew_rehearsal_set_status',{p_item_id:rehearsalStatus.dataset.rehearsalStatus,p_status:rehearsalStatus.dataset.status});if(error)throw error;notice(data?.message||'Rehearsal status updated.');S.featureItems.rehearsals=await loadRehearsalItems();paint();});return;}const mod=e.target.closest('[data-moderate]');if(mod){await action(async()=>{const res=await featureApi('moderate',mod.dataset.feature,{id:mod.dataset.moderate,status:mod.dataset.status});notice(res.message);S.featureItems[mod.dataset.feature]=await featureApi('list',mod.dataset.feature,{});paint();});return;}const memoryLike=e.target.closest('[data-memory-like]');if(memoryLike){memoryLike.disabled=true;await action(async()=>{const {data,error}=await rpc('crew_memory_social',{p_action:'toggle-like',p_memory_id:memoryLike.dataset.memoryLike,p_body:null});if(error)throw error;const item=(S.featureItems.memories||[]).find(x=>String(x.id)===String(memoryLike.dataset.memoryLike));if(item)item.social={...(item.social||{}),...(data||{})};paint();});return;}const memoryZoom=e.target.closest('[data-memory-zoom]');if(memoryZoom){openKcMemoryViewer(memoryZoom.dataset.memoryZoom);return;}const delFeature=e.target.closest('[data-feature-delete]');if(delFeature){if(!await kcConfirmDialog({title:'Delete this item?',message:'This item will be permanently removed.',confirmText:'Delete item',danger:true}))return;await action(async()=>{const res=await featureApi('delete',delFeature.dataset.feature,{id:delFeature.dataset.featureDelete});notice(res.message);S.featureItems[delFeature.dataset.feature]=await featureApi('list',delFeature.dataset.feature,{});});return;}const follow=e.target.closest('[data-follow]');if(follow){const targetId=follow.dataset.follow,wasFollowing=follow.dataset.following==='true';follow.disabled=true;await action(async()=>{const {error}=await rpc('crew_follow_profile',{p_target_auth_id:targetId,p_follow:!wasFollowing});if(error)throw Error(error.message||'Could not update follow.');const [profileResult,directoryResult]=await Promise.all([rpc('crew_profile_social',{p_auth_id:targetId}),rpc('crew_profile_directory',{})]);if(profileResult.error)throw profileResult.error;S.profileSocial=profileResult.data||null;if(!directoryResult.error)S.publicMembers=Array.isArray(directoryResult.data)?directoryResult.data:[];notice(wasFollowing?'Unfollowed member.':'You are now following this member.');paint();});return;}const profileEdit=e.target.closest('[data-profile-edit]');if(profileEdit){const editor=$('#profileEditor');if(editor){editor.hidden=false;editor.scrollIntoView({behavior:'smooth',block:'start'});editor.querySelector('input[name="name"]')?.focus({preventScroll:true});}return;}const profileEditorClose=e.target.closest('[data-profile-editor-close]');if(profileEditorClose){const editor=$('#profileEditor');if(editor)editor.hidden=true;return;}const profileOpen=e.target.closest('[data-open-profile]');if(profileOpen){S.selectedProfileId=profileOpen.dataset.openProfile;go('public-profile');return;}const eventFilter=e.target.closest('[data-event-filter]');if(eventFilter){if(eventFilter.dataset.mode==='rehearsals'||S.view==='rehearsals')S.rehearsalFilter=eventFilter.dataset.eventFilter||'all';else S.eventsFilter=eventFilter.dataset.eventFilter||'all';paint();return;}const openEvent=e.target.closest('[data-open-event]');if(openEvent){S.selectedEvent=openEvent.dataset.openEvent;const item=(S.events||[]).find(event=>String(event.id)===String(S.selectedEvent));S.eventMode=openEvent.dataset.mode==='rehearsals'||isRehearsalEvent(item)?'rehearsals':'events';go('event-detail');return;}const v=e.target.closest('[data-view]');if(v){const target=v.dataset.view;const route=target==='new-update'?'updates':target==='achievement-form'?'achievements':target;go(route).then(()=>{const anchor=target==='new-update'?'#updateForm':target==='achievement-form'?'#achievementFormHost':null;if(anchor)$(anchor)?.scrollIntoView({behavior:'smooth',block:'center'});});return;}const r=e.target.closest('[data-register]');if(r){if(r.disabled||r.dataset.submitting==='true')return;r.disabled=true;r.dataset.submitting='true';r.setAttribute('aria-busy','true');r.textContent='Registering…';try{await action(async()=>{const eventId=r.dataset.register,eventBefore=S.events.find(item=>String(item.id)===String(eventId));
 const d=await api('register','POST',{eventId});
 if(eventBefore?.ticket_email_enabled){
  try{
   const {data:ticketData,error:ticketError}=await client.functions.invoke('send-event-ticket',{body:{eventId,recipientMode:'single',autoRegistration:true}});
   if(ticketError){let detail=ticketError.message||'Ticket email could not be sent.';try{const payload=await ticketError.context?.json?.();detail=payload?.error||payload?.message||detail;}catch{}throw Error(detail);}
   if(ticketData?.error)throw Error(ticketData.error);
   if(Number(ticketData?.failed||0)>0)throw Error(ticketData.results?.find(item=>!item.ok)?.error||'The mail service rejected the ticket.');
   notice(Number(ticketData?.alreadySent||0)>0?'You are already registered. Your ticket email was sent earlier.':'Registration confirmed. Your personal ticket has been emailed to '+(S.user?.email||'your registered email')+'.');
  }catch(ticketError){console.warn('Registration confirmed but ticket email failed:',ticketError);notice('Registration confirmed, but the ticket email failed: '+(ticketError.message||'Please contact an admin for your ticket.'));}
 }else notice(d.message||'Registration successful.');
 await refresh();});}finally{if(r.isConnected){r.disabled=false;r.dataset.submitting='false';r.removeAttribute('aria-busy');r.textContent='Register for this event →';}}return;}const eq=e.target.closest('[data-event-qr]');if(eq){const event=S.events.find(x=>String(x.id)===String(eq.dataset.eventQr));if(event)showEventQr(event.id,event.title);return;}const o=e.target.closest('[data-otp]');if(o){await action(async()=>{let e0=S.events.find(x=>String(x.id)===String(o.dataset.otp));let d=await api('otp','POST',{eventId:o.dataset.otp});showOtp(d.code,d.expiresAt,e0?.title||'Crew event');notice(d.message);});return;}const profileReminderButton=e.target.closest('[data-send-profile-reminder]');if(profileReminderButton){if(profileReminderButton.disabled)return;const targetAuthId=profileReminderButton.dataset.sendProfileReminder;profileReminderButton.disabled=true;profileReminderButton.textContent='Sending reminder…';try{const {data,error}=await client.functions.invoke('send-profile-completion-reminder',{body:{targetAuthId}});if(error){let message=error.message||'Could not send profile reminder.';try{const payload=await error.context?.json?.();message=payload?.error||message;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);const channels=[data?.pushSent?'push sent':'push unavailable (no registered device)',data?.emailSent?'email sent':'email failed'];notice('Profile reminder recorded · '+channels.join(' · '));}catch(error){notice(error.message||'Could not send profile reminder.');}finally{if(profileReminderButton.isConnected){profileReminderButton.disabled=false;profileReminderButton.textContent='Send profile completion reminder ↗';}}return;}const profileHistoryOpen=e.target.closest('[data-profile-history-open]');if(profileHistoryOpen){if(!admin()){notice('Profile History is available only to Admins and Super Admins.');return;}S.profileHistoryInCrew=true;S.profileHistoryData=null;S.profileHistoryUnlocked=false;paint();loadProfileHistoryStatus().then(()=>{if(S.view==='crew-management'&&S.profileHistoryInCrew)paint();}).catch(error=>{S.error=error.message||'Could not load Profile History security settings.';paint();});return;}const attendanceFeature=e.target.closest('[data-attendance-section]');if(attendanceFeature){const section=attendanceFeature.dataset.attendanceSection;S.attendanceSection=section;S.profileHistoryData=null;S.profileHistoryUnlocked=false;paint();if(section==='history'){loadProfileHistoryStatus().then(()=>{if(S.view==='crew-management'&&S.profileHistoryInCrew)paint();}).catch(error=>{S.error=error.message||'Could not load Profile History security settings.';paint();});}if(section==='scan'){requestAnimationFrame(()=>{if(S.view==='attendance'&&S.attendanceSection==='scan')startQr();});}return;}if(e.target.closest('[data-history-biometric-setup]')){const button=e.target.closest('[data-history-biometric-setup]');button.disabled=true;try{if(!S.profileHistoryPinSession)throw Error('Unlock Profile History with your mPIN first.');const biometric=await import('./kc-biometric.js');if(S.historyBiometricRegistered){await biometric.removeKCBiometric();S.historyBiometricRegistered=false;notice('Biometric unlock removed from Profile History.');}else{await biometric.registerKCBiometric();S.historyBiometricRegistered=true;notice('Fingerprint / face unlock enabled for Profile History only.');}paint();}catch(error){notice(error.message||'Could not configure Profile History biometrics.');button.disabled=false;}return;}if(e.target.closest('[data-history-biometric-unlock]')){const button=e.target.closest('[data-history-biometric-unlock]');button.disabled=true;try{if(!S.profileHistoryPinSession)throw Error('Enter your mPIN once to enable biometric unlock for this session.');const biometric=await import('./kc-biometric.js');await biometric.authenticateKCBiometric('Unlock Profile History');const target=String(S.historyTargetId||S.user?.auth_id||''),{data,error}=await rpc('crew_profile_history_get',{p_target_auth_id:target,p_pin:S.profileHistoryPinSession});if(error)throw error;if(data?.ok===false)throw Error(data.message||'Could not unlock Profile History.');S.profileHistoryData=data||{};S.profileHistoryUnlocked=true;notice('Profile History unlocked with biometrics.');paint();}catch(error){notice(error.message||'Biometric verification failed. Use your mPIN.');button.disabled=false;}return;}if(e.target.closest('[data-history-lock]')){S.profileHistoryUnlocked=false;S.profileHistoryData=null;paint();return;}if(e.target.closest('[data-profile-history-back]')){S.profileHistoryInCrew=false;S.profileHistoryUnlocked=false;S.profileHistoryData=null;paint();return;}if(e.target.closest('[data-attendance-back]')){S.profileHistoryUnlocked=false;S.profileHistoryData=null;S.attendanceSection='home';paint();return;}const s=e.target.closest('[data-scroll]');if(s){$('#'+s.dataset.scroll)?.scrollIntoView({behavior:'smooth'});return;}if(e.target.closest('[data-clear]')){S.error='';paint();return;}if(e.target.closest('#openQrScanner,#openQrScannerInline')){startQr();return;}if(e.target.closest('#closeQrScanner')){stopQr();$('#qrScanner').hidden=true;return;}if(e.target.closest('#finalizeAttendance')){if(!S.rosterEvent||!await kcConfirmDialog({title:'Finalize event attendance?',message:'All remaining pending members will be marked absent. Finalizing locks the roster.',confirmText:'Finalize attendance',danger:true}))return;await action(async()=>{const r=await api('finalize-attendance','POST',{eventId:S.rosterEvent});S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>x.data||[]);notice(r.message);});return;}const attendanceStatus=e.target.closest('[data-attendance-status]');if(attendanceStatus){if(!S.rosterEvent||!attendanceStatus.dataset.memberId)return;await action(async()=>{const {data,error}=await rpc('crew_set_attendance_status',{p_event_id:S.rosterEvent,p_member_id:attendanceStatus.dataset.memberId,p_status:attendanceStatus.dataset.attendanceStatus});if(error)throw error;S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});notice(data?.message||'Attendance updated.');});return;}if(e.target.closest('#reopenAttendance')){if(!superadmin()||!S.rosterEvent||!await kcConfirmDialog({title:'Reopen event attendance?',message:'Admins will be able to edit attendance statuses again.',confirmText:'Reopen attendance',danger:false}))return;await action(async()=>{const {data,error}=await rpc('crew_reopen_attendance',{p_event_id:S.rosterEvent});if(error)throw error;S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});notice(data?.message||'Attendance reopened.');});return;}if(e.target.closest('#exportAttendance')){exportAttendance();return;}if(e.target.closest('#exportMemberRegistrations')){await exportMemberRegistrations();return;}const del=e.target.closest('[data-delete-event]');if(del){const eventToDelete=S.events.find(item=>String(item.id)===String(del.dataset.deleteEvent));const approved=await kcConfirmDialog({title:'Delete this event?',message:'This will permanently delete '+(eventToDelete?.title||'this event')+', including all registrations and attendance records. This action cannot be undone.',confirmText:'Delete event',cancelText:'Keep event'});if(!approved)return;await action(async()=>{const r=await api('delete-event','DELETE',{eventId:del.dataset.deleteEvent});if(S.rosterEvent===del.dataset.deleteEvent){S.roster=null;S.rosterEvent='';}notice(r.message);await refresh();});return;}if(e.target.closest('#logoutProfile')){await auth.signOut();location.replace(window.kcPath('login.html'));return;}const deleteUpdate=e.target.closest('[data-delete-announcement]');if(deleteUpdate){if(!superadmin()){notice('Only the Super Admin can delete crew updates.');return;}if(!await kcConfirmDialog({title:'Delete crew update?',message:'This update will be removed for everyone.',confirmText:'Delete update',danger:true}))return;await action(async()=>{const {data,error}=await rpc('crew_delete_announcement',{p_announcement_id:deleteUpdate.dataset.deleteAnnouncement});if(error)throw Error(error.message||'Could not delete update.');notice('Crew update deleted.');await refresh();});return;}const readBtn=e.target.closest('[data-read-notice]');if(readBtn){markRead(readBtn.dataset.readNotice);paint();notice('Notification marked as read.');return;}const noticeItem=e.target.closest('[data-notice-id]');if(noticeItem&&!e.target.closest('button')){markRead(noticeItem.dataset.noticeId);paint();return;}const categoryBtn=e.target.closest('[data-notice-category]');if(categoryBtn){S.noticeCategory=categoryBtn.dataset.noticeCategory;paint();return;}const filterBtn=e.target.closest('[data-notice-filter]');if(filterBtn){S.noticeFilter=filterBtn.dataset.noticeFilter;paint();return;}const openNotice=e.target.closest('[data-notice-open]');if(openNotice){const id=openNotice.dataset.noticeOpen;markRead(id);if(openNotice.dataset.noticeType==='profile_reminder'){go('profile');}else if(openNotice.dataset.noticeType==='event'){S.selectedEvent=openNotice.dataset.noticeTarget;go('event-detail');}else if(openNotice.dataset.noticeType==='post'){const postId=openNotice.dataset.noticeTarget;go('feed').then(()=>requestAnimationFrame(()=>document.querySelector('[data-social-post="'+CSS.escape(String(postId))+'"]')?.scrollIntoView({behavior:'smooth',block:'center'})));}else go('updates');return;}
const globalDelete=e.target.closest('[data-global-delete-notice]');
if(globalDelete){
 if(!admin()){notice('Admin access required.');return;}
 const type=globalDelete.dataset.globalDeleteNotice,id=globalDelete.dataset.noticeSourceId;
 if(!['announcement','event','post'].includes(type)||!id){notice('This notification cannot be deleted.');return;}
 if(!await kcConfirmDialog({title:'Delete notification for everyone?',message:'The original '+type+' will remain available in its own section.',confirmText:'Delete notification',danger:true}))return;
 globalDelete.disabled=true;
 try{
  const {error}=await client.from('crew_notification_deletions').insert({notice_type:type,source_id:String(id),deleted_by:S.user.auth_id});
  if(error&&error.code!=='23505')throw error;
  S.deletedNotifications=[...(S.deletedNotifications||[]),type+':'+id];
  paint();notice('Notification deleted from everyone’s inbox.');
 }catch(error){notice(error.message||'Could not delete this notification for everyone.');globalDelete.disabled=false;}
 return;
}
if(e.target.closest('#clearAllNotifications')){
 const ids=notificationItems().map(item=>String(item.notice_id));
 if(!ids.length){notice('Your notification inbox is already clear.');return;}
 const items=notificationItems(),rows=items.map(item=>({user_id:S.user.auth_id,notice_type:item.notice_type,source_id:String(item.id)}));
 const {error}=await client.from('crew_notification_dismissals').upsert(rows,{onConflict:'user_id,notice_type,source_id',ignoreDuplicates:true});
 if(error){notice(error.message||'Could not clear notifications.');return;}
 const all=dismissedNoticeIds();ids.forEach(id=>all.add(id));
 localStorage.setItem(dismissedNoticeKey(),JSON.stringify([...all]));
 S.dismissedNotifications=[...(S.dismissedNotifications||[]),...rows.map(row=>row.notice_type+':'+row.source_id)];
 paint();notice('Your notifications have been cleared on your account. Other members’ inboxes are unchanged.');return;
}
if(e.target.closest('#markAllRead')){localStorage.setItem(readKey(),JSON.stringify(notificationItems().map(a=>a.notice_id)));paint();notice('All notifications marked as read.');return;}if(e.target.closest('#testNoticeSound')){playNoticeSound();notice('That is your Kinetic Crew alert sound.');return;}if(e.target.closest('#enablePush')){await action(async()=>{const result=await window.kcPush.enable();saveNotificationPrefs({push:true});notice(result.message||'Push alerts enabled on this device.');});return;}});
document.addEventListener('input',e=>{
 if(e.target.id==='peopleSearch'){
  S.peopleQuery=e.target.value;const q=S.peopleQuery.trim().toLowerCase(),grid=$('#profileDirectoryGrid');if(!grid)return;
  const cards=[...grid.querySelectorAll('.kc-member-directory-card')];let visible=0;
  cards.forEach(card=>{const show=!q||card.textContent.toLowerCase().includes(q);card.hidden=!show;if(show)visible++;});
  const count=$('#peopleSearchCount');if(count)count.textContent=visible+' / '+(S.publicMembers||[]).length;
  let empty=grid.querySelector('.kc-search-empty');
  if(!visible&&q){if(!empty){empty=document.createElement('div');empty.className='empty kc-search-empty';grid.append(empty);}empty.innerHTML='<div class="emptyicon">⌕</div><b>No matching members</b><p>Try another name or username.</p>';}
  else empty?.remove();
  return;
 }
 if(e.target.id==='attendanceSearch'){S.attendanceQuery=e.target.value;const body=$('#rosterBody');if(body)body.innerHTML=rosterRows(S.roster?.roster||[]);}
});
document.addEventListener('input',e=>{
 if(e.target.id!=='noticeSearch')return;
 S.noticeQuery=e.target.value;const q=S.noticeQuery.trim().toLowerCase(),feed=document.querySelector('.notice-feed');if(!feed)return;
 const cards=[...feed.querySelectorAll('.notification-item')];let visible=0;
 cards.forEach(card=>{const show=!q||card.textContent.toLowerCase().includes(q);card.hidden=!show;if(show)visible++;});
 const count=feed.querySelector('.notice-feed-head small');if(count)count.textContent=visible+' updates';
 let empty=feed.querySelector('.kc-search-empty');
 if(!visible&&q){if(!empty){empty=document.createElement('div');empty.className='empty kc-search-empty';feed.append(empty);}empty.innerHTML='<div class="emptyicon">⌕</div><b>No matching updates</b><p>Try another search.</p>';}
 else empty?.remove();
});
document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;const fallback=img.dataset.fallback;if(!fallback)return;const node=document.createElement('span');node.className=img.classList.contains('profile-photo')?'profile-photo profile-photo-placeholder':('avatar-fallback '+(img.classList.contains('small')?'small':''));node.textContent=fallback;node.setAttribute('aria-label','Profile image unavailable');img.replaceWith(node);},true);

document.addEventListener('input',e=>{
 if(!['kceEventSearch','kceRehearsalSearch'].includes(e.target.id))return;
 const isRehearsal=e.target.id==='kceRehearsalSearch';if(isRehearsal)S.rehearsalQuery=e.target.value;else S.eventQuery=e.target.value;const q=e.target.value.trim().toLowerCase(),root=document.querySelector('.kce-events');if(!root)return;
 root.querySelector('.kce-featured-event')?.toggleAttribute('hidden',!!q);
 root.querySelector('.kce-category-mosaic')?.toggleAttribute('hidden',!!q);
 const grid=root.querySelector('.kce-events-grid');if(!grid)return;
 const cards=[...grid.children].filter(node=>node.matches('.kce-event-card,.kce-ticket-wallet-card'));let visible=0;
 cards.forEach(card=>{const show=!q||card.textContent.toLowerCase().includes(q);card.hidden=!show;if(show)visible++;});
 let empty=grid.querySelector('.kc-search-empty');
 if(q&&!visible){if(!empty){empty=document.createElement('div');empty.className='kce-empty-state kc-search-empty';grid.append(empty);}empty.innerHTML='<span>⌕</span><b>No matching events</b><small>Try another event name, category or venue.</small>';}
 else empty?.remove();
 const total=root.querySelector('.kce-discover-label>span');if(total)total.textContent=(q?visible:cards.length)+' '+((q?visible:cards.length)===1?'EVENT':'EVENTS');
});
function openImageCrop(file,isBanner){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){notice('Choose a JPG, PNG or WebP image under 8 MB.');return;}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{S.crop={img,url,isBanner,zoom:1,x:0,y:0,drag:null};const w=isBanner?520:360,h=isBanner?174:360;$('#modalRoot').innerHTML='<div class="modalback crop-backdrop"><section class="crop-modal"><button type="button" class="iconbutton crop-close" id="cropCancel">×</button><span class="eyebrow">IMAGE STUDIO / '+(isBanner?'PROFILE BANNER':'PROFILE PHOTO')+'</span><h2>Position your image</h2><p>Drag to reposition, then zoom until the frame looks right.</p><canvas id="cropCanvas" width="'+w+'" height="'+h+'"></canvas><label class="crop-zoom">ZOOM <input id="cropZoom" type="range" min="1" max="3" step=".01" value="1"></label><div class="crop-actions"><button type="button" class="outline" id="cropCancelAlt">Cancel</button><button type="button" class="primary" id="cropSave">Use this image →</button></div></section></div>';const canvas=$('#cropCanvas');S.crop.w=w;S.crop.h=h;drawImageCrop();canvas.addEventListener('pointerdown',ev=>{S.crop.drag={x:ev.clientX,y:ev.clientY,ox:S.crop.x,oy:S.crop.y};canvas.setPointerCapture(ev.pointerId);});canvas.addEventListener('pointermove',ev=>{if(!S.crop?.drag)return;const rect=canvas.getBoundingClientRect(),scaleX=w/rect.width,scaleY=h/rect.height;S.crop.x=S.crop.drag.ox+(ev.clientX-S.crop.drag.x)*scaleX;S.crop.y=S.crop.drag.oy+(ev.clientY-S.crop.drag.y)*scaleY;drawImageCrop();});canvas.addEventListener('pointerup',()=>S.crop.drag=null);canvas.addEventListener('pointercancel',()=>S.crop.drag=null);$('#cropZoom').addEventListener('input',ev=>{S.crop.zoom=Number(ev.target.value);drawImageCrop();});$('#cropCancel').onclick=$('#cropCancelAlt').onclick=closeImageCrop;$('#cropSave').onclick=saveCroppedImage;};
 img.onerror=()=>{URL.revokeObjectURL(url);notice('This image could not be opened. Try another file.');};img.src=url;
}
function drawImageCrop(){const c=$('#cropCanvas'),p=S.crop;if(!c||!p)return;const ctx=c.getContext('2d'),w=p.w,h=p.h,scale=Math.max(w/p.img.naturalWidth,h/p.img.naturalHeight)*p.zoom,iw=p.img.naturalWidth*scale,ih=p.img.naturalHeight*scale;ctx.clearRect(0,0,w,h);ctx.fillStyle='#171514';ctx.fillRect(0,0,w,h);ctx.drawImage(p.img,(w-iw)/2+p.x,(h-ih)/2+p.y,iw,ih);ctx.strokeStyle='#ffffffaa';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);}
function closeImageCrop(){if(S.crop?.url)URL.revokeObjectURL(S.crop.url);S.crop=null;$('#modalRoot').innerHTML='';}
async function saveCroppedImage(){
 const p=S.crop;if(!p)return;
 const source=$('#cropCanvas'),out=document.createElement('canvas');
 out.width=p.isBanner?1200:720;out.height=p.isBanner?400:720;
 const outCtx=out.getContext('2d');
 if(!outCtx)throw Error('Image editor could not start.');
 outCtx.drawImage(source,0,0,out.width,out.height);
 let blob=await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',.84));
 if(!blob){notice('Could not process this image.');return;}
 if(blob.size>4.8*1024*1024){
  out.width=p.isBanner?900:560;out.height=p.isBanner?300:560;
  out.getContext('2d').drawImage(source,0,0,out.width,out.height);
  blob=await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',.72));
 }
 if(!blob||blob.size>4.8*1024*1024){notice('Image is still too large. Choose a smaller image.');return;}
 const button=$('#cropSave');button.disabled=true;button.textContent='Uploading & saving…';
 let uploadedPath=null;
 try{
  const userId=S.user?.auth_id||S.user?.id;
  if(!userId)throw Error('Your crew session expired. Sign in again.');
  const path=userId+'/'+(p.isBanner?'banner-':'avatar-')+crypto.randomUUID()+'.jpg';
  const uploaded=await kcUploadWithProgress('crew-avatars',path,blob,{upsert:false,contentType:'image/jpeg',cacheControl:'3600',activityLabel:p.isBanner?'Uploading profile banner':'Uploading profile photo'});
  if(uploaded.error)throw uploaded.error;
  uploadedPath=uploaded.data.path;
  const publicUrl=client.storage.from('crew-avatars').getPublicUrl(uploadedPath).data.publicUrl+'?v='+Date.now();
  const {data:saved,error:saveError}=await rpc('crew_update_profile_images',{
   p_avatar_url:p.isBanner?null:publicUrl,
   p_banner_url:p.isBanner?publicUrl:null
  });
  if(saveError)throw saveError;
  if(!saved?.auth_id)throw Error('The image uploaded, but the profile did not confirm the save. Please retry.');
  S.user={...S.user,...saved};
  try{const profileResult=await rpc('crew_profile_social',{p_auth_id:S.user.auth_id});if(!profileResult.error)S.profileSocial=profileResult.data;}catch{}
  const previewUrl=URL.createObjectURL(blob);
  if(p.isBanner){
   const cover=document.querySelector('.profile-cover');
   if(cover){cover.style.backgroundImage='url('+JSON.stringify(previewUrl)+')';cover.classList.add('has-banner');}
  }else{
   const preview=$('#profilePhotoPreview');
   if(preview?.tagName==='IMG')preview.src=previewUrl;
   else if(preview){const img=document.createElement('img');img.id='profilePhotoPreview';img.className='profile-photo';img.alt='Profile photo';img.src=previewUrl;preview.replaceWith(img);}
  }
  closeImageCrop();paintUser();notice(p.isBanner?'Profile banner saved successfully.':'Profile photo saved successfully.');window.kcCelebrateSave?.();paint();
 }catch(err){
  if(uploadedPath){try{await client.storage.from('crew-avatars').remove([uploadedPath]);}catch{}}
  button.disabled=false;button.textContent='Use this image →';notice(err.message||'Image upload failed.');
 }
}
let kcBrandEditor={image:null,file:null,zoom:100,fit:'contain',rotation:0,x:0,y:0,drag:null,pointers:new Map(),pinch:null,status:''};
function kcBrandMetrics(){
 const p=kcBrandEditor,img=p.image;if(!img)return null;
 const rot=((p.rotation%360)+360)%360,sw=rot%180===0?img.width:img.height,sh=rot%180===0?img.height:img.width;
 const base=p.fit==='cover'?Math.max(512/sw,512/sh):Math.min(512/sw,512/sh)*.94;
 return {rot,sw,sh,scale:base*(p.zoom/100),width:sw*base*(p.zoom/100),height:sh*base*(p.zoom/100)};
}
function kcBrandClampPan(){
 const m=kcBrandMetrics();if(!m)return;
 const p=kcBrandEditor;
 if(p.fit==='cover'){
  const maxX=Math.max(0,(m.width-512)/2),maxY=Math.max(0,(m.height-512)/2);
  p.x=Math.max(-maxX,Math.min(maxX,p.x));
  p.y=Math.max(-maxY,Math.min(maxY,p.y));
 }else{
  p.x=Math.max(-240,Math.min(240,p.x));p.y=Math.max(-240,Math.min(240,p.y));
 }
}
function kcBrandDraw(){
 const canvas=$('#brandLogoCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const size=512;ctx.clearRect(0,0,size,size);
 const tile=32;for(let y=0;y<size;y+=tile)for(let x=0;x<size;x+=tile){ctx.fillStyle=((x/tile+y/tile)%2===0)?'#34363c':'#26282e';ctx.fillRect(x,y,tile,tile);}
 if(!kcBrandEditor.image){
  ctx.fillStyle='rgba(255,255,255,.62)';ctx.font='700 18px system-ui';ctx.textAlign='center';ctx.fillText('YOUR LOGO PREVIEW',256,258);
  ctx.font='13px system-ui';ctx.fillStyle='rgba(255,255,255,.42)';ctx.fillText('Choose or drop an image to begin',256,284);return;
 }
 kcBrandClampPan();
 const p=kcBrandEditor,m=kcBrandMetrics(),img=p.image;
 ctx.save();ctx.translate(size/2+p.x,size/2+p.y);ctx.rotate(m.rot*Math.PI/180);ctx.scale(m.scale,m.scale);ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();
}
function kcBrandSetControls(enabled){
 ['brandLogoZoom','brandLogoRotate','brandLogoCenter','brandLogoReset'].forEach(id=>{const el=$('#'+id);if(el)el.disabled=!enabled;});
 const publish=$('#uploadBrandLogo');if(publish)publish.disabled=!enabled;
 const zoom=$('#brandLogoZoom');if(zoom){zoom.min=kcBrandEditor.fit==='cover'?'100':'50';zoom.value=String(Math.round(kcBrandEditor.zoom));}
 document.querySelectorAll('[data-brand-fit]').forEach(b=>{b.disabled=!enabled;b.classList.toggle('active',b.dataset.brandFit===kcBrandEditor.fit);});
 const stage=$('.kc-brand-editor-stage');if(stage)stage.classList.toggle('has-image',enabled);
 const status=$('#brandLogoEditorStatus');if(status&&kcBrandEditor.status)status.textContent=kcBrandEditor.status;
}
function kcBrandReset(){
 kcBrandEditor.zoom=100;kcBrandEditor.fit='contain';kcBrandEditor.rotation=0;kcBrandEditor.x=0;kcBrandEditor.y=0;kcBrandEditor.drag=null;kcBrandEditor.pinch=null;
 const zoom=$('#brandLogoZoom'),value=$('#brandLogoZoomValue');if(zoom){zoom.min='50';zoom.value='100';}if(value)value.textContent='100%';
 document.querySelectorAll('[data-brand-fit]').forEach(b=>b.classList.toggle('active',b.dataset.brandFit==='contain'));
 kcBrandDraw();
}
async function kcBrandLoadFile(file){
 if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){notice('Choose a PNG, JPG or WebP image under 5 MB.');return;}
 const button=$('#uploadBrandLogo');kcBrandEditor.status='Opening '+file.name+'…';
 if(button){button.disabled=true;button.textContent='Preparing preview…';}
 const status=$('#brandLogoEditorStatus');if(status)status.textContent=kcBrandEditor.status;
 try{
  const loadImageElement=()=>new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image could not be opened.'));};image.src=url;});
  let bitmap;
  if(typeof createImageBitmap==='function'){try{bitmap=await createImageBitmap(file);}catch{bitmap=await loadImageElement();}}
  else bitmap=await loadImageElement();
  if(bitmap.width*bitmap.height>80000000){bitmap.close?.();throw Error('This image is too large to edit. Choose an image under 80 megapixels.');}
  if(kcBrandEditor.image?.close)kcBrandEditor.image.close();
  kcBrandEditor.image=bitmap;kcBrandEditor.file=file;kcBrandReset();kcBrandSetControls(true);
  kcBrandEditor.status=file.name+' · Preview ready';
  const publish=$('#uploadBrandLogo');if(publish){publish.disabled=false;publish.textContent='Publish logo everywhere →';}
  if(status)status.textContent=kcBrandEditor.status;
 }catch(error){kcBrandEditor.status=error.message||'Could not open this image. Choose another file.';if(status)status.textContent=kcBrandEditor.status;notice(kcBrandEditor.status);kcBrandSetControls(!!kcBrandEditor.image);}
}
document.addEventListener('change',event=>{
 if(event.target.id!=='brandLogoFile')return;
 kcBrandLoadFile(event.target.files?.[0]);event.target.value='';
});
document.addEventListener('input',event=>{
 if(event.target.id==='brandLogoZoom'){
  kcBrandEditor.zoom=Math.max(kcBrandEditor.fit==='cover'?100:50,Math.min(300,Number(event.target.value)||100));
  const output=$('#brandLogoZoomValue');if(output)output.textContent=Math.round(kcBrandEditor.zoom)+'%';
  kcBrandClampPan();kcBrandDraw();
 }
});
document.addEventListener('click',event=>{
 const fit=event.target.closest('[data-brand-fit]');
 if(fit){kcBrandEditor.fit=fit.dataset.brandFit;if(kcBrandEditor.fit==='cover')kcBrandEditor.zoom=Math.max(100,kcBrandEditor.zoom);const slider=$('#brandLogoZoom'),output=$('#brandLogoZoomValue');if(slider){slider.min=kcBrandEditor.fit==='cover'?'100':'50';slider.value=String(Math.round(kcBrandEditor.zoom));}if(output)output.textContent=Math.round(kcBrandEditor.zoom)+'%';document.querySelectorAll('[data-brand-fit]').forEach(b=>b.classList.toggle('active',b===fit));kcBrandClampPan();kcBrandDraw();return;}
 if(event.target.closest('#brandLogoRotate')){kcBrandEditor.rotation=(kcBrandEditor.rotation+90)%360;kcBrandClampPan();kcBrandDraw();return;}
 if(event.target.closest('#brandLogoCenter')){kcBrandEditor.x=0;kcBrandEditor.y=0;kcBrandDraw();return;}
 if(event.target.closest('#brandLogoReset')){kcBrandReset();return;}
});
document.addEventListener('dragover',event=>{
 const stage=event.target.closest('.kc-brand-editor-stage');if(!stage)return;event.preventDefault();stage.classList.add('is-drop-target');
});
document.addEventListener('dragleave',event=>{
 const stage=event.target.closest('.kc-brand-editor-stage');if(stage&&!stage.contains(event.relatedTarget))stage.classList.remove('is-drop-target');
});
document.addEventListener('drop',event=>{
 const stage=event.target.closest('.kc-brand-editor-stage');if(!stage)return;
 event.preventDefault();stage.classList.remove('is-drop-target');
 const file=event.dataTransfer?.files?.[0];if(file)kcBrandLoadFile(file);
});
function kcBrandPointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
document.addEventListener('pointerdown',event=>{
 const canvas=event.target.closest('#brandLogoCanvas');if(!canvas||!kcBrandEditor.image)return;
 event.preventDefault();try{canvas.setPointerCapture(event.pointerId);}catch{}
 const p=kcBrandEditor;p.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 if(p.pointers.size===2){
  const pts=[...p.pointers.values()];p.drag=null;p.pinch={distance:Math.max(1,kcBrandPointerDistance(pts[0],pts[1])),zoom:p.zoom};
 }else{
  p.drag={id:event.pointerId,x:event.clientX,y:event.clientY,originX:p.x,originY:p.y};
 }
});
document.addEventListener('pointermove',event=>{
 const p=kcBrandEditor;if(!p.pointers.has(event.pointerId))return;
 p.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 const canvas=$('#brandLogoCanvas');if(!canvas)return;
 if(p.pointers.size>=2&&p.pinch){
  const pts=[...p.pointers.values()],distance=kcBrandPointerDistance(pts[0],pts[1]);
  p.zoom=Math.max(p.fit==='cover'?100:50,Math.min(300,p.pinch.zoom*distance/p.pinch.distance));
  const slider=$('#brandLogoZoom'),output=$('#brandLogoZoomValue');if(slider)slider.value=String(Math.round(p.zoom));if(output)output.textContent=Math.round(p.zoom)+'%';
 }else if(p.drag?.id===event.pointerId){
  const rect=canvas.getBoundingClientRect();
  p.x=p.drag.originX+(event.clientX-p.drag.x)*512/Math.max(1,rect.width);
  p.y=p.drag.originY+(event.clientY-p.drag.y)*512/Math.max(1,rect.height);
 }
 kcBrandClampPan();kcBrandDraw();
});
function kcBrandEndPointer(event){
 const p=kcBrandEditor;p.pointers.delete(event.pointerId);
 if(p.pointers.size<2)p.pinch=null;
 if(!p.pointers.size)p.drag=null;
 else if(p.pointers.size===1){const [id,point]=[...p.pointers.entries()][0];p.drag={id,x:point.x,y:point.y,originX:p.x,originY:p.y};}
}
document.addEventListener('pointerup',kcBrandEndPointer);
document.addEventListener('pointercancel',kcBrandEndPointer);
document.addEventListener('lostpointercapture',kcBrandEndPointer);
document.addEventListener('click',async event=>{
 const copyExternal=event.target.closest('[data-copy-external-brand-url]');
 if(copyExternal){const field=$('#externalFormsLogoUrl');if(!field?.value)return;try{await navigator.clipboard.writeText(field.value);notice('External forms logo URL copied.');}catch(error){field.focus();field.select();notice('Select and copy the external logo URL.');}return;}
 const button=event.target.closest('#uploadBrandLogo');if(!button)return;
 event.preventDefault();
 if(!superadmin()){notice('Only the Super Admin can change the official logo.');return;}
 if(!kcBrandEditor.image){notice('Choose a logo image first.');return;}
 const oldLabel=button.textContent;button.disabled=true;button.textContent='Preparing logo…';
 try{
  const keys=['app','browser','pwa','signin','email','notifications','share_cards','external_forms'];
  const targets=Object.fromEntries(keys.map(key=>[key,!!document.querySelector('[data-brand-target="'+key+'"]')?.checked]));targets.external_forms=true;
  const selected=keys.filter(key=>targets[key]);
  if(!selected.length)throw Error('Select at least one destination for the new logo.');
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Your browser could not prepare the logo image.');
  kcBrandClampPan();const p=kcBrandEditor,m=kcBrandMetrics(),img=p.image;
  ctx.clearRect(0,0,512,512);ctx.translate(256+p.x,256+p.y);ctx.rotate(m.rot*Math.PI/180);ctx.scale(m.scale,m.scale);ctx.drawImage(img,-img.width/2,-img.height/2);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Could not export the edited logo. Try another image.');
  const storage=client.storage.from('crew-brand-assets');
  const assets={...(S.appSettings?.brand_logo_assets||{})};
  for(const key of selected){
   button.textContent='Updating '+key+' logo…';
   const path='brand/destinations/'+key+'.png';
   const uploaded=await kcUploadWithProgress('crew-brand-assets',path,blob,{upsert:true,contentType:'image/png',cacheControl:'0',activityLabel:'Publishing brand asset'});
   if(uploaded.error)throw uploaded.error;
   assets[key]=storage.getPublicUrl(path).data.publicUrl+'?v='+Date.now();
   if(key==='email'){
    const emailUpload=await storage.upload('brand/email-logo.png',blob,{upsert:true,contentType:'image/png',cacheControl:'0'});
    if(emailUpload.error)throw emailUpload.error;
   }
  }
  button.textContent='Saving selected destinations…';
  const targetSaved=await rpc('crew_set_app_setting',{p_key:'brand_logo_targets',p_value:targets});
  if(targetSaved.error)throw targetSaved.error;
  const assetSaved=await rpc('crew_set_app_setting',{p_key:'brand_logo_assets',p_value:assets});
  if(assetSaved.error)throw assetSaved.error;
  S.appSettings={...(S.appSettings||{}),brand_logo_assets:assets,brand_logo_targets:targets};
  window.kcApplyBrandLogo?.(assets,targets,S.appSettings?.brand_logo_url||'');
  const previewUrl=assets[selected[0]];
  const current=$('#brandLogoCurrent');if(current){current.onerror=()=>window.kcShowBrandFallback?.(current);current.src=previewUrl;}
  kcBrandEditor.status='Published successfully · Only the selected destinations were updated';const status=$('#brandLogoEditorStatus');if(status)status.textContent=kcBrandEditor.status;
  notice('Logo updated only on the selected destinations.');paint();
  requestAnimationFrame(()=>{window.kcApplyBrandLogo?.(assets,targets,S.appSettings?.brand_logo_url||'');const live=$('#brandLogoCurrent');if(live&&live.getAttribute('src')!==previewUrl)live.src=previewUrl;});
 }catch(error){kcBrandEditor.status=error.message||'Logo upload failed. Your current logo is unchanged.';const status=$('#brandLogoEditorStatus');if(status)status.textContent=kcBrandEditor.status;notice(kcBrandEditor.status);button.disabled=!kcBrandEditor.image;button.textContent=oldLabel;}
});
document.addEventListener('change',async e=>{
 if(e.target.matches('[data-brand-select-all]')){
  document.querySelectorAll('[data-brand-target]').forEach(input=>{input.checked=e.target.checked;});
 }
 if(e.target.matches('[data-brand-target]')){
  const boxes=[...document.querySelectorAll('[data-brand-target]')];
  const all=document.querySelector('[data-brand-select-all]');
  if(all)all.checked=boxes.length>0&&boxes.every(input=>input.checked);
 }
 if(e.target.id==='settingsSound'){saveNotificationPrefs({sound:e.target.checked});if(e.target.checked)playNoticeSound();notice(e.target.checked?'In-app sounds enabled.':'In-app sounds muted.');}
 if(e.target.id==='promotionalUpdates'){const input=e.target;input.disabled=true;try{const result=await rpc('crew_set_promotion_preference',{p_enabled:input.checked});if(result.error)throw result.error;S.promotionalUpdatesEnabled=input.checked;notice(input.checked?'Promotional updates enabled.':'Promotional updates paused.');}catch(error){input.checked=!input.checked;notice(error.message||'Could not update promotional preferences.');}finally{input.disabled=false;}}
 if(e.target.id==='introAudioUpload'){const file=e.target.files?.[0];if(!file)return;if(!admin()){notice('Admin access required.');return;}if(!file.type.startsWith('audio/')||file.size>15*1024*1024){notice('Choose an audio file under 15 MB.');return;}try{const path='admin/intro-'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const uploaded=await client.storage.from('crew-intro-audio').upload(path,file,{upsert:true,contentType:file.type});if(uploaded.error)throw uploaded.error;const url=client.storage.from('crew-intro-audio').getPublicUrl(uploaded.data.path).data.publicUrl;const saved=await rpc('crew_set_app_setting',{p_key:'intro_audio_url',p_value:JSON.stringify(url)});if(saved.error)throw saved.error;S.appSettings={...(S.appSettings||{}),intro_audio_url:url};notice('Crew intro soundtrack saved.');}catch(err){notice(err.message||'Soundtrack upload failed.');}}
});
document.addEventListener('click',async e=>{
 if(e.target.closest('#applyAppUpdate')){
  const button=e.target.closest('#applyAppUpdate');
  const oldLabel=button.textContent;
  button.disabled=true;button.textContent='Refreshing…';
  try{
   try{const result=await rpc('crew_get_app_settings',{});if(!result.error)S.appSettings=result.data||S.appSettings||{};}catch{}
   if('serviceWorker'in navigator){
    const registration=await navigator.serviceWorker.getRegistration(window.kcPath(''));
    if(registration){
     await registration.update();
     let worker=registration.installing||registration.waiting;
     if(worker){
      await new Promise(resolve=>{
       if(['installed','activated','redundant'].includes(worker.state)){resolve();return;}
       const timer=setTimeout(resolve,10000);
       worker.addEventListener('statechange',()=>{if(['installed','activated','redundant'].includes(worker.state)){clearTimeout(timer);resolve();}});
      });
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      if(registration.waiting||registration.installing){
       await new Promise(resolve=>{
        const timer=setTimeout(resolve,4000);
        navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
       });
      }
     }
    }
   }
   if('caches'in window){
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('kinetic-crew-shell-')).map(key=>caches.delete(key)));
   }
   savePageState();
   const refreshUrl=new URL(window.location.href);
   refreshUrl.searchParams.set('kc_refresh',String(Date.now()));
   notice('Refreshing Kinetic Crew with the latest files…');
   window.location.replace(refreshUrl.toString());
  }catch(err){
   notice(err.message||'Could not refresh the app. Check your connection and try again.');
   button.disabled=false;button.textContent=oldLabel;
  }
  return;
 }
 
 if(e.target.closest('#clearAppCache')){try{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('kinetic-crew-')).map(k=>caches.delete(k)));}notice('Temporary cache cleared. Reloading fresh assets…');setTimeout(()=>location.reload(),500);}catch(err){notice('Could not clear app cache.');}return;}
 if(e.target.closest('#settingsSignOut')){try{await auth.signOut();}finally{location.replace(window.kcPath('login.html'));}return;}
 
});
document.addEventListener('click',e=>{if(e.target.closest('[data-profile-photo-pick]')){$('#profilePhotoInput')?.click();}});
document.addEventListener('change',async e=>{if(e.target.id==='profilePhotoInput'||e.target.id==='profileBannerInput'){const file=e.target.files?.[0];if(file)openImageCrop(file,e.target.id==='profileBannerInput');}else if(e.target.id==='noticeSound'){saveNotificationPrefs({sound:e.target.checked});if(e.target.checked)playNoticeSound();notice(e.target.checked?'In-app sound enabled.':'In-app sound muted.');}});
document.addEventListener('click',async e=>{const save=e.target.closest('.profile-admin-save');if(!save)return;const row=save.closest('[data-profile-row]');await action(async()=>{const {data,error}=await rpc('crew_manage_profile',{p_auth_id:row.dataset.profileRow,p_name:row.querySelector('[name=member_name]').value,p_bio:row.querySelector('[name=member_bio]').value});if(error)throw Error(error.message||'Could not update member profile.');notice('Member profile updated.');await refresh();});});
document.addEventListener('keydown',e=>{const item=e.target.closest('[data-open-event]');if(item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();S.selectedEvent=item.dataset.openEvent;go('event-detail');}}); 
document.addEventListener('click',e=>{const schedule=e.target.closest('[data-alert-schedule]');if(schedule){e.preventDefault();scheduleCustomAlert($('#customAlertForm'),schedule);return;}const cancel=e.target.closest('[data-alert-cancel]');if(cancel){e.preventDefault();cancelScheduledCustomAlert(cancel);return;}if(e.target.closest('[data-alert-schedule-refresh]')){e.preventDefault();loadScheduledCustomAlerts();return;}if(e.target.closest('[data-alert-image-choose]')){$('#kcAlertImageFile')?.click();return;}if(e.target.closest('[data-alert-image-remove]')){removeCustomAlertImage();const preview=$('#kcAlertImagePreview'),status=$('#kcAlertImageStatus');if(preview)preview.innerHTML='';if(status)status.textContent='Image removed';}});
document.addEventListener('change',e=>{if(e.target.id==='kcAlertImageFile'&&e.target.files?.[0])uploadCustomAlertImage(e.target.files[0]);});
document.addEventListener('paste',e=>{if(!e.target.closest('#customAlertForm'))return;const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith('image/'));if(!item)return;const file=item.getAsFile();if(file){e.preventDefault();uploadCustomAlertImage(file);}});
document.addEventListener('dragover',e=>{if(e.target.closest('#kcAlertImageDrop')){e.preventDefault();e.target.closest('#kcAlertImageDrop').classList.add('is-dragging');}});
document.addEventListener('dragleave',e=>{if(e.target.closest('#kcAlertImageDrop'))e.target.closest('#kcAlertImageDrop').classList.remove('is-dragging');});
document.addEventListener('drop',e=>{const zone=e.target.closest('#kcAlertImageDrop');if(!zone)return;e.preventDefault();zone.classList.remove('is-dragging');const file=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith('image/'));if(file)uploadCustomAlertImage(file);});
document.addEventListener('submit',async e=>{
 let f=e.target;
 if(f.id==='kcHistoryPinSetup'){
  e.preventDefault();const d=new FormData(f),pin=String(d.get('pin')||''),confirmPin=String(d.get('confirmPin')||'');
  if(!/^\d{4}$/.test(pin)){notice('Choose a four-digit mPIN.');return;}
  if(pin!==confirmPin){notice('The mPIN entries do not match.');return;}
  const button=f.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Saving securely…';
  try{const {data,error}=await rpc('crew_profile_history_set_pin',{p_pin:pin});if(error)throw error;S.profileHistoryPinSession=pin;S.profileHistoryPinStatus={...(S.profileHistoryPinStatus||{}),pin_configured:true};S.profileHistoryUnlocked=false;S.profileHistoryData=null;notice(data?.message||'mPIN saved.');paint();}
  catch(error){notice(error.message||'Could not save mPIN.');}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Save secure mPIN →';}}
  return;
 }
 if(f.id==='kcHistoryPinUnlock'){
  e.preventDefault();const d=new FormData(f),pin=String(d.get('pin')||''),target=String(S.historyTargetId||S.user?.auth_id||'');
  const button=f.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Verifying…';
  try{const {data,error}=await rpc('crew_profile_history_get',{p_target_auth_id:target,p_pin:pin});if(error)throw error;if(data?.ok===false)throw Error(data.message||'Incorrect mPIN.');S.profileHistoryPinSession=pin;S.profileHistoryData=data||{};S.profileHistoryUnlocked=true;notice('Profile history unlocked.');paint();}
  catch(error){notice(error.message||'Could not unlock Profile History.');}
  finally{if(button.isConnected){button.disabled=false;button.textContent='Unlock profile history →';}}
  return;
 }
 if(f.id==='appSuggestionForm'){
  e.preventDefault();const d=new FormData(f),button=f.querySelector('button[type="submit"]');button.disabled=true;
  try{const {error}=await client.from('crew_app_suggestions').insert({author_id:S.user.auth_id,category:d.get('category'),title:String(d.get('title')||'').trim(),details:String(d.get('details')||'').trim()});if(error)throw error;await loadAppSuggestions();notice('Thank you. Your app suggestion was submitted.');paint();}
  catch(error){notice(error.message||'Could not submit your suggestion.');}
  finally{button.disabled=false;}return;
 }
 if(f.matches('[data-suggestion-admin-form]')){
  e.preventDefault();if(!admin()){notice('Admin access required.');return;}
  const d=new FormData(f),button=f.querySelector('button[type="submit"]');button.disabled=true;
  try{const {error}=await client.from('crew_app_suggestions').update({status:d.get('status'),admin_note:String(d.get('admin_note')||'').trim(),updated_at:new Date().toISOString()}).eq('id',f.dataset.suggestionAdminForm);if(error)throw error;await loadAppSuggestions();notice('Suggestion review updated.');paint();}
  catch(error){notice(error.message||'Could not update suggestion.');}
  finally{button.disabled=false;}return;
 }
 if(f.id==='kcDirectMessageForm'){
  e.preventDefault();
  const body=String(new FormData(f).get('body')||'').trim(),recipientId=f.dataset.recipientId,button=f.querySelector('button[type="submit"]');
  if(!body)return;button.disabled=true;
  try{
   await rpc('crew_assert_not_blocked',{});
   const {error}=await client.from('crew_direct_messages').insert({sender_id:S.user.auth_id,recipient_id:recipientId,body});
   if(error)throw error;f.reset();await refreshDirectMessageThread(recipientId);
  }catch(error){notice(error.message||'Could not send this message.');}
  finally{button.disabled=false;}
  return;
 }
 const featureFormEl=f.closest('[data-feature-form]');
 if(featureFormEl){
  e.preventDefault();
  const key=featureFormEl.dataset.feature,d=new FormData(featureFormEl),data={};
  ['from_date','to_date','style','media_url'].forEach(k=>{if(d.get(k))data[k]=d.get(k);});
  if(key==='memories'){
   let uploadedPath='';
   try{
    const title=String(d.get('title')||'').trim(),body=String(d.get('body')||'').trim(),photo=d.get('memory_photo');
    if(!title){notice('Enter a memory title.');return;}
    delete data.recipient_ids;
    if(photo&&photo.size){
     if(!/^image\/(jpeg|png|webp|gif)$/.test(photo.type)){notice('Choose a JPG, PNG, WEBP or GIF photo.');return;}
     if(photo.size>15*1024*1024){notice('Photo must be 15 MB or smaller.');return;}
     const safeName=String(photo.name||'memory-photo').replace(/[^a-zA-Z0-9._-]/g,'-').slice(-90);
     uploadedPath=S.user.auth_id+'/'+Date.now()+'-'+safeName;
     const uploaded=await kcUploadWithProgress('crew-memories',uploadedPath,photo,{cacheControl:'3600',upsert:false,contentType:photo.type,activityLabel:'Uploading KC Memory'});
     if(uploaded.error)throw uploaded.error;
     data.storage_path=uploadedPath;
     data.media_type=photo.type;
    }else{
     const url=String(d.get('media_url')||'').trim();
     if(!url){notice('Choose a photo from your device or paste an image URL.');return;}
     let parsed;try{parsed=new URL(url);}catch{throw Error('Enter a valid image URL.');}
     if(parsed.protocol!=='https:')throw Error('Use a secure HTTPS image URL.');
     data.media_url=parsed.href;
     data.media_type='image/external';
    }
    const {data:created,error:createError}=await rpc('crew_memories_create',{p_title:title,p_body:body,p_data:data});
    if(createError)throw createError;
    uploadedPath='';
    await loadMemories();
    notice(created?.message||'Memory shared successfully.');
    paint();
   }catch(error){
    if(uploadedPath)await client.storage.from('crew-memories').remove([uploadedPath]).catch(()=>{});
    notice('Memory could not be shared: '+(error.message||'Please try again.'));
   }
   return;
  }
  if(key==='rehearsals'){data.session_at=new Date(d.get('session_at')).toISOString();data.location=d.get('location')||'';}
  if(key==='leave'&&new Date(data.from_date)>new Date(data.to_date)){notice('End date must be on or after the start date.');return;}
  const pollOptions=key==='polls'?d.getAll('poll_option').map(value=>String(value||'').trim()).filter(Boolean):[];const body=key==='polls'?pollOptions.join(', '):String(d.get('body')||'');
  if(key==='polls')data.selection_mode=String(d.get('selection_mode')||'single')==='multiple'?'multiple':'single';
  if(key==='polls'){
   if(pollOptions.some(value=>value.includes(','))){notice('Do not use commas inside an individual poll option.');return;}
   const options=body.split(',').map(value=>value.trim()).filter(Boolean),unique=[...new Set(options.map(value=>value.toLowerCase()))];
   if(unique.length<2){notice('Add at least two different poll options, separated by commas.');return;}
   if(unique.length>10){notice('A poll can have up to 10 options.');return;}
   if(options.some(value=>value.length>120)){notice('Each poll option must be 120 characters or fewer.');return;}
  }
  try{
   const res=await featureApi('create',key,{title:d.get('title'),body,data});
   if(key==='rehearsals'){try{await window.kcPush.send(String(d.get('title')||'Crew rehearsal'),body||'A new rehearsal has been scheduled.','all',{sendEmail:d.get('send_email')==='true',emailKey:'rehearsal:'+res.id,emailType:'rehearsal'});}catch(pushError){console.warn('Rehearsal saved; notification delivery failed:',pushError);notice('Rehearsal saved, but its notification could not be delivered.');}}
   notice(res.message);
   S.featureItems[key]=key==='rehearsals'?await loadRehearsalItems():await featureApi('list',key,{});
   if(key==='polls'){S.pollScreen='list';S.selectedPoll=null;paint();}
   if(key==='chat'){S.view='chat';paint();$('#waMessages')?.scrollTo({top:$('#waMessages').scrollHeight,behavior:'smooth'});}
  }catch(error){S.error=error.message||'Could not save this item.';paint();}
  return;
 }
if(f.id==='attendanceReportForm'){e.preventDefault();const d=new FormData(f),button=f.querySelector('button[type="submit"]'),toEmail=String(d.get('toEmail')||'').trim();if(!toEmail){notice('Enter the report email address.');return;}button.disabled=true;button.textContent='Preparing full PDF and sending…';try{const {data,error}=await client.functions.invoke('send-attendance-report',{body:{toEmail}});if(error){let detail=error.message||'Attendance report email failed.';try{const ctx=error.context;if(ctx&&typeof ctx.json==='function'){const payload=await ctx.json();detail=payload.error||payload.message||detail;}}catch{}throw Error(detail);}if(data?.error)throw Error(data.error);notice(data?.scope==='personal'?'Personal attendance report sent with PDF.':'Complete attendance report sent with PDF.');}catch(error){notice('Report email failed: '+(error.message||'Check the email service configuration.'));}finally{button.disabled=false;button.textContent='✉ Send attendance report + PDF';}return;}if(f.id==='sendEventTicketsForm'){e.preventDefault();if(!admin()){notice('Admin access required.');return;}const d=new FormData(f),button=f.querySelector('button[type="submit"]');if(d.get('recipientMode')==='single'&&!d.get('email')){notice('Choose one registered member first.');return;}button.disabled=true;button.textContent='Sending tickets…';kcIslandActivity('Sending event tickets','Contacting the email service…',{target:'events',status:'pending',persistent:true,icon:'✉'});try{const {data,error}=await client.functions.invoke('send-event-ticket',{body:{eventId:d.get('eventId'),recipientMode:d.get('recipientMode'),email:d.get('email')}});if(error){let detail=error.message||'Ticket email request failed.';try{const ctx=error.context;if(ctx&&typeof ctx.json==='function'){const payload=await ctx.json();detail=payload.error||payload.message||detail;}}catch{}throw Error(detail);}if(data?.error)throw Error(data.error);const sent=Number(data?.sent||0),failed=Number(data?.failed||0);kcIslandActivity('Event tickets processed',sent+' sent · '+failed+' failed',{target:'events',status:failed?'failed':'success',duration:failed?8000:4200,icon:failed?'!':'✓'});const details=Array.isArray(data?.results)?data.results.filter(x=>!x.ok).map(x=>(x.email||'Recipient')+': '+(x.error||'SMTP rejected the message')):[];if(failed){const detail=details.length?' '+details.join(' · '):'';notice('Tickets sent: '+sent+' · Failed: '+failed+'.'+detail);}else notice('Tickets sent successfully: '+sent+'.');}catch(error){kcIslandActivity('Ticket delivery failed',error.message||'Check the email service.',{target:'events',status:'failed',duration:8500,icon:'!'});notice('Ticket send failed: '+(error.message||'Check the SMTP configuration.'));}finally{button.disabled=false;button.textContent='✉ Send event tickets';}return;}if(f.id==='gramCreateForm'){
 e.preventDefault();const d=new FormData(f),kind=String(d.get('kind')||'post'),file=d.get('media'),caption=String(d.get('caption')||'').trim(),button=f.querySelector('button[type="submit"]');
 if(!file||!file.size){notice('Choose a photo or video first.');return;}
 if(!/^image\/(jpeg|png|webp|gif)$|^video\/(mp4|webm|quicktime)$/.test(file.type)){notice('Choose a supported photo or video.');return;}
 if(file.size>100*1024*1024){notice('Media must be 100 MB or smaller.');return;}
 button.disabled=true;let path='';
 try{
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin';
  path=S.user.auth_id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'.'+ext;
  const uploaded=await kcUploadWithProgress('crew-gram-media',path,file,{cacheControl:'3600',upsert:false,contentType:file.type,activityLabel:kind==='story'?'Uploading KC Gram story':'Uploading KC Gram media',activityTarget:'gram'});
  if(uploaded.error)throw uploaded.error;
  if(kind==='story'){
   const {error}=await client.from('crew_social_stories').insert({author_id:S.user.auth_id,storage_path:path,media_mime_type:file.type,caption});
   if(error)throw error;S.gramTab='home';notice('Story shared for 24 hours.');
  }else{
   const {error}=await client.from('crew_social_posts').insert({author_id:S.user.auth_id,link_url:null,caption,post_type:kind==='reel'?'reel':'post',storage_path:path,media_mime_type:file.type});
   if(error)throw error;S.gramTab=kind==='reel'?'reels':'posts';notice(kind==='reel'?'Reel shared with the crew.':'Post shared with the crew.');
  }
  path='';$('#modalRoot').innerHTML='';await loadSocialFeed();paint();
 }catch(error){if(path)await client.storage.from('crew-gram-media').remove([path]);notice(error.message||'Could not publish this media.');}
 finally{if(button.isConnected)button.disabled=false;}
 return;
 }
 if(f.id==='socialPostForm'){e.preventDefault();const d=new FormData(f);await action(async()=>{const link=safeSocialUrl(d.get('link_url'));if(!link)throw Error('Paste a valid HTTPS link.');const {error}=await client.from('crew_social_posts').insert({author_id:S.user.auth_id,link_url:link,caption:String(d.get('caption')||'').trim()});if(error)throw error;S.sharedDraft=null;await loadSocialFeed();notice('Shared with the crew.');});return;}if(f.matches('[data-social-comment-form]')){e.preventDefault();const d=new FormData(f),body=String(d.get('body')||'').trim(),postId=f.dataset.socialCommentForm;if(!body)return;await action(async()=>{const {error}=await client.from('crew_social_comments').insert({post_id:postId,user_id:S.user.auth_id,body});if(error)throw error;await loadSocialFeed();notice('Comment added.');});return;}if(f.id==='profileForm'){e.preventDefault();const d=new FormData(f);await action(async()=>{const username=String(d.get('username')||'').trim().toLowerCase();const existingUsername=String(S.user?.username||'').trim().toLowerCase();if(username!==existingUsername){const availability=await rpc('crew_check_username',{p_username:username});if(availability.error)throw availability.error;if(!availability.data?.available)throw Error(availability.data?.message||'Username already taken.');}const dob=String(d.get('date_of_birth')||'');const registration=String(d.get('registration_number')||'').trim().toUpperCase().replace(/\s+/g,'');const instagram=String(d.get('instagram_username')||'').trim().replace(/^@/,'');const bio=String(d.get('bio')||'').trim();if(!registration||!/^[A-Z0-9\/-]{4,30}$/.test(registration))throw Error('Enter your valid college registration number (4–30 letters, numbers, / or -).');/* Profile photo is optional. */if(!dob||dob>new Date().toISOString().slice(0,10))throw Error('Enter a valid date of birth.');if(instagram&&!/^[A-Za-z0-9._]{1,30}$/.test(instagram))throw Error('Enter a valid Instagram username.');const result=await api('profile','PATCH',{name:d.get('name'),bio,username,avatar_url:S.user.avatar_url,banner_url:S.user.banner_url||null,date_of_birth:dob,instagram_username:instagram,registration_number:registration});S.pendingAvatarUrl=null;S.pendingBannerUrl=null;S.user={...S.user,...result,name:result.name||d.get('name'),bio:result.bio??bio};await refresh();S.user={...S.user,...result};const profileResult=await rpc('crew_profile_social',{p_auth_id:S.user.auth_id});if(profileResult.error)throw profileResult.error;S.profileSocial=profileResult.data;S.user={...S.user,...(S.profileSocial?.profile||{})};const complete=profileIsComplete(S.user);if(complete){S.view='overview';notice('Profile completed. Welcome to Kinetic Crew!');}else{S.view='profile';notice('Profile details saved. Complete the remaining fields.');}celebrateSave();paint();});}else if(f.id==='eventForm'){e.preventDefault();const d=new FormData(f),mode=f.dataset.mode==='rehearsals'?'rehearsals':'events',isRehearsal=mode==='rehearsals',eventId=String(d.get('eventId')||'').trim(),editing=!!eventId,button=f.querySelector('button[type="submit"]'),bannerInput=f.querySelector('#kcEventBannerFile'),bannerFile=bannerInput?.files?.[0];if(button){button.disabled=true;button.textContent=editing?'Saving changes…':(isRehearsal?'Scheduling rehearsal…':'Publishing event…');}let uploadedBannerPath='',eventSaved=false;try{let bannerUrl=String(d.get('cover_url')||'').trim();if(bannerFile){if(!['image/jpeg','image/png','image/webp'].includes(bannerFile.type))throw Error('Choose a JPG, PNG or WebP image.');if(bannerFile.size>5*1024*1024)throw Error('Banner image must be 5 MB or smaller.');const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' })[bannerFile.type],eventUploaderId=String(S.user?.auth_id||S.user?.id||''),path=eventUploaderId+'/event-banners/'+crypto.randomUUID()+'.'+ext;if(!eventUploaderId)throw Error('Your crew session expired. Sign in again.');const uploaded=await kcUploadWithProgress('crew-avatars',path,bannerFile,{upsert:false,contentType:bannerFile.type,cacheControl:'3600',activityLabel:'Uploading event banner',activityTarget:'events'});if(uploaded.error)throw uploaded.error;uploadedBannerPath=uploaded.data.path;bannerUrl=client.storage.from('crew-avatars').getPublicUrl(uploadedBannerPath).data.publicUrl;}let redirectUrl=String(d.get('redirect_url')||'').trim();if(redirectUrl){let parsedRedirect;try{parsedRedirect=new URL(redirectUrl);}catch{throw Error('Enter a valid HTTPS redirect link.');}if(parsedRedirect.protocol!=='https:')throw Error('Redirect link must use HTTPS.');redirectUrl=parsedRedirect.href;}const payload={p_event_id:eventId||null,p_title:String(d.get('title')||'').trim(),p_description:String(d.get('description')||''),p_location:String(d.get('location')||''),p_starts_at:new Date(d.get('starts_at')).toISOString(),p_capacity:Number(d.get('capacity')),p_category:isRehearsal?'Rehearsals':String(d.get('category')||'Community'),p_cover_url:bannerUrl,p_featured:d.get('featured')==='true',p_ticket_email_enabled:d.get('ticket_email_enabled')==='true',p_redirect_url:redirectUrl,p_show_countdown:d.get('show_countdown')==='true'};const {data,error}=await rpc('crew_event_save',payload);if(error)throw error;eventSaved=true;const id=String(data.id||eventId),eventStatus=String(d.get('event_status')||'scheduled');const {error:statusError}=await rpc('crew_event_set_status',{p_event_id:id,p_status:eventStatus});if(statusError)throw statusError;const previous=S.events.find(x=>String(x.id)===id)||{},updatedAt=data.updated_at||new Date().toISOString(),saved={...previous,id,title:payload.p_title,description:payload.p_description,location:payload.p_location,starts_at:payload.p_starts_at,capacity:payload.p_capacity,category:payload.p_category,cover_url:payload.p_cover_url,redirect_url:payload.p_redirect_url,featured:payload.p_featured,ticket_email_enabled:payload.p_ticket_email_enabled,show_countdown:payload.p_show_countdown,event_status:eventStatus,updated_at:updatedAt,created_at:previous.created_at||updatedAt};if(editing)S.events=S.events.map(x=>String(x.id)===id?saved:x);else S.events=[...S.events,saved];S.selectedEvent=id;S.eventMode=mode;S.editingEventId=null;S.view=editing?'event-detail':(isRehearsal?'rehearsals':'events');notice(editing?(isRehearsal?'Rehearsal updated.':'Event updated. Members will see the latest details.'):(isRehearsal?'Rehearsal scheduled.':'Event published.'));paint();if(!editing){try{await window.kcPush.send((isRehearsal?'New crew rehearsal: ':'New crew event: ')+payload.p_title,payload.p_description||((isRehearsal?'Rehearsal':'Event')+' at '+(payload.p_location||'location TBA')),'all',{sendEmail:d.get('send_email')==='true',emailKey:'event:'+id+':'+updatedAt,emailType:'event'});}catch(pushError){console.warn('Event saved; push delivery failed:',pushError);}}refresh().catch(error=>console.warn('Background event refresh failed:',error));}catch(error){if(uploadedBannerPath&&!eventSaved){try{await client.storage.from('crew-avatars').remove([uploadedBannerPath]);}catch{}}notice(error.message||'Could not save this event.');if(button){button.disabled=false;button.textContent=editing?'Save '+(isRehearsal?'rehearsal':'event')+' changes':'＋ Publish '+(isRehearsal?'rehearsal':'event');}}}else if(f.id==='updateForm'||f.id==='customAlertForm'){e.preventDefault();if(f.id==='customAlertForm'&&!admin()){notice('Admin access required.');return;}const d=new FormData(f),isCustom=f.id==='customAlertForm',submit=f.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.textContent=isCustom?'Sending notification…':'Publishing announcement…';}await action(async()=>{try{if(isCustom){const imageAttached=!!f.querySelector('#kcAlertImagePreview img')&&!!S.customAlertImagePath&&!!S.customAlertImageUrl;const result=await window.kcPush.send(d.get('title'),d.get('body'),d.get('audience'),{imageUrl:imageAttached?S.customAlertImageUrl:''});if(Number(result?.sent||0)===0)notice('No registered push devices were found for this audience. Nothing was added to the app.');else notice('Notification sent to '+result.sent+' registered device(s).');if(Number(result?.sent||0)>0){S.customAlertImageUrl='';S.customAlertImagePath='';f.reset();const preview=$('#kcAlertImagePreview'),status=$('#kcAlertImageStatus');if(preview)preview.innerHTML='';if(status)status.textContent='';}}else{const a=await api('announcements','POST',{title:d.get('title'),body:d.get('body'),audience:d.get('audience')});let pushError=null;try{await window.kcPush.send(d.get('title'),d.get('body'),d.get('audience'));}catch(error){pushError=error;console.warn('Announcement saved; push delivery failed:',error);}await refresh();notice(a.message||'Announcement published.');if(pushError)notice('Announcement published, but its push notification failed.');}}finally{if(submit){submit.disabled=false;submit.textContent=isCustom?'Send notification ↗':'Publish update →';}}});}else if(f.id==='verifyForm'||f.id==='attendanceOtpForm'){e.preventDefault();const d=new FormData(f),eventId=String(d.get('eventId')||''),memberEmail=String(d.get('memberEmail')||'').trim(),code=String(d.get('code')||'').trim();if(!eventId||!memberEmail||!/^\d{6}$/.test(code)){notice('Select an event, select a registered member and enter the six-digit OTP.');return;}const button=f.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='Verifying…';}try{const result=await api('verify','POST',{eventId,memberEmail,code});S.rosterEvent=eventId;S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));const member=(S.roster?.roster||[]).find(m=>String(m.email).toLowerCase()===memberEmail.toLowerCase());const event=S.events.find(e=>String(e.id)===String(eventId));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:eventId}).then(x=>x.error?[]:x.data||[]);paint();showAttendanceSuccess(member?.name||memberEmail,event?.title||'Kinetic Crew event',event?.starts_at,result.message||'OTP verified. Attendance marked present.');}catch(error){notice(error.message||'OTP verification failed.');}finally{if(button){button.disabled=false;button.innerHTML='Verify & check in <span>→</span>';}}return;}});
document.addEventListener('change',async e=>{
 if(e.target.id==='profileHistoryMemberSelect'){
  S.historyTargetId=String(e.target.value||'');S.profileHistoryData=null;S.profileHistoryUnlocked=false;paint();return;
 }
 if(e.target.matches('select[name="eventId"]')){S.rosterEvent=e.target.value;if(!S.rosterEvent){S.roster=null;paint();return;}await action(async()=>{S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});});}else if(e.target.id==='attendanceReportEventSelect'){S.attendanceReportEvent=e.target.value;paint();}else if(e.target.id==='rosterSelect'){S.rosterEvent=e.target.value;if(!S.rosterEvent){S.roster=null;paint();return;}await action(async()=>{S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});paint();});}else if(e.target.matches('.profile-admin-save')){const row=e.target.closest('[data-profile-row]');await action(async()=>{const {data,error}=await rpc('crew_manage_profile',{p_auth_id:row.dataset.profileRow,p_name:row.querySelector('[name="member_name"]').value,p_bio:row.querySelector('[name="member_bio"]').value});if(error)throw Error(error.message||'Could not update member profile.');notice('Member profile updated.');await refresh();});}else if(e.target.matches('.role-select')){await action(async()=>{let d=await api('role','PATCH',{authId:e.target.dataset.id,role:e.target.value});notice(d.message);await refresh();});}});
$('#app').addEventListener('change',e=>{if(e.target.id==='profilePhotoInput'&&e.target.files?.[0]){const img=$('#profilePhotoPreview');if(img)img.src=URL.createObjectURL(e.target.files[0]);}});$('#logoutProfile')?.addEventListener('click',()=>$('#logout').click());
async function performCrewSignOut(){
 if(!await kcConfirmDialog({title:'Sign out?',message:'Sign out of Kinetic Crew on this device?',confirmText:'Sign out',danger:false}))return;
 try{await auth.signOut();}catch(error){notice(error.message||'Could not sign out. Please try again.');return;}
 S.user=null;S.events=[];S.announcements=[];S.members=[];
 try{sessionStorage.removeItem(PAGE_STATE_KEY);}catch{}
 location.replace(window.kcPath('login.html'));
}
$('#logout').addEventListener('click',performCrewSignOut);
document.addEventListener('click',event=>{if(event.target.closest('[data-kc-signout]'))performCrewSignOut();});

document.addEventListener('click',async event=>{
 const rewardsTab=event.target.closest('[data-kc-rewards-tab]');if(rewardsTab){setKCRewardsAdminTab(rewardsTab.dataset.kcRewardsTab);return;}
 const retry=event.target.closest('[data-kc-connect-retry]');
 if(retry){loadKCConnectDashboard();return;}
 const copy=event.target.closest('[data-kc-connect-copy]');
 const share=event.target.closest('[data-kc-connect-share]');
 const button=copy||share;if(!button)return;
 const url=button.dataset.url||'';if(!url)return;
 try{
  if(share&&navigator.share){await navigator.share({title:'Join Kinetic Crew · KC Connect',text:'Come be part of Kinetic Crew. Use my personal invite link:',url});return;}
  if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(url);
  else{const field=document.createElement('textarea');field.value=url;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();if(!document.execCommand('copy'))throw Error('Copy is not available on this device.');field.remove();}
  notice(copy?'Referral link copied.':'Invite link copied. Share it with your friends.');
 }catch(error){if(error.name!=='AbortError')notice(error.message||'Could not share the referral link.');}
});


function setMobileMenu(open){
 const sidebar=$('#sidebar'),shade=$('#navShade'),toggle=$('#menuToggle');
 if(!sidebar||!shade)return;
 if(open&&$('#nav')&&!$('#nav').children.length&&typeof paint==='function')paint();
 sidebar.classList.toggle('open',!!open);shade.classList.toggle('open',!!open);
 sidebar.setAttribute('aria-hidden',open?'false':'true');
 if(toggle){toggle.setAttribute('aria-expanded',open?'true':'false');toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');}
 document.body.classList.toggle('kc-menu-open',!!open);
}
document.addEventListener('click',event=>{
 const toggle=event.target.closest('#menuToggle');if(!toggle)return;
 event.preventDefault();event.stopPropagation();
 // Use the approved More-page menu on every screen size; never open the legacy drawer.
 setMobileMenu(false);
 if(S.view!=='more')go('more');
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 if($('#sidebar')?.classList.contains('open')){event.preventDefault();setMobileMenu(false);$('#menuToggle')?.focus({preventScroll:true});}
});
$('#nav')?.addEventListener('click',event=>{
 if(event.target.closest('[data-view], [data-audition-admin]'))setMobileMenu(false);
});
document.addEventListener('click',event=>{
 if(event.target.closest('[data-view], [data-audition-admin]')&&!event.target.closest('#nav'))setMobileMenu(false);
});
let kcBackExitAt=0;window.addEventListener('popstate',event=>{if($('#sidebar')?.classList.contains('open'))setMobileMenu(false);const state=event.state;if(state?.kcApp&&typeof state.kcView==='string'){kcBackExitAt=0;go(state.kcView,{fromPop:true});return;}const now=Date.now();if(kcBackExitAt&&now-kcBackExitAt<=1800){const nativeApp=window.Capacitor?.Plugins?.App;if(nativeApp?.exitApp){nativeApp.exitApp();return;}kcBackExitAt=0;return;}kcBackExitAt=now;try{history.pushState({kcApp:true,kcView:S.view,kcRoot:true},'',location.href);}catch{}notice('Press back again to exit Kinetic Crew.');});
$('#nav')?.addEventListener('click',event=>{if(event.target.closest('[data-view], [data-audition-admin]'))setMobileMenu(false);});

document.addEventListener('kc:navigate',event=>{const view=event.detail?.view;if(view)go(view);});
document.addEventListener('click',event=>{const headerAction=event.target.closest('.kc-header-actions [data-view],.kc-header-brand[data-view]');if(!headerAction)return;event.preventDefault();go(headerAction.dataset.view);});
$('#navShade')?.addEventListener('click',()=>setMobileMenu(false));
async function showCrewIntro(force){
 const id=String(S.user?.auth_id||S.user?.id||'guest'),key='kc-intro-seen:'+id;
 if(!force){
   try{const state=await rpc('crew_intro_should_show',{});if(state.error)throw state.error;if(state.data!==true){try{localStorage.setItem(key,'yes');}catch{}return;}}
   catch(error){try{if(localStorage.getItem(key)==='yes')return;}catch{}console.warn('One-time intro status could not be checked:',error);}
 }
 if(document.getElementById('kcIntro'))return;
 const overlay=document.createElement('section');overlay.id='kcIntro';overlay.className='kc-intro';
 overlay.innerHTML='<div class="kc-intro-grain"></div><div class="kc-intro-orbit"></div><div class="kc-intro-content"><img src="'+window.kcPath('kinetic-crew-logo.svg')+'" alt="Kinetic Crew" class="kc-intro-logo"><span class="kc-intro-overline">A CREW IS MORE THAN A NAME</span><h1>MOVE AS ONE.<br><em>MAKE IT KINETIC.</em></h1><p>Different styles. One rhythm. One crew.</p><button type="button" id="kcIntroEnter">ENTER THE CREW ↗</button><button type="button" id="kcIntroSkip">Skip intro</button></div>';
 document.body.appendChild(overlay);
 const finish=async play=>{
   if(play&&S.appSettings?.intro_audio_url&&notificationPrefs().sound){try{const audio=new Audio(S.appSettings.intro_audio_url);audio.volume=.65;await audio.play();}catch(error){console.info('Intro soundtrack requires browser playback permission.',error);}}
   try{const marked=await rpc('crew_intro_mark_seen',{});if(marked.error)throw marked.error;localStorage.setItem(key,'yes');}catch(error){try{localStorage.setItem(key,'yes');}catch{}console.warn('Could not persist intro completion:',error);}
   overlay.classList.add('leaving');setTimeout(()=>overlay.remove(),650);
 };
 overlay.querySelector('#kcIntroEnter').addEventListener('click',()=>finish(true));
 overlay.querySelector('#kcIntroSkip').addEventListener('click',()=>finish(false));
}
async function checkPendingApprovalAlerts(){
 if(!superadmin()||S.offline||!client)return;
 try{
  const {data,error}=await rpc('crew_pending_members',{});
  if(error)throw error;
  const pending=Array.isArray(data)?data:[];
  const ids=pending.map(item=>String(item.auth_id));
  const key='kc-pending-alert-seen:'+String(S.user?.auth_id||S.user?.id||'');
  let previous=[];
  try{previous=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
  if(!Array.isArray(previous)){sessionStorage.setItem(key,JSON.stringify(ids));S.pendingAlertIds=ids;S.pendingMembers=pending;return;}
  const fresh=pending.filter(item=>!previous.includes(String(item.auth_id)));
  sessionStorage.setItem(key,JSON.stringify(ids));
  S.pendingAlertIds=ids;
  S.pendingMembers=pending;
  if(fresh.length){
   const body=fresh.length===1
    ? (fresh[0].name||'A new member')+' requested to join Kinetic Crew. Review the request.'
    : fresh.length+' new members requested to join Kinetic Crew. Review the requests.';
   notice(fresh.length===1?'A new membership request is waiting for review.':fresh.length+' new membership requests are waiting for review.');
   if(['overview','crew-management','member-requests'].includes(S.view))paint();
  }
 }catch(error){console.warn('Pending approval alert check failed:',error.message||error);}
}
function startPendingApprovalAlerts(){
 if(S.pendingAlertTimer)clearInterval(S.pendingAlertTimer);
 if(!superadmin())return;
 checkPendingApprovalAlerts();
 S.pendingAlertTimer=setInterval(checkPendingApprovalAlerts,20000);
}
function setupCrewPushForSignedInMember(){
 if(!S.user||S.offline||!window.kcPush)return;
 const userId=String(S.user.auth_id||S.user.id||'guest');
 const enabledKey='kc-push-enabled:'+userId;
 const isNative=!!window.Capacitor?.isNativePlatform?.();
 const supported=isNative||(('Notification'in window)&&('serviceWorker'in navigator)&&window.isSecureContext);
 if(!supported)return;
 if(document.getElementById('kcPushOptin'))return;
 const markEnabled=()=>{localStorage.setItem(enabledKey,'yes');saveNotificationPrefs({push:true});};
 // A granted browser permission still needs a fresh token registration for this account/device.
 if(!isNative&&Notification.permission==='granted'){
  window.kcPush.syncExistingPermission?.().then(markEnabled).catch(error=>console.warn('Push subscription refresh failed:',error));
  return;
 }
 if(isNative&&localStorage.getItem(enabledKey)==='yes'){
  window.kcPush.syncExistingPermission?.().then(result=>{
   if(result?.skipped){localStorage.removeItem(enabledKey);setupCrewPushForSignedInMember();}
   else markEnabled();
  }).catch(error=>console.warn('Native push registration refresh failed:',error));
  return;
 }
 if(!isNative&&localStorage.getItem(enabledKey)==='yes'&&Notification.permission==='granted')return;
 const panel=document.createElement('section');
 panel.id='kcPushOptin';
 panel.setAttribute('role','dialog');
 panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','Enable Kinetic Crew notifications');
 const pushDescription=superadmin()?'Receive member approval requests and important crew alerts, even when the app is closed.':'Receive important announcements, event changes and crew updates, even when the app is closed.';
 panel.innerHTML='<div class="kc-push-optin-card"><span class="kc-push-optin-icon" aria-hidden="true">KC</span><div class="kc-push-optin-eyebrow">ONE-TIME SETUP</div><h2>Enable crew notifications</h2><p>'+esc(pushDescription)+'</p><div class="kc-push-optin-help" id="kcPushOptinHelp" aria-live="polite">Turn on notifications to complete your Kinetic Crew setup.</div><button type="button" class="kc-push-optin-enable" id="kcPushOptinEnable">Enable notifications</button></div>';
 const style=document.createElement('style');
 style.id='kcPushOptinStyle';
 style.textContent=`
 #kcPushOptin{position:fixed;inset:0;z-index:20000;display:grid;place-items:center;box-sizing:border-box;padding:24px 18px calc(24px + env(safe-area-inset-bottom,0px));background:rgba(5,6,12,.82);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);font:inherit}
 #kcPushOptin .kc-push-optin-card{width:min(100%,440px);box-sizing:border-box;padding:28px 22px 22px;border:1px solid rgba(255,255,255,.16);border-radius:28px;background:linear-gradient(145deg,rgba(36,35,48,.98),rgba(15,17,27,.99));color:#fff;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.1)}
 #kcPushOptin .kc-push-optin-icon{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 16px;border:1px solid rgba(255,255,255,.2);border-radius:20px;background:linear-gradient(145deg,rgba(255,150,120,.25),rgba(190,115,255,.25),rgba(110,145,255,.24));font-weight:900;letter-spacing:-1px}
 #kcPushOptin .kc-push-optin-eyebrow{color:#d7b9ff;font-size:10px;font-weight:800;letter-spacing:2px}
 #kcPushOptin h2{margin:9px 0 8px;font-size:23px;line-height:1.15;letter-spacing:-.6px}
 #kcPushOptin p{margin:0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.55}
 #kcPushOptin .kc-push-optin-help{margin:18px 0 14px;padding:11px 12px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.055);color:rgba(255,255,255,.72);font-size:12px;line-height:1.45}
 #kcPushOptin .kc-push-optin-enable{width:100%;min-height:50px;border:0;border-radius:15px;background:linear-gradient(110deg,#f3d2ff,#d9c2ff,#b9d2ff);color:#171421;font:inherit;font-size:14px;font-weight:850;cursor:pointer}
 #kcPushOptin .kc-push-optin-enable:disabled{opacity:.65;cursor:wait}
 @media(max-height:520px){#kcPushOptin{overflow:auto;align-items:start}#kcPushOptin .kc-push-optin-card{margin:auto;padding:18px}#kcPushOptin .kc-push-optin-icon{width:42px;height:42px;margin-bottom:8px}}
 `;
 document.head.appendChild(style);document.body.appendChild(panel);
 const button=panel.querySelector('#kcPushOptinEnable'),help=panel.querySelector('#kcPushOptinHelp');
 button.addEventListener('click',async()=>{
  button.disabled=true;button.textContent='Enabling…';
  help.textContent='Requesting permission and registering this device…';
  try{
   const result=await window.kcPush.enable();
   markEnabled();
   panel.remove();style.remove();
   notice(result.message||'Notifications are enabled on this device.');
  }catch(error){
   button.disabled=false;button.textContent='Try again';
   const denied=!isNative&&('Notification'in window)&&Notification.permission==='denied';
   help.textContent=denied?'Notifications are blocked by your browser. Open your browser site settings, allow notifications for Kinetic Crew, return here and tap Try again.':(error.message||'Could not enable notifications. Check your connection and try again.');
   if(denied)help.style.color='#ffd0a8';
  }
 });
}
window.addEventListener('kc:push-ready',()=>{if(S.user)setupCrewPushForSignedInMember();});
async function boot(){
 // Keep route-restore state in the boot function scope so every startup path can read it.
 let restoreSavedPage=false;
 const loadingWatch=setTimeout(()=>{
  const el=$('#app');
  if(el&&el.textContent.includes('Opening Kinetic Crew')){
   el.innerHTML='<div class="load-error"><div class="emptyicon">!</div><h2>Still loading your crew</h2><p>The dashboard has not finished loading. Check your connection, then retry.</p><div class="load-actions"><button class="primary" onclick="location.reload()">Reload app</button><button class="outline" id="loadingSignout">Switch account</button></div></div>';
   $('#loadingSignout')?.addEventListener('click',async()=>{try{await auth?.signOut();}finally{location.replace(window.kcPath('login.html'));}});
  }
 },18000);
 try{
  if(!auth){
   $('#app').innerHTML='<div class="load-error"><h2>Sign-in unavailable</h2><p>'+esc(window.KC_CONFIG_ERROR||'Refresh the page and try again.')+'</p><button class="primary" onclick="location.reload()">Retry</button></div>';
   return;
  }
  const result=await withTimeout(auth.getSession(),10000,'Authentication is taking too long. Reload the page or sign in again.');
  if(result?.error){
   const authMessage=String(result.error.message||'');
   if(/invalid refresh token|refresh token not found|session not found/i.test(authMessage)){
    await auth.signOut({scope:'local'}).catch(()=>{});
    location.replace(window.kcPath('login.html?session=expired'));
    return;
   }
   throw result.error;
  }
  const session=result?.data?.session;
  const incomingProfile=new URLSearchParams(location.search).get('kc_profile');
  let pendingProfileId=incomingProfile||localStorage.getItem('kc_pending_profile')||'';
  if(incomingProfile){try{localStorage.setItem('kc_pending_profile',incomingProfile);}catch{}const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('kc_profile');history.replaceState({},'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);}
  if(!session||!session.user){location.replace(window.kcPath('login.html'));return;}
  const membership=await withTimeout(client.rpc('crew_access_status',{}),10000,'Could not verify your Kinetic Crew membership.');
  if(membership.error)throw membership.error;
  if(membership.data?.status==='rejected'&&membership.data?.role==='audition_rejected'){try{localStorage.setItem('kc_audition_notice','rejected');}catch{}await auth.signOut({scope:'local'}).catch(()=>{});location.replace(window.kcPath('login.html?audition=rejected'));return;}
  if(membership.data?.status!=='approved'){location.replace(window.kcPath('pending.html'));return;}
  if(membership.data?.must_change_password){location.replace(window.kcPath('change-password.html?required=1'));return;}
  if(membership.data?.role==='audition_participant'){location.replace(window.kcPath('audition.html'));return;}
  if(S.user&&membership.data?.role)S.user.role=membership.data.role;
  const accessCheck=await withTimeout(client.rpc('crew_assert_not_blocked',{}),10000,'Could not verify your Kinetic Crew account status.');
  if(accessCheck.error){
   if(/blocked|suspended/i.test(accessCheck.error.message||'')){
    await auth.signOut({scope:'local'}).catch(()=>{});
    location.replace(window.kcPath('login.html?blocked=1'));
    return;
   }
   throw accessCheck.error;
  }
  // Start the opt-in immediately after the account is verified, before dashboard data loads.
  S.user={auth_id:session.user.id,id:session.user.id,role:membership.data?.role||'member'};
  kcAccessGuard={userId:session.user.id,checkedAt:Date.now()};
  setupCrewPushForSignedInMember();
  startCrewPresence();
  rpc('crew_profile_login_touch',{}).catch(error=>console.warn('Could not record today’s profile login:',error));
  const saved=readPageState();
  const incomingShare=new URLSearchParams(location.search);
  const navigationType=performance.getEntriesByType?.('navigation')?.[0]?.type||'navigate';
  // Restore the last screen only for a reload inside the same live app session.
  // A cold launch (including a reopened installed PWA) always starts at Home.
  let sameAppSession=false;try{sameAppSession=sessionStorage.getItem('kc_app_session_active_v1')==='1';sessionStorage.setItem('kc_app_session_active_v1','1');}catch{}
  restoreSavedPage=sameAppSession&&(navigationType==='reload'||incomingShare.has('kc_refresh'));
  if(incomingShare.has('share_target')){
   const raw=[incomingShare.get('url'),incomingShare.get('text'),incomingShare.get('title')].filter(Boolean).join(' ');
   const match=raw.match(/https:\/\/[^\s<>"']+/i);
   const sharedUrl=safeSocialUrl(match?.[0]||'');
   if(sharedUrl){S.sharedDraft={url:sharedUrl,caption:incomingShare.get('title')||''};S.view='feed';history.replaceState({},'',location.pathname);}
  }
  if(restoreSavedPage&&!pendingProfileId&&!S.sharedDraft&&saved&&(!saved.userId||saved.userId===(session.user.id||session.user.auth_id))){
   S.view=saved.view||'overview';S.selectedEvent=saved.selectedEvent||null;S.selectedProfileId=saved.selectedProfileId||null;S.navOpen=saved.navOpen||'overview';
  }
  try{history.replaceState({...history.state,kcApp:true,kcView:S.view,kcRoot:true},'',location.href);}catch{}
  try{
   await withTimeout(refresh(),15000,'Crew data is taking too long to load. Please retry.');
  }catch(error){
   if(!restoreOffline(session.user))throw error;
  }
  startKcGramInboxRealtime();
  // Notification deep links are applied after authentication and data refresh so
  // the destination screen can resolve its event/crew data before rendering.
  const notificationParams=new URLSearchParams(location.search);
  const notificationView=notificationParams.get('kc_notification_view');
  const notificationEventId=notificationParams.get('kc_event_id');
  const notificationChatId=notificationParams.get('kc_open_chat');
  if(notificationView){
   const allowedNotificationViews=new Set(['notifications','events','event-detail','rehearsals','chat','gram-chat','feed']);
   const destination=allowedNotificationViews.has(notificationView)?notificationView:'notifications';
   const cleanNotificationUrl=new URL(location.href);
   cleanNotificationUrl.searchParams.delete('kc_notification_view');
   cleanNotificationUrl.searchParams.delete('kc_event_id');
   cleanNotificationUrl.searchParams.delete('kc_open_chat');
   try{history.replaceState({...history.state,kcApp:true},'',cleanNotificationUrl.pathname+cleanNotificationUrl.search+cleanNotificationUrl.hash);}catch{}
   if(destination==='event-detail'&&notificationEventId)S.selectedEvent=notificationEventId;
   if(destination==='gram-chat'&&notificationChatId)window.__kgOpenConversation=notificationChatId;
   await go(destination,{fromPop:true});
  }
  startPendingApprovalAlerts();
  // Re-check access when the app returns to the foreground; a newly blocked account
  // is signed out on this device even if its access token has not expired yet.
  if(!window.__kcBlockWatch){
   window.__kcBlockWatch=setInterval(async()=>{
    if(!S.user||document.hidden||!navigator.onLine)return;
    try{const result=await client.rpc('crew_assert_not_blocked',{});if(result.error&&/blocked|suspended/i.test(result.error.message||'')){kcAccessGuard={userId:'',checkedAt:0};await auth.signOut({scope:'local'});location.replace(window.kcPath('login.html?blocked=1'));}}
    catch(error){console.warn('Crew account status re-check deferred:',error);}
   },60000);
   document.addEventListener('visibilitychange',async()=>{
    if(!document.hidden&&S.user&&navigator.onLine){try{const result=await client.rpc('crew_assert_not_blocked',{});if(result.error&&/blocked|suspended/i.test(result.error.message||'')){kcAccessGuard={userId:'',checkedAt:0};await auth.signOut({scope:'local'});location.replace(window.kcPath('login.html?blocked=1'));}}catch(error){console.warn('Crew access check deferred:',error);}}
   });
  }
  // Render the authenticated shell before optional community queries. A slow feed must
  // never hold the entire app on its launch screen.
  paint();
  setupCrewPushForSignedInMember();
  seedAnnouncementNotifications();
  startCrewNotificationPolling();
  loadSocialFeed().then(()=>{if(S.view==='overview'||S.view==='feed'||S.view==='fun-zone'||S.view==='memes')paint();})
   .catch(error=>console.warn('Home stories unavailable:',error));
  if(restoreSavedPage&&saved&&S.view!=='overview'){
   const target=S.view;
   go(target).catch(error=>{console.warn('Saved page restore failed:',error);S.view='overview';paint();});
  }

  if(pendingProfileId){try{localStorage.removeItem('kc_pending_profile');}catch{}S.selectedProfileId=pendingProfileId;await go('public-profile');}
  else if(restoreSavedPage&&saved&&(!saved.userId||saved.userId===(session.user.id||session.user.auth_id)))restorePageScroll(saved);
  else {S.view='overview';S.selectedEvent=null;S.selectedProfileId=null;S.navOpen='overview';paint();savePageState();}
 }catch(e){
  S.error=e.message||'Could not load your crew.';
  $('#app').innerHTML='<div class="load-error"><div class="emptyicon">!</div><h2>Could not load Kinetic Crew</h2><p>'+esc(S.error)+'</p><div class="load-actions"><button class="primary" id="retryBoot">Try again</button><button class="outline" id="switchAccount">Use another account</button></div></div>';
  $('#retryBoot')?.addEventListener('click',()=>location.reload());
  $('#switchAccount')?.addEventListener('click',async()=>{try{await auth.signOut();}finally{location.replace(window.kcPath('login.html'));}});
 }finally{clearTimeout(loadingWatch);}
}

// Reliable app reload: refresh live data first; offer a hard reload only if startup is unrecoverable.
const reloadButton=$('#reloadApp');
if(reloadButton)reloadButton.addEventListener('click',async()=>{
 const original=reloadButton.innerHTML;reloadButton.disabled=true;reloadButton.textContent='…';
 try{
  if(!navigator.onLine)throw Error('You are offline. Reconnect to refresh live crew data.');
  const result=await withTimeout(auth.getSession(),10000,'Authentication timed out. Please retry.');
  if(!result?.data?.session?.user){location.replace(window.kcPath('login.html'));return;}
  await refresh();notice('Kinetic Crew refreshed.');
 }catch(error){notice(error.message||'Refresh failed.');}
 finally{reloadButton.disabled=false;reloadButton.innerHTML=original;}
});
window.addEventListener('online',()=>{if(S.user){kcAccessGuard={userId:'',checkedAt:0};refresh().then(()=>notice('Connection restored. Crew data refreshed.')).catch(e=>{S.error=e.message||'Could not refresh crew data.';paint();});}});
window.addEventListener('offline',()=>{if(S.user){S.offline=true;S.error='You are offline. Showing the last available crew information.';paint();}});
window.addEventListener('error',event=>{console.error('Kinetic Crew runtime error:',event.error||event.message);});
window.addEventListener('unhandledrejection',event=>{console.error('Kinetic Crew async error:',event.reason);});


/* Open the native file picker from a real user gesture on the edit-photo control. */
document.addEventListener('click',event=>{
 const trigger=event.target.closest('.kc-developer-photo-edit');
 if(!trigger)return;
 if(!superadmin()){event.preventDefault();notice('Only the Super Admin can edit the developer photo.');return;}
 const input=document.getElementById('kcDeveloperPhotoInput');
 if(input)input.value='';
});

/* Developer cover photo: upload and persist the full, uncropped image. */
document.addEventListener('change',async event=>{
 const input=event.target.closest('#kcDeveloperPhotoInput');
 if(!input)return;
 const file=input.files?.[0];
 if(!file)return;
 if(!superadmin()){notice('Only the Super Admin can edit the developer photo.');input.value='';return;}
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)){notice('Choose a JPG, PNG or WebP image.');input.value='';return;}
 if(file.size>5*1024*1024){notice('Photo must be 8 MB or smaller.');input.value='';return;}
 const label=document.querySelector('.kc-developer-photo-edit');
 const oldText=label?.textContent||'✎ Edit photo';
 let uploadedPath='';
 if(label){label.textContent='Uploading…';label.style.pointerEvents='none';}
 try{
  const userId=S.user?.auth_id||S.user?.id;
  if(!userId)throw Error('Your crew session expired. Sign in again.');
  const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';
  uploadedPath=userId+'/developer-cover-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
  const uploaded=await client.storage.from('crew-avatars').upload(uploadedPath,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
  if(uploaded.error)throw uploaded.error;
  const publicUrl=client.storage.from('crew-avatars').getPublicUrl(uploadedPath).data.publicUrl+'?v='+Date.now();
  const saved=await rpc('crew_set_app_setting',{p_key:'developer_photo_url',p_value:publicUrl});
  if(saved.error)throw saved.error;
  S.appSettings={...(S.appSettings||{}),developer_photo_url:publicUrl};
  uploadedPath='';
  notice('Developer photo updated successfully.');
  paint();
 }catch(error){
  if(uploadedPath){try{await client.storage.from('crew-avatars').remove([uploadedPath]);}catch{}}
  notice(error.message||'Could not update the developer photo.');
  if(label){label.textContent=oldText;label.style.pointerEvents='';}
 }finally{input.value='';}
});

let kcEventBannerCrop=null;
function closeEventBannerCrop(resetInput=false){
 const state=kcEventBannerCrop;if(state?.url)URL.revokeObjectURL(state.url);kcEventBannerCrop=null;
 document.querySelector('#kcEventBannerCropModal')?.remove();
 if(resetInput){const input=document.querySelector('#kcEventBannerFile');if(input)input.value='';}
}
function drawEventBannerCrop(){
 const state=kcEventBannerCrop,canvas=document.querySelector('#kcEventBannerCropCanvas');if(!state||!canvas)return;
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,img=state.img,iw0=img.naturalWidth,ih0=img.naturalHeight;
 if(!iw0||!ih0)return;
 const coverScale=Math.max(w/iw0,h/ih0),fitScale=Math.min(w/iw0,h/ih0);
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#111';ctx.fillRect(0,0,w,h);
 // A blurred, darkened cover fills the banner without losing the complete foreground image.
 const bgScale=coverScale*1.16,bgW=iw0*bgScale,bgH=ih0*bgScale;
 ctx.save();ctx.filter='blur(22px)';ctx.globalAlpha=.78;
 ctx.drawImage(img,(w-bgW)/2,(h-bgH)/2,bgW,bgH);ctx.restore();
 ctx.save();ctx.fillStyle='rgba(5,7,12,.28)';ctx.fillRect(0,0,w,h);ctx.restore();
 // Fit the entire uploaded artwork first; zoom and drag remain available for fine positioning.
 const scale=fitScale*(state.zoom||1),iw=iw0*scale,ih=ih0*scale;
 ctx.save();ctx.drawImage(img,(w-iw)/2+(state.x||0),(h-ih)/2+(state.y||0),iw,ih);ctx.restore();
 ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.strokeRect(2,2,w-4,h-4);
}
function openEventBannerCrop(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){notice('Choose a JPG, PNG or WebP image up to 5 MB.');const input=document.querySelector('#kcEventBannerFile');if(input)input.value='';return;}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{
  closeEventBannerCrop();kcEventBannerCrop={img,url,zoom:1,x:0,y:0,drag:null,ratio:1};
  const root=document.createElement('div');root.id='kcEventBannerCropModal';root.className='kc-event-crop-backdrop';
  root.innerHTML='<section class="kc-event-crop-modal" role="dialog" aria-modal="true" aria-labelledby="kcEventCropTitle"><button type="button" class="kc-event-crop-close" data-event-crop-cancel aria-label="Close">×</button><span class="eyebrow">EVENT BANNER STUDIO</span><h2 id="kcEventCropTitle">Adjust your banner</h2><p>Choose a shape, then drag the image and adjust zoom to frame your artwork.</p><div class="kc-event-crop-ratios kc-event-crop-square-only"><span class="kc-crop-shape kc-crop-square"></span><b>Square artwork</b><small>1:1 · Consistent across Kinetic Crew</small></div><canvas id="kcEventBannerCropCanvas" width="900" height="900"></canvas><label class="kc-event-crop-zoom">ZOOM <input id="kcEventBannerCropZoom" type="range" min="1" max="3" step=".01" value="1"></label><div class="kc-event-crop-actions"><button type="button" class="outline" data-event-crop-cancel>Cancel</button><button type="button" class="primary" id="kcEventBannerCropApply">Apply crop</button></div></section>';
  document.querySelector('#modalRoot')?.append(root);
  const canvas=root.querySelector('#kcEventBannerCropCanvas');
  canvas.addEventListener('pointerdown',ev=>{const s=kcEventBannerCrop;if(!s)return;s.drag={x:ev.clientX,y:ev.clientY,ox:s.x,oy:s.y};canvas.setPointerCapture(ev.pointerId);});
  canvas.addEventListener('pointermove',ev=>{const s=kcEventBannerCrop;if(!s?.drag)return;const rect=canvas.getBoundingClientRect();s.x=s.drag.ox+(ev.clientX-s.drag.x)*(canvas.width/rect.width);s.y=s.drag.oy+(ev.clientY-s.drag.y)*(canvas.height/rect.height);drawEventBannerCrop();});
  canvas.addEventListener('pointerup',()=>{if(kcEventBannerCrop)kcEventBannerCrop.drag=null;});canvas.addEventListener('pointercancel',()=>{if(kcEventBannerCrop)kcEventBannerCrop.drag=null;});
  root.querySelector('#kcEventBannerCropZoom').addEventListener('input',ev=>{if(kcEventBannerCrop){kcEventBannerCrop.zoom=Number(ev.target.value);drawEventBannerCrop();}});drawEventBannerCrop();
 };
 img.onerror=()=>{URL.revokeObjectURL(url);notice('This image could not be opened. Try another file.');const input=document.querySelector('#kcEventBannerFile');if(input)input.value='';};img.src=url;
}
async function applyEventBannerCrop(){
 const state=kcEventBannerCrop,input=document.querySelector('#kcEventBannerFile'),preview=document.querySelector('#kcEventBannerPreview'),canvas=document.querySelector('#kcEventBannerCropCanvas');if(!state||!input||!preview||!canvas)return;
 const output=document.createElement('canvas');output.width=1200;output.height=1200;output.getContext('2d').drawImage(canvas,0,0,output.width,output.height);
 const blob=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',.9));if(!blob){notice('Could not process this image. Please try another image.');return;}
 const shape='square';
 const cropped=new File([blob],'event-image-'+shape+'.jpg',{type:'image/jpeg',lastModified:Date.now()});
 try{const transfer=new DataTransfer();transfer.items.add(cropped);input.files=transfer.files;}catch{notice('Your browser cannot prepare the cropped image. Please update Chrome and try again.');return;}
 if(S.eventBannerPreviewUrl)URL.revokeObjectURL(S.eventBannerPreviewUrl);S.eventBannerPreviewUrl=URL.createObjectURL(blob);
 preview.innerHTML='<img src="'+S.eventBannerPreviewUrl+'" alt="Cropped event banner preview"><button type="button" data-event-banner-remove aria-label="Remove banner">Remove</button>';
 closeEventBannerCrop();notice('Banner crop applied. Publish or save the event to upload it.');
}
document.addEventListener('click',event=>{
 const ratioButton=event.target.closest('[data-event-crop-ratio]');
 if(ratioButton){
  const state=kcEventBannerCrop,canvas=document.querySelector('#kcEventBannerCropCanvas');
  if(state&&canvas){
   state.ratio=Number(ratioButton.dataset.eventCropRatio)||3;state.x=0;state.y=0;state.zoom=1;state.drag=null;
   canvas.width=900;canvas.height=900;
   document.querySelectorAll('[data-event-crop-ratio]').forEach(button=>{const active=button===ratioButton;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
   const zoom=document.querySelector('#kcEventBannerCropZoom');if(zoom)zoom.value='1';
   drawEventBannerCrop();
  }
  return;
 }
 if(event.target.closest('[data-event-crop-cancel]')){closeEventBannerCrop(true);return;}
 if(event.target.closest('#kcEventBannerCropApply')){applyEventBannerCrop().catch(error=>notice(error.message||'Could not crop this image.'));return;}
});
document.addEventListener('change',event=>{const input=event.target.closest('#kcEventBannerFile');if(input&&input.files?.[0])openEventBannerCrop(input.files[0]);});
document.addEventListener('click',event=>{
 const remove=event.target.closest('[data-event-banner-remove]');if(!remove)return;
 const form=remove.closest('#eventForm'),preview=form?.querySelector('#kcEventBannerPreview'),input=form?.querySelector('#kcEventBannerFile'),hidden=form?.querySelector('[name="cover_url"]');
 if(input)input.value='';if(hidden)hidden.value='';if(preview)preview.innerHTML='';
 if(S.eventBannerPreviewUrl){URL.revokeObjectURL(S.eventBannerPreviewUrl);S.eventBannerPreviewUrl='';}
});


window.addEventListener('kc:app-version-updated',()=>{if(S.view==='app-info')paint();});
window.addEventListener('kc:release-feed-updated',()=>{if(S.view==='app-info')paint();});
document.addEventListener('click',async event=>{
 const retry=event.target.closest('[data-kc-connect-retry],[data-kc-rewards-admin-retry]');
 if(retry){if(retry.hasAttribute('data-kc-rewards-admin-retry'))loadKCRewardsAdmin();else loadKCConnectDashboard();return;}
 const share=event.target.closest('[data-kc-connect-share]'),copy=event.target.closest('[data-kc-connect-copy]');
 if(share||copy){const url=(share||copy).dataset.url||'';if(!url)return;try{if(share&&navigator.share){await navigator.share({title:'Join Kinetic Crew · KC Connect',text:'Come be part of Kinetic Crew. Use my personal invite link:',url});return;}if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);}else{const field=document.createElement('textarea');field.value=url;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();if(!document.execCommand('copy'))throw Error('Copy is unavailable on this device.');field.remove();}notice('Referral link copied.');}catch(error){if(error.name!=='AbortError')notice('Could not share the referral link.');}return;}
 const voucher=event.target.closest('[data-kc-copy-voucher]');if(voucher){try{await navigator.clipboard.writeText(voucher.dataset.kcCopyVoucher);notice('Voucher code copied.');}catch{notice('Could not copy voucher code.');}return;}
 const redeem=event.target.closest('[data-kc-redeem]');if(redeem){const id=redeem.dataset.kcRedeem,details=document.querySelector('[data-kc-delivery="'+id+'"]')?.value||'';redeem.disabled=true;try{const result=await rpc('crew_reward_request_redemption',{p_reward_id:id,p_delivery_details:details});if(result.error)throw result.error;notice('Redemption request sent. Points are deducted after Super Admin approval.');await loadKCConnectDashboard();}catch(error){notice(error.message||'Could not request this reward.');redeem.disabled=false;}return;}
 const edit=event.target.closest('[data-kc-reward-edit]');if(edit){setKCRewardsAdminTab('create');const result=await rpc('crew_rewards_admin_get',{});if(result.error){notice(result.error.message);return;}const item=(result.data.catalog||[]).find(x=>x.id===edit.dataset.kcRewardEdit);if(!item)return;document.getElementById('kcRewardEditId').value=item.id;document.getElementById('kcRewardTitle').value=item.title;document.getElementById('kcRewardDescription').value=item.description||'';document.getElementById('kcRewardType').value=item.reward_type;document.getElementById('kcRewardPoints').value=item.points_cost;document.getElementById('kcRewardQuantity').value=item.reward_type==='voucher'?(item.available_vouchers||0):item.quantity_available;document.getElementById('kcRewardVouchers').value=Array.isArray(item.available_voucher_codes)?item.available_voucher_codes.join('\n'):'';document.getElementById('kcRewardQuantityWrap').hidden=item.reward_type==='voucher';document.getElementById('kcRewardVouchersWrap').hidden=item.reward_type!=='voucher';document.getElementById('kcRewardImage').value=item.image_url||'';document.getElementById('kcRewardImageFile').value='';setKCRewardImagePreview(item.image_url||'');document.getElementById('kcRewardActive').checked=!!item.is_active;document.getElementById('kcRewardForm').scrollIntoView({behavior:'smooth',block:'start'});return;}
 const reset=event.target.closest('[data-kc-reward-reset]');if(reset){document.getElementById('kcRewardForm')?.reset();document.getElementById('kcRewardEditId').value='';setKCRewardImagePreview('');syncKCRewardInventoryFields();return;}
 const action=event.target.closest('[data-kc-redemption-action]');if(action){const row=action.closest('[data-kc-redemption-row]'),note=row?.querySelector('textarea[data-kc-admin-note]')?.value||'';action.disabled=true;try{const result=await rpc('crew_reward_review_redemption',{p_redemption_id:action.dataset.id,p_decision:action.dataset.kcRedemptionAction,p_admin_note:note});if(result.error)throw result.error;notice('Redemption updated successfully.');await loadKCRewardsAdmin();setKCRewardsAdminTab('requests');}catch(error){notice(error.message||'Could not update redemption.');action.disabled=false;}return;}
});
let kcRewardPreviewObjectUrl='';
function setKCRewardImagePreview(url){
 const wrap=document.getElementById('kcRewardImagePreviewWrap'),img=document.getElementById('kcRewardImagePreview');if(!wrap||!img)return;
 if(kcRewardPreviewObjectUrl){URL.revokeObjectURL(kcRewardPreviewObjectUrl);kcRewardPreviewObjectUrl='';}
 if(url){img.src=url;wrap.hidden=false;}else{img.removeAttribute('src');wrap.hidden=true;}
}
async function uploadKCRewardImage(file){
 if(!file)return '';
 const allowed=['image/jpeg','image/png','image/webp','image/gif'];
 if(!allowed.includes(file.type))throw Error('Choose a JPG, PNG, WebP or GIF image.');
 if(file.size>5*1024*1024)throw Error('Reward images must be 5 MB or smaller.');
 if(!client?.storage)throw Error('Supabase Storage is unavailable. Please sign in again.');
 const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
 const path='rewards/'+Date.now()+'-'+Math.random().toString(36).slice(2,10)+'.'+ext;
 const storage=client.storage.from('kc-more-ads');
 const uploaded=await storage.upload(path,file,{cacheControl:'31536000',upsert:false,contentType:file.type});
 if(uploaded.error)throw uploaded.error;
 const publicUrl=storage.getPublicUrl(uploaded.data.path).data?.publicUrl;
 if(!publicUrl)throw Error('The reward image uploaded, but its public URL could not be created.');
 return publicUrl;
}
function validateKCRewardImage(url){
 return new Promise((resolve,reject)=>{
  if(!url||!/^https:\/\//i.test(url)){reject(Error('Add a reward image. Upload a file or provide a direct HTTPS image URL.'));return;}
  const probe=new Image();const timer=setTimeout(()=>{probe.src='';reject(Error('The reward image took too long to load. Upload the image file instead.'));},12000);
  probe.onload=()=>{clearTimeout(timer);if(probe.naturalWidth>0)resolve(url);else reject(Error('This URL does not point to a valid image.'));};
  probe.onerror=()=>{clearTimeout(timer);reject(Error('This image URL cannot be loaded. Upload the image file instead of using a product-page link.'));};
  probe.src=url;
 });
}
function syncKCRewardInventoryFields(){const voucher=document.getElementById('kcRewardType')?.value==='voucher',qty=document.getElementById('kcRewardQuantityWrap'),codes=document.getElementById('kcRewardVouchersWrap');if(qty)qty.hidden=voucher;if(codes)codes.hidden=!voucher;}
document.addEventListener('change',event=>{
 if(event.target.id==='kcRewardType')syncKCRewardInventoryFields();
 if(event.target.id==='kcRewardImageFile'){
  const file=event.target.files?.[0];if(!file){setKCRewardImagePreview(document.getElementById('kcRewardImage')?.value||'');return;}
  if(kcRewardPreviewObjectUrl)URL.revokeObjectURL(kcRewardPreviewObjectUrl);
  kcRewardPreviewObjectUrl=URL.createObjectURL(file);
  const img=document.getElementById('kcRewardImagePreview'),wrap=document.getElementById('kcRewardImagePreviewWrap');
  if(img){img.src=kcRewardPreviewObjectUrl;wrap.hidden=false;}
 }
 if(event.target.id==='kcRewardImage'&&!document.getElementById('kcRewardImageFile')?.files?.length)setKCRewardImagePreview(event.target.value.trim());
});
document.addEventListener('submit',async event=>{
 if(event.target.id==='kcRewardForm'){event.preventDefault();const button=event.target.querySelector('[type="submit"]');button.disabled=true;try{const vouchers=document.getElementById('kcRewardVouchers').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const selectedImage=document.getElementById('kcRewardImageFile').files?.[0];let imageUrl=document.getElementById('kcRewardImage').value.trim();if(selectedImage){button.textContent='Uploading image…';imageUrl=await uploadKCRewardImage(selectedImage);document.getElementById('kcRewardImage').value=imageUrl;}await validateKCRewardImage(imageUrl);button.textContent='Saving reward…';const result=await rpc('crew_rewards_admin_upsert',{p_reward_id:document.getElementById('kcRewardEditId').value||null,p_title:document.getElementById('kcRewardTitle').value.trim(),p_description:document.getElementById('kcRewardDescription').value.trim(),p_reward_type:String(document.getElementById('kcRewardType').value||'').trim().toLowerCase(),p_points_cost:Number(document.getElementById('kcRewardPoints').value),p_image_url:imageUrl,p_quantity:Number(document.getElementById('kcRewardQuantity').value||0),p_is_active:document.getElementById('kcRewardActive').checked,p_voucher_codes:vouchers});if(result.error)throw result.error;if(!result.data?.ok||!result.data?.reward_id)throw Error(result.data?.message||'The database did not confirm that the reward was saved.');notice('Reward saved and published settings updated.');event.target.reset();document.getElementById('kcRewardEditId').value='';setKCRewardImagePreview('');syncKCRewardInventoryFields();await loadKCRewardsAdmin();setKCRewardsAdminTab('inventory');}catch(error){console.error('KC reward save failed:',error);notice(error.message||'Could not save reward. Check the voucher codes and try again.');}finally{button.disabled=false;button.textContent='Save reward';}return;}
 if(event.target.id==='kcPointsForm'){event.preventDefault();const button=event.target.querySelector('[type="submit"]');button.disabled=true;try{const result=await rpc('crew_reward_points_adjust',{p_user_id:document.getElementById('kcPointsMember').value,p_points_delta:Number(document.getElementById('kcPointsDelta').value),p_reason:document.getElementById('kcPointsReason').value.trim()});if(result.error)throw result.error;notice('Points adjusted. New balance: '+result.data.points_balance);event.target.reset();}catch(error){notice(error.message||'Could not adjust points.');}finally{button.disabled=false;}return;}
});


document.addEventListener('click',event=>{
 const checkUpdates=event.target.closest('[data-kc-check-updates]');
 if(checkUpdates){
  checkUpdates.disabled=true;checkUpdates.textContent='Checking…';
  fetch(window.kcPath('app-version.json')+'?manual_check='+Date.now(),{cache:'no-store',credentials:'same-origin'}).then(async response=>{
   if(!response.ok)throw Error('Update service is unavailable.');
   const data=await response.json(),latest=String(data.version||''),current=String(window.KC_APP_VERSION||'');
   if(!latest)throw Error('No published version information was found.');
   if(latest!==current){kcPendingVersion=latest;kcUpdatePending=true;notice('Kinetic Crew v'+latest+' is available. Updating now…');kcApplyPendingUpdate();}
   else notice('No updates available. Kinetic Crew is up to date.');
  }).catch(error=>notice(error.message||'Could not check for updates.')).finally(()=>{checkUpdates.disabled=false;checkUpdates.textContent='Check for updates';});
  return;
 }
 const edit=event.target.closest('[data-kc-about-edit]');
 if(edit){const form=document.getElementById('kcAboutEditForm');if(form){form.hidden=!form.hidden;edit.hidden=!form.hidden;}return;}
 const cancel=event.target.closest('[data-kc-about-cancel]');
 if(cancel){const form=cancel.closest('#kcAboutEditForm');if(form){form.hidden=true;const trigger=document.querySelector('[data-kc-about-edit]');if(trigger)trigger.hidden=false;}return;}
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('#kcAboutEditForm');if(!form)return;
 event.preventDefault();
 if(!superadmin()){notice('Super Admin access required to publish version updates.');return;}
 const fd=new FormData(form),lines=name=>String(fd.get(name)||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const version=String(fd.get('version')||'').trim();if(!/^[0-9]+[.][0-9]+[.][0-9]+([+-][A-Za-z0-9.-]+)?$/.test(version)){notice('Enter a valid version number, for example 1.7.02.');return;}const details={version,title:String(fd.get('title')||'').trim(),summary:String(fd.get('summary')||'').trim(),features:lines('features'),fixes:lines('fixes')};
 const button=form.querySelector('[type="submit"]'),status=form.querySelector('.kc-about-edit-status');
 button.disabled=true;button.textContent='Saving…';if(status)status.textContent='Saving update details…';
 try{
  const result=await rpc('crew_app_info_save',{p_details:details});if(result.error)throw result.error;
  S.aboutData=S.aboutData||{releases:[]};S.aboutData.update_details=details;S.aboutDataLoaded=true;
  notice('About page update details saved.');paint();
 }catch(error){if(status)status.textContent=error.message||'Could not save update details.';notice(error.message||'Could not save update details.');}
 finally{button.disabled=false;button.textContent='Save update';}
});

boot().finally(()=>{});
})();