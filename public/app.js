(() => {
'use strict';
const client=window.kcSupabase, auth=client&&client.auth, $=s=>document.querySelector(s);
window.KC_APP_VERSION='1.3.3';
const S={user:null,view:'overview',navOpen:'overview',selectedEvent:null,events:[],announcements:[],members:[],publicMembers:[],featureItems:{},socialPosts:[],socialLikes:[],socialComments:[],profileDashboard:null,profileTab:'uploads',roster:null,rosterEvent:'',attendanceAudit:[],attendanceQuery:'',error:'',peopleQuery:'',eventsFilter:'all',eventQuery:'',editingEventId:null,sharedDraft:null};
window.KC_SEARCH_API={
 snapshot:()=>({events:S.events||[],announcements:S.announcements||[],members:S.publicMembers||[],posts:S.socialPosts||[]}),
 load:async()=>{const jobs=[];if(!S.publicMembers?.length)jobs.push(rpc('crew_profile_directory',{}).then(({data,error})=>{if(error)throw error;S.publicMembers=Array.isArray(data)?data:[];}));if(!S.socialPosts?.length)jobs.push(loadSocialFeed());await Promise.all(jobs);},
 openEvent:id=>{S.selectedEvent=id;go('event-detail');},
 openProfile:id=>{S.selectedProfileId=id;go('public-profile');},
 openPost:id=>{go('feed').then(()=>requestAnimationFrame(()=>document.querySelector('[data-social-post="'+CSS.escape(String(id))+'"]')?.scrollIntoView({behavior:'smooth',block:'center'})));},
 openView:view=>go(view),
 scanQr:async raw=>{const value=String(raw||'').trim();if(value.startsWith('KC_EVENT_ATTENDANCE:')){const parts=value.split(':'),eventId=parts[1],memberEmail=parts.slice(2).join(':');if(!eventId||!memberEmail)throw Error('This event QR code is incomplete.');if(admin()){const result=await api('qr-attendance','POST',{eventId,memberEmail});if(String(S.rosterEvent)===String(eventId))S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));notice(result.message||'Attendance marked from QR code.');return;}const found=S.events.find(x=>String(x.id)===String(eventId));if(found){S.selectedEvent=eventId;go('event-detail');return;}throw Error('This QR code belongs to an event that is not in your list.');}let url;try{url=new URL(value);}catch{throw Error('QR detected, but it is not a supported Kinetic Crew link.');}if(!['http:','https:'].includes(url.protocol))throw Error('This QR code is not a secure web link.');location.assign(url.href);}
};
if('scrollRestoration'in history)history.scrollRestoration='manual';
const PAGE_STATE_KEY='kinetic-crew-page-state-v1';
function readPageState(){try{const raw=sessionStorage.getItem(PAGE_STATE_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
function savePageState(){if(!S.user)return;try{sessionStorage.setItem(PAGE_STATE_KEY,JSON.stringify({view:S.view,selectedEvent:S.selectedEvent,selectedProfileId:S.selectedProfileId,navOpen:S.navOpen,scrollX:window.scrollX||0,scrollY:window.scrollY||0,userId:S.user.auth_id||S.user.id||''}));}catch{}}
function restorePageScroll(state){if(!state)return;const restore=()=>window.scrollTo({left:Number(state.scrollX)||0,top:Number(state.scrollY)||0,behavior:'auto'});requestAnimationFrame(()=>requestAnimationFrame(restore));setTimeout(restore,180);}
window.addEventListener('scroll',savePageState,{passive:true});
window.addEventListener('pagehide',savePageState);

function withTimeout(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label||'Request timed out. Check your connection and retry.')),ms);})]).finally(()=>clearTimeout(timer));}
async function rpc(name,args){return withTimeout(client.rpc(name,args),12000,'The crew service is taking too long. Check your connection and retry.');}
const role=r=>({super_admin:'Super Admin',admin:'Admin',member:'Member'}[r]||'Member');
const admin=()=>['admin','super_admin'].includes(String(S.user?.role||'')), superadmin=()=>S.user&&S.user.role==='super_admin';
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
 if(action==='profile'&&method==='PATCH'){const extended=await rpc('crew_update_profile',{p_name:payload.name,p_username:payload.username||'',p_bio:payload.bio||'',p_avatar_url:payload.avatar_url||null,p_banner_url:payload.banner_url||null});if(!extended.error)return extended.data;const message=extended.error.message||'';if(/could not find the function|schema cache|PGRST202/i.test(message)){const basic=await rpc('crew_update_profile',{p_name:payload.name});if(basic.error)throw Error(basic.error.message||'Profile update failed.');return {...(basic.data||{}),name:basic.data?.name||payload.name,bio:payload.bio||'',avatar_url:payload.avatar_url||S.user?.avatar_url||null,_profileLimited:true};}throw Error(message||'Profile update failed.');}
 const rpcMap={'qr-attendance':['crew_mark_qr_attendance',{p_event_id:payload.eventId,p_member_email:payload.memberEmail}],'finalize-attendance':['crew_finalize_attendance',{p_event_id:payload.eventId}],'delete-event':['crew_delete_event',{p_event_id:payload.eventId}]};
 if(rpcMap[action]){const {data,error}=await rpc(rpcMap[action][0],rpcMap[action][1]);if(error)throw Error(error.message||'Crew operation failed.');return data;}
 if(action==='attendance'&&method==='GET'){const {data,error}=await rpc('crew_attendance_roster',{p_event_id:payload.eventId});if(error)throw Error(error.message||'Attendance roster failed.');return data;}
 const {data,error}=await rpc('crew_api',{p_action:action,p_method:method,p_payload:payload});
 if(error)throw Error(error.message||error.details||'Crew service request failed.');
 return data;
}
const FEATURE_ALIASES={'leave request':'leave','leave requests':'leave','kc memories':'memories','audition portal':'auditions','polls & voting':'polls','crew chat':'chat','crew expenses':'expenses','crew achievements':'achievements','crew rehearsals':'rehearsals','rehearsal':'rehearsals','practice session':'rehearsals','practice sessions':'rehearsals'};
function normalizeFeatureKey(value,payload){
 const raw=String(value??payload?.feature??'').trim().toLowerCase();
 return FEATURE_ALIASES[raw]||raw.replace(/\s+/g,'_');
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
function notice(text){const t=$('#toast');if(!t){console.warn('Kinetic Crew toast container is missing:',text);return;}t.textContent=String(text??'');t.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.remove('show'),3000);}
function cacheKey(userId){return 'kc-bootstrap-v2:'+userId;}
function paintUser(){if(!S.user)return;const name=$('#profileName'),userRole=$('#profileRole'),avatar=$('#avatar'),topAvatar=$('#topAvatar');if(name)name.textContent=S.user.name||S.user.email||'Crew Member';if(userRole)userRole.textContent=role(S.user.role);if(avatar)avatar.innerHTML=avatarMarkup(S.user);if(topAvatar)topAvatar.innerHTML=avatarMarkup(S.user,'small');}
async function refresh(){
 const results=await Promise.all([api('bootstrap'),rpc('crew_get_app_settings',{}).catch(error=>({error})),rpc('crew_event_metadata',{}).catch(error=>({error,data:[]})),featureApi('list','rehearsals',{}).catch(()=>[]),featureApi('list','chat',{}).catch(()=>[])]);
 const d=results[0],cfg=results[1],meta=Array.isArray(results[2]?.data)?results[2].data:[];
 S.featureItems.rehearsals=Array.isArray(results[3])?results[3]:(results[3]?.data||[]);
 S.featureItems.chat=Array.isArray(results[4])?results[4]:(results[4]?.data||[]);
 const eventMeta=new Map(meta.map(item=>[String(item.id),item]));
 S.user=d.user;S.events=(d.events||[]).map(event=>({...event,...(eventMeta.get(String(event.id))||{})}));S.announcements=d.announcements||[];S.members=d.members||[];
 S.offline=false;S.error='';
 S.appSettings=cfg.error?{}:(cfg.data||{});
 try{const sessionResult=await auth.getSession();const cacheUserId=sessionResult?.data?.session?.user?.id||S.user.auth_id||S.user.id;if(cacheUserId)localStorage.setItem(cacheKey(cacheUserId),JSON.stringify({savedAt:Date.now(),user:S.user,events:S.events,announcements:S.announcements}));}catch{}
 const keepX=window.scrollX||0,keepY=window.scrollY||0;paintUser();paint();requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({left:keepX,top:keepY,behavior:'auto'})));
}
function restoreOffline(user){
 const id=user?.id||user?.auth_id;if(!id)return false;
 try{
  const cached=JSON.parse(localStorage.getItem(cacheKey(id))||'null');
  if(!cached?.user)return false;
  S.user=cached.user;S.events=cached.events||[];S.announcements=cached.announcements||[];S.members=[];
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
document.addEventListener('change',event=>{
 const form=event.target.closest('[data-feature-form="memories"]');
 if(!form||!event.target.matches('input[name="memory_photo"]'))return;
 const preview=form.querySelector('.memory-upload-preview'),file=event.target.files?.[0],drop=form.querySelector('.memory-upload-drop');
 if(preview){if(file){if(preview.dataset.objectUrl)URL.revokeObjectURL(preview.dataset.objectUrl);const url=URL.createObjectURL(file);preview.src=url;preview.dataset.objectUrl=url;preview.hidden=false;}else{preview.removeAttribute('src');preview.hidden=true;}}
 if(drop){const title=drop.querySelector('b');if(title)title.textContent=file?file.name:'Choose photo from device';}
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
function avatarMarkup(user,size='') {const src=user?.avatar_url;return src?'<img class="avatar-photo '+size+'" data-fallback="'+esc(initials(user?.name||user?.email))+'" src="'+esc(src)+'" alt="'+esc(user.name||'Crew member')+'">':'<span class="avatar-fallback '+size+'">'+esc(initials(user?.name||user?.email))+'</span>';}
function profileCover(url){return url?' style="background-image:url(&quot;'+esc(url)+'&quot;)':'';}

function profileCardBackMarkup(user,authId,username){
 const profileId=String(authId||'');
 const handle=String(username||'crew-member').replace(/^@/,'');
 const qrTarget=new URL(window.kcPath('connect.html'),location.origin);
 if(profileId)qrTarget.searchParams.set('id',profileId);
 qrTarget.searchParams.set('u',handle);
 qrTarget.searchParams.set('n',String(user?.name||'Kinetic Crew Member'));
 if(user?.avatar_url)qrTarget.searchParams.set('p',String(user.avatar_url));
 const instagram='https://www.instagram.com/'+encodeURIComponent(handle)+'/';
 const displayId='KC-'+(profileId.replace(/[^a-zA-Z0-9]/g,'').slice(-8)||handle.slice(0,8)).toUpperCase();
 const role=String(user?.role==='super_admin'?'FOUNDER / SUPER ADMIN':user?.profession||user?.designation||user?.occupation||'CREW MEMBER').toUpperCase();
 return '<section class="kc-profile-card-back" aria-label="Kinetic Crew digital profile ticket">'+
 '<div class="kc-ticket-heading"><span>MY PROFILE</span><b>KINETIC CREW</b></div>'+
 '<div class="kc-ticket-stub"><div class="kc-ticket-id-label">MEMBER ID</div><strong>'+esc(displayId)+'</strong><div class="kc-ticket-perforation"><i></i></div>'+
 '<div class="kc-ticket-qr-wrap"><div class="kc-profile-qr" data-profile-qr data-qr-url="'+esc(qrTarget.href)+'" aria-label="QR code to open this Kinetic Crew profile"></div></div></div>'+
 '<div class="kc-ticket-details"><div class="kc-ticket-detail"><strong>'+esc(user?.name||'Kinetic Crew Member')+'</strong><span>NAME</span></div><div class="kc-ticket-detail"><strong>@'+esc(handle)+'</strong><span>USERNAME</span></div><div class="kc-ticket-detail kc-ticket-role"><strong>'+esc(role)+'</strong><span>CREW ROLE</span></div></div>'+
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
 try{const QR=await ensureKcQrLibrary();nodes.forEach(node=>{if(!node.isConnected||node.dataset.qrReady)return;try{node.innerHTML='';new QR(node,{text:node.dataset.qrUrl,width:148,height:148,colorDark:'#17191d',colorLight:'#f4f1e9',correctLevel:QR.CorrectLevel.H});node.dataset.qrReady='yes';}catch(error){node.textContent='QR unavailable';console.warn('Profile QR could not render:',error);}});}
 catch(error){nodes.forEach(node=>{node.dataset.qrReady='';node.textContent='QR temporarily unavailable';});console.warn('Kinetic Crew QR library unavailable:',error);}
}
function profilePage(){
const u=S.user||{},founder=superadmin(),photo=u.avatar_url||'';
const job=u.profession||u.designation||u.occupation||u.job_title||(founder?'Founder & President':'Kinetic Crew Member');
const username=u.username||String(u.email||'crew-member').split('@')[0];
const dash=S.profileDashboard||{},dashboardUploads=Array.isArray(dash.posts)?dash.posts:[],feedUploads=(S.socialPosts||[]).filter(p=>String(p.author_id)===String(u.auth_id||u.id)),uploads=[...new Map([...dashboardUploads,...feedUploads].filter(p=>p&&p.id).map(p=>[String(p.id),p])).values()].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,30),registrations=Array.isArray(dash.registrations)?dash.registrations:[];
const followers=Number(S.profileSocial?.followers_count??dash.followers_count??0),following=Number(S.profileSocial?.following_count??dash.following_count??0);
const streak=Number(dash.login_streak||0),tab=S.profileTab||'uploads';
const firstFlipIntro=(()=>{try{return localStorage.getItem('kc_profile_flip_intro_v1')!=='1';}catch{return false;}})();
const showFlipHint=(()=>{try{return localStorage.getItem('kc_profile_flip_hint_seen_v1')!=='1';}catch{return true;}})();
const editForm='<section class="kc-profile-editor kc-profile-edit-panel" id="profileEditor" hidden><div class="kc-profile-edit-panel-head"><div><span>PROFILE SETTINGS</span><h2>Edit your profile</h2></div><button type="button" class="kc-profile-editor-close" data-profile-editor-close aria-label="Close editor">×</button></div><form id="profileForm" class="kc-profile-form">'+
'<label class="field">Full name<input name="name" maxlength="100" required value="'+esc(u.name||'')+'"></label>'+
'<label class="field">About you<textarea name="bio" maxlength="500" rows="3">'+esc(u.bio||'')+'</textarea></label>'+
'<label class="field">Email address<input value="'+esc(u.email||'')+'" disabled></label>'+
'<label class="field">Username<input name="username" id="profileUsername" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="'+esc(u.username||'')+'" placeholder="your_username" required></label>'+
'<div class="kc-profile-upload-row"><label for="profilePhotoInput">Change profile photo<input id="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>'+
'<p class="hint">JPG, PNG or WebP · Maximum 5 MB.</p><button class="primary full">Save changes</button></form></section>';
const uploadRows=uploads.length?uploads.map(p=>'<article class="kc-profile-activity-row"><div><b>'+esc(p.caption||'Kinetic Gram upload')+'</b><small>'+esc(p.created_at?new Date(p.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'Recently shared')+'</small></div><a href="'+esc(safeSocialUrl(p.link_url)||'#')+'" target="_blank" rel="noopener noreferrer">Open ↗</a></article>').join(''):'<div class="kc-profile-activity-empty"><b>No uploads yet</b><span>Your Kinetic Gram posts and shared reels will appear here.</span><button type="button" data-view="feed">Share your first moment ↗</button></div>';
const registrationRows=registrations.length?registrations.map(r=>'<article class="kc-profile-activity-row"><div><b>'+esc(r.title||'Crew event')+'</b><small>'+esc(r.starts_at?new Date(r.starts_at).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Date to be announced')+' · '+esc(r.location||'Venue TBA')+'</small></div><span class="kc-profile-registration-tag">REGISTERED</span></article>').join(''):'<div class="kc-profile-activity-empty"><b>No event registrations yet</b><span>Events you register for will be listed here.</span><button type="button" data-view="events">Explore events ↗</button></div>';
const activity='<section class="kc-profile-activity" aria-label="Your Kinetic Crew activity">'+
'<div class="kc-profile-metrics"><button type="button" data-profile-connections="followers" data-profile-owner="'+esc(u.auth_id||u.id)+'"><b>'+followers+'</b><span>FOLLOWERS</span></button><button type="button" data-profile-connections="following" data-profile-owner="'+esc(u.auth_id||u.id)+'"><b>'+following+'</b><span>FOLLOWING</span></button><div class="kc-profile-streak-metric"><b>'+streak+' <small>DAY'+(streak===1?'':'S')+'</small></b><span>LOGIN STREAK</span><small class="kc-profile-streak-best">BEST · '+Number(dash.longest_login_streak||0)+' DAYS</small></div></div>'+
'<div class="kc-profile-activity-head"><div><span>YOUR CREW JOURNEY</span><h2>Activity</h2></div><div class="kc-profile-activity-tabs"><button type="button" data-profile-tab="uploads" class="'+(tab==='uploads'?'active':'')+'">Uploads <i>'+Number(dash.posts_count||uploads.length)+'</i></button><button type="button" data-profile-tab="registrations" class="'+(tab==='registrations'?'active':'')+'">Registered <i>'+Number(dash.registered_count||registrations.length)+'</i></button></div></div>'+
'<div class="kc-profile-activity-panel" data-profile-panel="uploads" '+(tab==='uploads'?'':'hidden')+'>'+uploadRows+'</div>'+
'<div class="kc-profile-activity-panel" data-profile-panel="registrations" '+(tab==='registrations'?'':'hidden')+'>'+registrationRows+'</div>'+
'</section>';
return '<div class="kc-reference-profile kc-liquid-profile kc-single-profile '+(founder?'is-founder':'')+'">'+
'<div class="kc-profile-flip-shell '+(firstFlipIntro?'kc-flip-intro':'')+'" data-profile-flip><div class="kc-profile-flip-inner"><section class="kc-liquid-profile-card '+(founder?'kc-founder-card':'')+'">'+
'<div class="kc-liquid-card-top"><button class="kc-profile-back" data-view="overview" aria-label="Back home">‹</button><span class="kc-liquid-wordmark">KINETIC <b>CREW</b></span><div class="kc-profile-hero-right"><button class="kc-profile-scan-button" type="button" data-profile-scan aria-label="Scan QR code">Scan QR</button><button class="kc-profile-share-button" type="button" data-share-profile aria-label="Share profile">↗</button><button class="kc-profile-edit-button" data-profile-edit>Edit</button></div></div>'+
'<div class="kc-liquid-profile-photo">'+(photo?'<img src="'+esc(photo)+'" alt="'+esc(u.name||'Profile photo')+'" loading="eager">':'<span>'+esc(initials(u.name||u.email))+'</span>')+'</div>'+
'<div class="kc-liquid-profile-copy"><span class="kc-liquid-eyebrow">'+(founder?'FOUNDER':'KINETIC CREW MEMBER')+'</span><h1>'+esc(u.name||'Kinetic Crew Member')+'</h1><p>@'+esc(username)+'</p><div class="kc-single-profile-tags"><span>'+esc(String(job).toUpperCase())+'</span>'+(u.profession&&u.designation?'<span>'+esc(String(u.designation).toUpperCase())+'</span>':'')+'</div>'+(u.bio?'<p class="kc-liquid-bio">'+esc(u.bio)+'</p>':'')+'</div>'+
'<div class="kc-liquid-orb kc-liquid-orb-pink"></div><div class="kc-liquid-orb kc-liquid-orb-cyan"></div>'+'</section>'+profileCardBackMarkup(u,u.auth_id||u.id,username)+'</div></div>'+
(showFlipHint?'<div class="kc-profile-flip-hint" data-profile-flip-hint><span class="kc-flip-hint-icon">↻</span><span><b>DOUBLE TAP TO FLIP</b><small>Tap your profile card twice to reveal your member QR</small></span><i class="kc-flip-hint-pulse"></i></div>':'')+
editForm+activity+'</div>';
}
function publicProfilePage(){
 const p=S.profileSocial?.profile;
 if(!p)return empty('Profile unavailable','This crew profile could not be loaded.');
 const self=String(p.auth_id)===String(S.user?.auth_id),founder=p.role==='super_admin';
 const following=Boolean(S.profileSocial?.is_following??S.profileSocial?.following??S.profileSocial?.viewer_follows);
 const photo=p.banner_url||p.cover_url||p.cover_photo_url||'';
 const avatar=p.avatar_url||'';
 const username=p.username||String(p.email||'crew-member').split('@')[0];
 const job=p.profession||p.designation||p.occupation||(founder?'Founder / Super Admin':'Kinetic Crew Member');
 const coverStyle=photo?' style="--kc-visitor-cover:url(&quot;'+esc(safeSocialUrl(photo))+'&quot;)"':'';
 const action=self?'<button class="kc-visitor-action" data-view="profile">Edit profile</button>':'<button type="button" class="kc-visitor-action kc-follow-action" data-follow="'+esc(p.auth_id)+'" data-following="'+(following?'true':'false')+'">'+(following?'Following':'Follow')+'</button>';
 return '<main class="kc-visitor-profile kc-visitor-profile-clean">'+
 '<section class="kc-visitor-hero"'+coverStyle+'><div class="kc-visitor-shade"></div><div class="kc-visitor-top"><button class="kc-visitor-back" data-view="people" aria-label="Back to crew">‹</button><div class="kc-visitor-actions"><button class="kc-visitor-share" type="button" data-share-profile aria-label="Share profile">⌯</button>'+action+'</div></div>'+
 '<div class="kc-visitor-identity">'+(avatar?'<img class="kc-visitor-avatar" src="'+esc(avatar)+'" alt="'+esc(p.name||'Crew member')+'" loading="eager">':'<span class="kc-visitor-avatar kc-visitor-avatar-fallback">'+esc(initials(p.name||p.email))+'</span>')+
 '<h1>'+esc(p.name||'Kinetic Crew Member').toUpperCase()+'</h1><p>@'+esc(username)+'</p><span class="kc-visitor-role">'+esc(job)+'</span></div></section>'+
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
function legacyPeoplePage(){const people=S.publicMembers||[];return welcome('Discover the crew','Find your people, open their profiles and follow their journey.')+'<div class="profile-directory">'+(people.length?people.map(m=>'<article class="surface crew-profile-tile"><button class="crew-profile-open" data-open-profile="'+esc(m.auth_id)+'">'+avatarMarkup(m)+'<span><b>'+esc(m.name)+'</b><small>@'+esc(m.username||'crew-member')+'</small></span></button><p>'+esc(m.bio||'Kinetic Crew member')+'</p><div class="crew-profile-stats"><b>'+Number(m.followers_count||0)+' followers</b><span>'+esc(role(m.role))+'</span></div><button class="outline full" data-open-profile="'+esc(m.auth_id)+'">View profile</button></article>').join(''):empty('No crew profiles yet','Crew members will appear here once they have signed in.'))+'</div>';}
function readKey(){return 'kc-read-notices:'+String(S.user?.id||S.user?.auth_id||'guest');}
function prefsKey(){return 'kc-notification-prefs:'+String(S.user?.auth_id||S.user?.id||'guest');}
function notificationPrefs(){try{return {sound:true,push:localStorage.getItem('kc-push-enabled')==='yes',...JSON.parse(localStorage.getItem(prefsKey())||'{}')}}catch{return {sound:true,push:false}}}
function saveNotificationPrefs(patch){const next={...notificationPrefs(),...patch};localStorage.setItem(prefsKey(),JSON.stringify(next));return next;}
function isRead(id){try{const ids=JSON.parse(localStorage.getItem(readKey())||'[]');if(ids.includes(id))return true;const value=String(id||'');return value.startsWith('announcement:')&&ids.includes(value.slice('announcement:'.length));}catch{return false}}
function markRead(id){const ids=new Set(JSON.parse(localStorage.getItem(readKey())||'[]'));ids.add(id);localStorage.setItem(readKey(),JSON.stringify([...ids]));}
function notificationItems(){
 const announcements=(S.announcements||[]).map(a=>({...a,notice_id:'announcement:'+a.id,notice_type:'announcement',notice_time:a.created_at||a.updated_at}));
 const events=(S.events||[]).map(e=>({...e,notice_id:'event:'+e.id,notice_type:'event',notice_time:e.updated_at||e.created_at||e.starts_at,body:e.description||'A crew event has been added or updated.',author_name:e.author_name||'Kinetic Crew'}));
 const posts=(S.socialPosts||[]).map(p=>{const person=(S.publicMembers||[]).find(m=>String(m.auth_id)===String(p.author_id));return {...p,notice_id:'post:'+p.id,notice_type:'post',notice_time:p.updated_at||p.created_at, title:'New Kinetic Gram post',body:p.caption||'A crew member shared a new post.',author_name:person?.name||'Crew member'};});
 return [...announcements,...events,...posts].filter(x=>x.notice_time).sort((a,b)=>new Date(b.notice_time)-new Date(a.notice_time));
}
function unread(){return notificationItems().filter(a=>!isRead(a.notice_id||a.id)).length}
let kcIslandTimer=null;
function showDynamicIsland(detail={}){
 const title=String(detail.title||'Kinetic Crew').slice(0,90),body=String(detail.body||'You have a new crew update.').slice(0,180),target=String(detail.target||'notifications');
 let island=document.getElementById('kcDynamicIsland');
 if(!island){island=document.createElement('button');island.type='button';island.id='kcDynamicIsland';island.className='kc-dynamic-island';island.setAttribute('aria-live','polite');island.setAttribute('aria-label','New Kinetic Crew notification');island.innerHTML='<span class="kc-island-mark">KC</span><span class="kc-island-copy"><b></b><small></small></span><span class="kc-island-dot"></span>';document.body.appendChild(island);
 island.addEventListener('click',()=>{const view=island.dataset.target||'notifications';island.classList.remove('is-visible');go(view);});
 }
 island.dataset.target=target;
 island.querySelector('.kc-island-copy b').textContent=title;
 island.querySelector('.kc-island-copy small').textContent=body;
 island.classList.remove('is-visible');void island.offsetWidth;island.classList.add('is-visible');
 clearTimeout(kcIslandTimer);kcIslandTimer=setTimeout(()=>island.classList.remove('is-visible'),6500);
}
window.addEventListener('kc:notification',event=>{const detail=event.detail||{};showDynamicIsland(detail);if(notificationPrefs().sound)playNoticeSound();});
let kcKnownAnnouncementIds=null,kcAnnouncementPoll=null;
function seedAnnouncementNotifications(){kcKnownAnnouncementIds=new Set((S.announcements||[]).map(a=>String(a.id)));}
let kcSnapshotBusy=false;
async function syncCrewSnapshot(){
 if(kcSnapshotBusy||!S.user||!navigator.onLine)return;
 kcSnapshotBusy=true;
 try{
  const [snapshot,metaResult,rehearsalRows,postRows]=await Promise.all([
   api('bootstrap'),
   rpc('crew_event_metadata',{}).catch(()=>({data:[]})),
   featureApi('list','rehearsals',{}).catch(()=>S.featureItems.rehearsals||[]),
   Promise.resolve().then(()=>client.from('crew_social_posts').select('*').order('created_at',{ascending:false}).limit(100)).catch(()=>({data:S.socialPosts||[],error:null}))
  ]);
  if(snapshot?.user)S.user={...S.user,...snapshot.user};
  const eventMeta=new Map((Array.isArray(metaResult?.data)?metaResult.data:[]).map(item=>[String(item.id),item]));
  const nextEvents=(snapshot?.events||[]).map(event=>({...event,...(eventMeta.get(String(event.id))||{})})),nextAnnouncements=snapshot?.announcements||[],nextMembers=snapshot?.members||[];
  const rows=Array.isArray(nextAnnouncements)?nextAnnouncements:[];
  const previous=kcKnownAnnouncementIds||new Set((S.announcements||[]).map(a=>String(a.id)));
  const nextPostRows=postRows.error?(S.socialPosts||[]):(postRows.data||[]);
  const previousPostIds=new Set((S.socialPosts||[]).map(p=>String(p.id)));
  const previousAnnouncements=new Map((S.announcements||[]).map(a=>[String(a.id),a]));
  const incomingAnnouncements=rows.filter(a=>{const old=previousAnnouncements.get(String(a.id));return !old||String(old.updated_at||old.created_at||'')!==String(a.updated_at||a.created_at||'')||String(old.title||'')!==String(a.title||'')||String(old.body||'')!==String(a.body||'');});
  const previousEvents=new Map((S.events||[]).map(x=>[String(x.id),x]));
  const incomingEvents=nextEvents.filter(e=>{const old=previousEvents.get(String(e.id));return !old||String(old.updated_at||old.created_at||'')!==String(e.updated_at||e.created_at||'')||['title','description','location','starts_at','category','cover_url'].some(key=>String(old[key]??'')!==String(e[key]??''));});
  const incomingPosts=nextPostRows.filter(p=>!previousPostIds.has(String(p.id)));
  kcKnownAnnouncementIds=new Set(rows.map(a=>String(a.id)));
  const changed=JSON.stringify(S.events)!==JSON.stringify(nextEvents)||JSON.stringify(S.announcements)!==JSON.stringify(rows)||JSON.stringify(S.members)!==JSON.stringify(nextMembers)||JSON.stringify(S.socialPosts)!==JSON.stringify(nextPostRows);
  const nextRehearsals=Array.isArray(rehearsalRows)?rehearsalRows:(rehearsalRows?.data||[]);
  const rehearsalChanged=JSON.stringify(S.featureItems.rehearsals||[])!==JSON.stringify(nextRehearsals);
  S.events=nextEvents;S.announcements=rows;S.members=nextMembers;S.socialPosts=nextPostRows;S.featureItems.rehearsals=nextRehearsals;
  if(changed||rehearsalChanged){paintUser();paint();}
  const fresh=[...incomingAnnouncements.map(a=>({type:'announcement',title:a.title,body:a.body})),...incomingEvents.map(a=>({type:'event',title:a.title,body:a.description||'A new event was added.'})),...incomingPosts.map(a=>({type:'post',title:'New Kinetic Gram post',body:a.caption||'A crew member shared a post.'}))];
  if(fresh.length){
   const latest=fresh[0];
   window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:latest.title||'Kinetic Crew update',body:latest.body||'New crew activity is available.',target:'notifications'}}));
   if(S.view==='notifications'&&!changed)paint();
  }
 }catch(error){console.warn('Background crew sync failed:',error);}
 finally{kcSnapshotBusy=false;}
}
function startCrewNotificationPolling(){
 if(kcAnnouncementPoll)clearInterval(kcAnnouncementPoll);
 kcAnnouncementPoll=setInterval(syncCrewSnapshot,25000);
 if(!window.kcSnapshotVisibilityBound){
  window.kcSnapshotVisibilityBound=true;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCrewSnapshot();});
 }
}

function playNoticeSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),now=ctx.currentTime;[660,880].forEach((hz,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,now+i*.12);gain.gain.exponentialRampToValueAtTime(.11,now+i*.12+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.12+.22);osc.connect(gain);gain.connect(ctx.destination);osc.start(now+i*.12);osc.stop(now+i*.12+.24);});setTimeout(()=>ctx.close(),700);}catch{}}
function notificationCard(a){
 const id=a.notice_id||('announcement:'+a.id),read=isRead(id),type=a.notice_type||'announcement';
 const label=type==='event'?'EVENT UPDATE':type==='post'?'POST':'ANNOUNCEMENT';
 const icon=type==='event'?'▦':type==='post'?'◈':'♧';
 const target=type==='event'?'event-detail':type==='post'?'feed':'updates';
 return '<article class="notification-item '+(read?'read':'unread')+' notice-type-'+type+'" data-notice-id="'+esc(id)+'">'+
 '<span class="notification-icon">'+(read?'✓':icon)+'</span><div class="notification-copy"><div class="announce-meta"><b>'+label+'</b><span>·</span><span>'+esc(dt(a.notice_time||a.created_at))+'</span><span class="notice-state">'+(read?'READ':'NEW')+'</span></div>'+
 '<h3>'+esc(a.title||'Crew update')+'</h3><p>'+esc(a.body||a.description||a.caption||'')+'</p><small>From '+esc(a.author_name||'Kinetic Crew')+'</small>'+
 '<button type="button" class="notice-open-link" data-notice-open="'+esc(id)+'" data-notice-type="'+type+'" data-notice-target="'+esc(a.id)+'">Open '+(type==='event'?'event':type==='post'?'post':'announcement')+' ↗</button></div>'+
 '<button class="notice-read-button" data-read-notice="'+esc(id)+'" aria-label="'+(read?'Already read':'Mark as read')+'" '+(read?'disabled':'')+'>'+(read?'✓':'Mark read')+'</button>'+
 (type==='announcement'&&superadmin()?'<button class="notice-delete-button" data-delete-announcement="'+esc(a.id)+'" aria-label="Delete crew update">×</button>':'')+'</article>';
}
function notificationsPage(){
 const prefs=notificationPrefs(),items=notificationItems(),filter=S.noticeFilter||'all',category=S.noticeCategory||'all',query=(S.noticeQuery||'').trim().toLowerCase();
 const filtered=items.filter(a=>(category==='all'||a.notice_type===category)&&(filter==='all'||(filter==='unread'&&!isRead(a.notice_id)))&&(!query||(String(a.title||'')+' '+String(a.body||'')+' '+String(a.author_name||'')).toLowerCase().includes(query)));
 const countFor=type=>items.filter(a=>(type==='all'||a.notice_type===type)&&!isRead(a.notice_id)).length;
 return welcome('Your notifications','Announcements, event updates and posts — all organised in one inbox.')+
 '<section class="notice-hero"><div class="notice-hero-copy"><span class="notice-kicker">KINETIC CREW / INBOX</span><h2>'+unread()+' <em>new</em> updates</h2><p>Stay close to announcements, events and everything shared by your crew.</p></div><div class="notice-orbit"><span>✳</span><i></i><b></b></div></section>'+
 '<section class="notice-controls"><div class="notice-tabs"><button data-notice-filter="all" class="'+(filter==='all'?'active':'')+'">All <span>'+items.length+'</span></button><button data-notice-filter="unread" class="'+(filter==='unread'?'active':'')+'">Unread <span>'+unread()+'</span></button></div><div class="notice-actions"><input id="noticeSearch" type="search" placeholder="Search notifications…" value="'+esc(S.noticeQuery||'')+'"><button class="outline" id="markAllRead" '+(unread()?'':'disabled')+'>Mark all read</button></div></section>'+
 '<section class="notice-category-tabs" aria-label="Notification categories">'+[['all','All',items.length],['announcement','Announcements',items.filter(a=>a.notice_type==='announcement').length],['event','Event updates',items.filter(a=>a.notice_type==='event').length],['post','Posts',items.filter(a=>a.notice_type==='post').length]].map(([key,label,total])=>'<button type="button" data-notice-category="'+key+'" class="'+(category===key?'active':'')+'">'+label+' <span>'+total+'</span>'+(countFor(key)?'<i>'+countFor(key)+'</i>':'')+'</button>').join('')+'</section>'+
 '<section class="notice-layout"><div class="notice-feed"><div class="notice-feed-head"><div><b>Activity</b><small>'+filtered.length+' updates</small></div><span class="notice-live"><i></i> LIVE CREW FEED</span></div>'+
 (filtered.length?filtered.map(notificationCard).join(''):empty(query?'No matching updates':'You are all caught up',query?'Try a different search.':'New announcements, events and posts will appear here.'))+'</div>'+
 '<aside class="notice-settings"><div class="notice-settings-head"><span>✦</span><div><b>Notification settings</b><small>Make alerts work your way</small></div></div>'+
 '<label class="notice-pref"><span><b>In-app sound</b><small>Play a soft chime for alerts</small></span><input type="checkbox" id="noticeSound" '+(prefs.sound?'checked':'')+'><i></i></label>'+
 '<div class="notice-pref notice-push-pref"><span><b>Device notifications</b><small>Get crew alerts outside the app</small></span><button class="outline" id="enablePush">'+(prefs.push?'Manage':'Enable')+'</button></div>'+
 '<button class="notice-test-sound" id="testNoticeSound">♫ &nbsp; Test notification sound</button>'+
 '<p class="notice-settings-foot">Device permissions are controlled by your browser or Android settings.</p></aside></section>';
}
function loadOptionalScript(src){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.src===src);if(existing){if(existing.dataset.loaded==="yes")return resolve();existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return;}const script=document.createElement("script");script.src=src;script.async=true;script.onload=()=>{script.dataset.loaded="yes";resolve();};script.onerror=reject;document.head.appendChild(script);});} 
async function startQr(){if(!("BarcodeDetector" in window)&&!window.jsQR){try{await loadOptionalScript("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js");}catch{notice("QR scanner could not load. Check your connection and try again.");return;}}if(!navigator.mediaDevices?.getUserMedia){notice('Camera access is unavailable in this browser. Use manual member selection.');return;}try{S.qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});const video=$('#qrVideo');video.srcObject=S.qrStream;$('#qrScanner').hidden=false;await video.play();const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});const detector='BarcodeDetector'in window?new BarcodeDetector({formats:['qr_code']}):null;const scan=async()=>{if(!S.qrStream)return;try{let raw='';if(video.readyState>=2){if(detector){const codes=await detector.detect(video);raw=codes[0]?.rawValue||'';}else if(window.jsQR){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0,canvas.width,canvas.height);raw=window.jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)?.data||'';}else{stopQr();notice('QR scanner library unavailable. Refresh and try again.');return;}}if(raw){const parts=raw.split(':');if(parts.length===3&&parts[0]==='KC_EVENT_ATTENDANCE'&&/^[0-9a-f-]{36}$/i.test(parts[1])&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(parts[2])){const eventId=parts[1],memberEmail=parts[2];stopQr();$('#qrScanner').hidden=true;await action(async()=>{const result=await api('qr-attendance','POST',{eventId,memberEmail});S.rosterEvent=eventId;S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));notice(result.message);});return;}notice('Invalid event QR. Ask the member to open the QR from that event card.');}}catch(err){console.warn('QR scan frame failed',err);}if(S.qrStream)requestAnimationFrame(scan)};requestAnimationFrame(scan)}catch(err){stopQr();notice(err?.name==='NotAllowedError'?'Allow camera access to scan member QR codes.':'Camera unavailable. Use manual member selection.');}}
function stopQr(){if(S.qrStream){S.qrStream.getTracks().forEach(t=>t.stop());S.qrStream=null;}}

function card(e){let act=e.attended?'<span class="pill">✓ Attended</span>':e.registered?'<span class="pill">✓ Registered</span>':'<span class="event-open-hint">View details ↗</span>';return '<article class="event event-clickable" role="button" tabindex="0" data-open-event="'+esc(e.id)+'"><div class="cover"><span class="datechip">'+esc(ds(e.starts_at))+'</span><span class="coversymbol">✳</span><span class="covercode">KC / EVENT '+esc(String(e.id).slice(0,5).toUpperCase())+'</span></div><div class="eventbody"><div class="eventtype"><i></i>'+(new Date(e.starts_at)>new Date()?'UPCOMING EVENT':'CREW EVENT')+'</div><h3>'+esc(e.title)+'</h3><p class="eventdesc">'+esc(e.description||'A moment to connect, create, and move together.')+'</p><div class="eventmeta"><span>◷ &nbsp;'+esc(dt(e.starts_at))+'</span><span>⌖ &nbsp;'+esc(e.location||'Location TBA')+'</span></div><div class="eventbottom"><span class="capacity">'+Number(e.registration_count||0)+' / '+Number(e.capacity||0)+' registered</span>'+act+'</div></div></article>';}

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
function ticketRecipientPicker(eventId){
 const roster=(String(S.rosterEvent||'')===String(eventId)&&Array.isArray(S.roster?.roster))?S.roster.roster:[];
 const source=roster.length?roster:(S.publicMembers||[]);
 const seen=new Set(),members=source.filter(m=>m&&m.email&&String(m.email).includes('@')).filter(m=>{const email=String(m.email).trim().toLowerCase();if(seen.has(email))return false;seen.add(email);return true;});
 return '<details class="memory-recipient-picker kc-ticket-recipient-picker"><summary><span>＋ Choose registered members</span><b class="memory-recipient-count">0 selected</b></summary><div class="memory-recipient-menu"><input type="search" class="memory-member-search" data-ticket-member-search placeholder="Search by name, username or email…" aria-label="Search registered members"><div class="memory-recipient-list">'+(members.map(m=>'<label class="memory-recipient-option" data-member-search="'+esc([m.name,m.username,m.email].filter(Boolean).join(' ').toLowerCase())+'"><input type="radio" name="email" value="'+esc(String(m.email).trim())+'"><span>'+avatarMarkup(m,'small')+'</span><span><b>'+esc(m.name||'Crew member')+'</b><small>'+esc(m.username?'@'+m.username:m.email)+'</small></span><i class="memory-recipient-check">✓</i></label>').join('')||'<p class="hint memory-no-members">No registered member list is available yet. Open Attendance and load this event roster, then return here.</p>')+'</div></div></details>';
}
function eventDetailPage(){
 const e=S.events.find(x=>String(x.id)===String(S.selectedEvent));if(!e)return eventsPage();
 const past=new Date(e.starts_at).getTime()<Date.now(),full=Number(e.capacity||0)>0&&Number(e.registration_count||0)>=Number(e.capacity||0),src=safeSocialUrl(e.cover_url||e.image_url||e.banner_url||e.poster_url||e.image||'');
 const act=e.attended?'<div class="kce-confirmed">✓ Attendance confirmed</div>':e.registered?'<div class="kce-ticket-actions"><button type="button" class="outline" data-otp="'+esc(e.id)+'">Get check-in code</button><button type="button" class="primary" data-event-qr="'+esc(e.id)+'">View QR ticket ↗</button></div>':past?'<div class="kce-confirmed muted">Registration has closed</div>':full?'<div class="kce-confirmed muted">This event is full</div>':'<button type="button" class="kce-register-button" data-register="'+esc(e.id)+'">Reserve my place <span>→</span></button>';
 const heroStyle=src?' style="--kce-event-image:url('+JSON.stringify(src)+')"':'';
 return '<div class="kce-event-detail kce-nightpulse"><button type="button" class="kce-back-events" data-view="events">← <span>Discover events</span></button>'+
 '<section class="kce-detail-hero"'+heroStyle+'><div class="kce-detail-overlay"></div><div class="kce-detail-content"><span class="kce-eyebrow">KINETIC CREW PRESENTS</span>'+eventUpdatedLabel(e)+'<span class="kce-detail-status">'+(e.attended?'ATTENDED':e.registered?'YOUR PASS IS READY':full?'SOLD OUT':past?'COMPLETED':'UPCOMING EXPERIENCE')+'</span><h1>'+editorialTitle(esc(e.title))+'</h1><p>'+esc(e.description||'An unforgettable experience with your Kinetic Crew.')+'</p><div class="kce-detail-meta"><span>◷ '+esc(dt(e.starts_at))+'</span><span>⌖ '+esc(e.location||'Venue to be announced')+'</span></div></div></section>'+
 '<div class="kce-detail-columns"><section class="kce-detail-panel"><span class="kce-eyebrow">THE EXPERIENCE</span><h2>About this event</h2><p>'+esc(e.description||'More details will be shared by the crew.')+'</p><div class="kce-detail-facts"><div><small>DATE & TIME</small><b>'+esc(dt(e.starts_at))+'</b></div><div><small>LOCATION</small><b>'+esc(e.location||'Venue to be announced')+'</b></div><div><small>CREW PARTICIPANTS</small><b>'+Number(e.registration_count||0)+(Number(e.capacity||0)?' / '+Number(e.capacity):' registered')+'</b></div><div><small>YOUR STATUS</small><b>'+(e.attended?'Attended':e.registered?'Ticket reserved':'Not registered')+'</b></div></div></section>'+
 '<aside class="kce-reserve-panel"><span class="kce-eyebrow">YOUR EXPERIENCE</span><h2>'+(e.registered?'You’re on the list.':'Be there.')+'</h2><p>'+(e.registered?'Your event pass is ready. Keep your QR code handy for entry.':'Save your place and join the experience.')+'</p>'+act+'<small>Event registration is securely confirmed by Kinetic Crew.</small></aside></div>'+
 (admin()?'<div class="kce-detail-admin-actions"><button type="button" class="kce-admin-event" data-edit-event="'+esc(e.id)+'">✎ Edit event</button><button type="button" class="outline danger-link" data-delete-event="'+esc(e.id)+'">Delete event</button></div><section class="kc-ticket-mailer kce-admin-mailer"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">ADMIN · SUPER ADMIN</span><h2>Send event tickets by email</h2><p>Send the branded ticket to all registered members or one registered member. You can customize the email before sending.</p></div><span class="kc-attendance-round-icon">✉</span></div><form id="sendEventTicketsForm" class="kc-ticket-mailer-form"><input type="hidden" name="eventId" value="'+esc(e.id)+'"><label><span>Send to</span><select name="recipientMode"><option value="all">All registered members</option><option value="single">One registered member</option></select></label>'+ticketRecipientPicker(e.id)+'<button type="submit" class="kc-attendance-verify-btn">✉ Send event tickets</button><p class="kc-attendance-note">The official ticket, personal QR code, event details and email message are generated automatically.</p></form></section>':'')+'</div>';
}
function announcement(a){return '<article class="announcement"><div class="announceicon">♧</div><div class="announcebody"><div class="announce-meta"><b>CREW SIGNAL</b><span>·</span><span>'+esc(dt(a.created_at))+'</span></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.body)+'</p><div class="author">Posted by <b>'+esc(a.author_name||'Crew Admin')+'</b></div></div>'+(superadmin()?'<button type="button" class="textlink danger-link" data-delete-announcement="'+esc(a.id)+'">Delete</button>':'')+'</article>';}
function formTitle(icon,title,sub){return '<div class="formtitle formtitle-clean"><h3>'+title+'</h3></div>';}
function eventWasUpdated(event){const created=Date.parse(event?.created_at||''),updated=Date.parse(event?.updated_at||'');return Number.isFinite(created)&&Number.isFinite(updated)&&updated-created>1000;}
function eventUpdatedLabel(event){return eventWasUpdated(event)?'<span class="kce-event-updated">UPDATED · '+esc(dt(event.updated_at))+'</span>':'';}
function eventDateInput(value){const d=new Date(value||'');if(Number.isNaN(d.getTime()))return '';const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
function eventForm(event=null){
 const editing=!!event,selected=String(event?.category||'Community');
 const categories=['Auditions','Performances','Workshops','Community','Rehearsals','Other'];
 return '<form id="eventForm" class="surface formgrid"><input type="hidden" name="eventId" value="'+esc(event?.id||'')+'">'+formTitle(editing?'✎':'＋',editing?'Edit event':'Create an event',editing?'Update event details. Members will see the latest version automatically.':'Publish a crew experience with its own poster and ticket details.')+
 '<label class="field">Event name<input name="title" maxlength="120" required placeholder="Reloaded Auditions" value="'+esc(event?.title||'')+'"></label>'+
 '<label class="field">Category<select name="category" required>'+categories.map(x=>'<option value="'+x+'" '+(x===selected?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
 '<label class="field">Location<input name="location" maxlength="160" placeholder="Dance studio / auditorium" value="'+esc(event?.location||'')+'"></label>'+
 '<label class="field">Date & time<input name="starts_at" type="datetime-local" required value="'+eventDateInput(event?.starts_at)+'"></label>'+
 '<label class="field">Capacity<input name="capacity" type="number" min="1" max="10000" value="'+esc(event?.capacity||40)+'" required></label>'+
 '<label class="field span2">Poster image URL<input name="cover_url" type="url" inputmode="url" placeholder="https://… (optional)" value="'+esc(event?.cover_url||'')+'"><small class="hint">Use a publicly accessible HTTPS image URL.</small></label>'+
 '<label class="field span2">Description<textarea name="description" rows="3" maxlength="2500" placeholder="What should members know?">'+esc(event?.description||'')+'</textarea></label>'+
 '<label class="field span2 kce-featured-check"><span><input name="featured" type="checkbox" value="true" '+(event?.featured?'checked':'')+'> Feature this event at the top of Discover</span></label>'+
 '<div class="kce-event-form-actions"><button class="primary full" type="submit">'+(editing?'Save event changes':'＋ Publish event')+'</button>'+(editing?'<button class="outline full" type="button" data-view="event-detail">Cancel</button>':'')+'</div></form>';
}
function updateForm(){return '<form id="updateForm" class="surface publish">'+formTitle('♧','Broadcast a message','Send the crew a clear signal.')+'<label class="field">Headline<input name="title" maxlength="140" required placeholder="What is the update?"></label><label class="field">Message<textarea name="body" rows="5" maxlength="5000" required placeholder="Share the details…"></textarea></label><label class="field">Audience<select name="audience"><option value="all">Everyone</option><option value="member">Members</option><option value="admin">Admins</option><option value="super_admin">Super admins</option></select></label><button class="primary full">Publish update →</button><div class="notice">Announcements appear in Crew HQ. Push notifications when the app is closed require a separate delivery setup.</div></form>';}
function home(){
 const now=Date.now(),all=[...(S.events||[])].filter(e=>e&&e.id&&e.title).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const upcoming=all.filter(e=>new Date(e.starts_at).getTime()>=now);
 const recentPublished=all.filter(e=>new Date(e.starts_at).getTime()<now).reverse();
 const registered=upcoming.filter(e=>e.registered),yourEvents=registered.length?registered:upcoming;
 const homeEvents=[...upcoming,...recentPublished].slice(0,6);
 const homeListEvents=upcoming.length?upcoming.slice(0,3):recentPublished.slice(0,3);
 const people=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(S.user?.auth_id)).slice(0,8);
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
 const slides=[
  ...homeEvents.slice(0,3).map(e=>({kind:'event',view:'events',id:e.id,updated:!!(e.created_at&&e.updated_at&&new Date(e.updated_at).getTime()-new Date(e.created_at).getTime()>5000),kicker:'KINETIC CREW · '+category(e),label:new Date(e.starts_at).getTime()>=now?(e.featured?'FEATURED EVENT':'UPCOMING EVENT'):'RECENT CREW EVENT',title:e.title||'Upcoming crew event',subtitle:[ds(e.starts_at),e.location||'Venue to be announced'].filter(Boolean).join(' · '),cta:e.registered?'View your ticket':'Explore event',image:photo(e)})),
  ...rehearsals.slice(0,3).map(item=>({kind:'rehearsal',view:'rehearsals',id:item.id,kicker:'KINETIC CREW · REHEARSAL',label:'UPCOMING REHEARSAL',title:item.title||'Crew rehearsal',subtitle:[dt(item.data.session_at),item.data.location||'Practice location TBA'].filter(Boolean).join(' · '),cta:'View rehearsal',image:safeSocialUrl(item.data.cover_url||item.data.image_url||'')})),
  ...announcements.slice(0,3).map(a=>({kind:'update',view:'notifications',id:a.id,kicker:'KINETIC CREW · IMPORTANT UPDATE',label:'CREW ANNOUNCEMENT',title:a.title||'A note from your crew',subtitle:a.body||a.message||'An important update from Kinetic Crew',cta:'Read update',image:safeSocialUrl(a.image_url||a.cover_url||a.banner_url||'')}))
 ];
 if(!rehearsals.length)slides.push({kind:'rehearsal',view:'rehearsals',kicker:'KINETIC CREW · PRACTICE SESSIONS',label:'MAKE THE NEXT MOVE',title:'Plan your next practice session',subtitle:'Create a rehearsal, choose a time and share the venue with your crew.',cta:'Open rehearsals',image:''});
 const crewPromo={kind:'promo',view:'more',kicker:'KINETIC CREW · ONE CREW, ONE RHYTHM',label:'ONE CREW · ONE RHYTHM',title:'Kinetic Crew',subtitle:'Events, rehearsals, auditions and every moment that brings the crew together.',cta:'Explore the crew',image:''};
 const contentSlides=slides.splice(0);
 contentSlides.forEach(slide=>{slides.push(slide,{...crewPromo});});
 const updates=announcements.slice(0,3).map((a,i)=>'<button class="kc-exact-update" data-view="notifications"><span class="kc-exact-update-icon">'+(['•','↗','▧'][i%3])+'</span><span><b>'+esc(a.title||'Crew update')+'</b><small>'+esc(a.body||a.message||'A new update from your crew')+'</small></span></button>').join('')||'<div class="kc-exact-update kc-exact-empty">Crew announcements and rehearsal updates will appear here.</div>';
 const slideMarkup=slides.map((slide,i)=>'<article class="kc-home-feature-slide '+(i===0?'is-active':'')+'" data-home-slide="'+i+'" '+(slide.image?'style="--kc-home-feature-image:url(&quot;'+esc(slide.image)+'&quot;)"':'')+'><div class="kc-home-featured-art">'+(slide.kind==='promo'?'<img class="kc-home-featured-brandmark" src="'+window.kcPath('kinetic-crew-logo.svg')+'" alt="Kinetic Crew">':'')+'<span class="kc-home-featured-kicker">'+esc(slide.kicker)+'</span>'+(slide.updated?'<span class="kc-event-updated-chip"><span class="kc-event-updated-fire" aria-hidden="true">🔥</span><span>UPDATED</span></span>':'')+'<span class="kc-home-featured-count">'+String(i+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0')+'</span></div><div class="kc-home-featured-glass"><span class="kc-home-featured-label">'+esc(slide.label)+'</span><b>'+esc(slide.title)+'</b><small>'+esc(slide.subtitle)+'</small><button type="button" '+(slide.kind==='event'?'data-open-event="'+esc(slide.id)+'"':'data-view="'+slide.view+'"')+'>'+esc(slide.cta)+' <i>→</i></button></div></article>').join('');
 return '<div class="kc-exact-home kc-home-reference">'+
 '<header class="kc-home-reference-header"><div class="kc-home-user"><span><small>YOUR KINETIC CREW SPACE</small><b>Welcome back, '+esc(name)+'</b></span></div><button type="button" class="kc-home-theme-toggle" data-theme-toggle aria-label="Switch colour theme" title="Switch colour theme"><span aria-hidden="true">'+(document.documentElement.dataset.theme==='dark'?'☀':'☾')+'</span></button></header>'+
 '<section class="kc-home-greeting"><div class="kc-home-greeting-copy"><h1>'+greeting+', <em>'+esc(name)+'.</em></h1><p class="kc-home-greeting-lead">'+esc(homeMood)+'</p><small class="kc-home-greeting-sub">'+esc(homePrompt)+'</small></div><div class="kc-home-greeting-mark" aria-label="Kinetic Crew logo">'+brandMarkMarkup('kc-home-greeting-logo')+'</div></section>'+
 '<section class="kc-home-featured" aria-label="Featured crew updates"><div class="kc-home-featured-track">'+slideMarkup+'</div>'+(slides.length>1?'<div class="kc-home-featured-dots" aria-label="Featured carousel pages">'+slides.map((_,i)=>'<button type="button" data-home-slide-to="'+i+'" class="'+(i===0?'active':'')+'" aria-label="Show slide '+(i+1)+'"></button>').join('')+'</div>':'')+'</section>'+
 '<section class="kc-home-reference-section kc-home-latest-section"><div class="kc-home-reference-section-head"><h2>Latest from your crew</h2><button type="button" data-view="notifications">See all <span>→</span></button></div><div class="kc-exact-update-row">'+updates+'</div></section>'+
 
  '<section class="kc-fun-people"><div class="kc-fun-section-title"><div><small>YOUR PEOPLE</small><h2>Crew is online</h2></div><button type="button" data-view="people">Discover all ↗</button></div><div class="kc-fun-people-rail">'+(people.length?people.map(p=>'<button type="button" class="kc-fun-person" data-open-profile="'+esc(p.auth_id)+'">'+avatarMarkup(p)+'<b>'+esc((p.name||'Crew').split(' ')[0])+'</b></button>').join(''):'<button type="button" class="kc-fun-person" data-view="people"><span class="kc-fun-person-add">＋</span><b>Find crew</b></button>')+'</div></section>'+
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
'<div class="kc-more-logo-wrap kc-more-intro" aria-label="Kinetic Crew introduction"><div class="kc-more-intro-track">'+
'<div class="kc-more-intro-slide"><span class="kc-intro-index">01 / THE MOVEMENT</span><b class="kc-intro-line">WE ARE <em>KINETIC</em><br>CREW.</b><small>One crew. One rhythm. Endless energy.</small></div>'+
'<div class="kc-more-intro-slide"><span class="kc-intro-index">02 / THE ENERGY</span><b class="kc-intro-line">MOVE WITH<br><em>PURPOSE.</em></b><small>Every beat brings us together.</small></div>'+
'<div class="kc-more-intro-slide"><span class="kc-intro-index">03 / THE CULTURE</span><b class="kc-intro-line">BUILT ON<br><em>RHYTHM.</em></b><small>Driven by passion. United by dance.</small></div>'+
'<div class="kc-more-intro-slide"><span class="kc-intro-index">04 / THE PEOPLE</span><b class="kc-intro-line">ONE CREW.<br><em>INFINITE MOVES.</em></b><small>Different styles. Shared heartbeat.</small></div>'+
'<div class="kc-more-intro-slide"><span class="kc-intro-index">05 / THE CRAFT</span><b class="kc-intro-line">CREATE.<br><em>PERFORM. REPEAT.</em></b><small>Make every moment a performance.</small></div>'+
'<div class="kc-more-intro-slide"><span class="kc-intro-index">06 / THE IDENTITY</span><b class="kc-intro-line">THIS IS<br><em>KINETIC CREW.</em></b><small>Feel the beat. Become the movement.</small></div>'+
'</div><div class="kc-more-intro-progress" aria-hidden="true"><i></i></div></div>'+
'<section class="kc-more-reference-group"><h2>My Crew</h2><div class="kc-more-reference-pills">'+
pill('events','events','Events')+
pill('rehearsals','rehearsal','Rehearsals')+pill('attendance','attendance','Attendance')+
pill('people','people','Crew Members')+
pill('memories','bookmark','Memories')+
'</div></section>'+
'<section class="kc-more-reference-group kc-more-reference-others"><h2>More</h2><div class="kc-more-reference-others-grid">'+
other('updates','announcements','Announcements')+other('notifications','notifications','Notifications')+
other('profile','profile','My Profile')+other('settings','settings','Settings')+
'</div></section>'+
'<button type="button" class="kc-more-signout" data-kc-signout><span>↗</span><b>Sign out</b><small>Sign out of this device</small></button>'+
'<div class="kc-more-reference-footer">Made for <span>✦</span> Kinetic Crew</div>'+
'<div class="kc-more-reference-watermark" aria-hidden="true">KC</div><div class="kc-more-reference-sparkle" aria-hidden="true">✦</div></div>';
}

function eventsPage(){
 const now=Date.now(),all=[...(S.events||[])].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)),upcoming=all.filter(e=>new Date(e.starts_at).getTime()>=now),registered=all.filter(e=>e.registered),past=all.filter(e=>new Date(e.starts_at).getTime()<now).reverse();
 const filter=S.eventsFilter||'all',query=String(S.eventQuery||'').trim().toLowerCase(),base=filter==='tickets'?registered:filter==='past'?past:filter==='all'?upcoming:upcoming.filter(e=>{const category=String(e.category||'').toLowerCase(),words=String((e.category||'')+' '+(e.title||'')+' '+(e.description||'')).toLowerCase();return filter==='auditions'?category==='auditions'||/audition|tryout|selection/.test(words):filter==='performances'?category==='performances'||/performance|showcase|concert|flashmob|stage/.test(words):filter==='workshops'?category==='workshops'||/workshop|class|training|masterclass/.test(words):filter==='rehearsals'?category==='rehearsals'||/rehearsal|practice/.test(words):filter==='other'?category==='other':category==='community'||/community|social|meet|festival|celebrat/.test(words);});
 const pool=base.filter(e=>!query||String((e.title||'')+' '+(e.category||'')+' '+(e.location||'')+' '+(e.description||'')).toLowerCase().includes(query));
 const featured=upcoming.find(e=>e.featured)||upcoming[0],image=e=>safeSocialUrl(e?.cover_url||e?.image_url||e?.banner_url||e?.poster_url||e?.image||'');
 const art=(e,kind='event')=>{const src=image(e),style=src?' style="background-image:linear-gradient(180deg,#090b0b05 20%,#090b0be8 100%),url('+JSON.stringify(src)+')"':'';return '<div class="kce-art kce-art-'+kind+'"'+style+'>'+(kind==='featured'?'':'<span class="kce-art-kicker">'+(e?esc(e.category||'KINETIC CREW'):'KINETIC CREW')+'</span>'+(e?'<b>'+esc(e.title)+'</b><small>'+esc(ds(e.starts_at))+' · '+esc(e.location||'Venue TBA')+'</small>':'<b>Make your next move.</b><small>Discover what’s happening with your crew.</small>'))+'</div>';};
 const cardUI=e=>filter==='tickets'?'<article class="kce-ticket-wallet-card"><button type="button" class="kce-ticket-wallet-main" data-open-event="'+esc(e.id)+'">'+art(e,'ticket')+'<span class="kce-event-meta"><b>'+esc(e.title)+'</b><small>'+esc(dt(e.starts_at))+' · '+esc(e.location||'Location TBA')+'</small><span>✓ Registration confirmed <i>↗</i></span></span></button><button type="button" class="kce-wallet-qr" data-event-qr="'+esc(e.id)+'">View QR ticket <span>↗</span></button></article>':'<button type="button" class="kce-event-card" data-open-event="'+esc(e.id)+'">'+art(e)+'<span class="kce-event-meta"><b>'+esc(e.title)+'</b>'+eventUpdatedLabel(e)+'<small>'+esc(ds(e.starts_at))+' · '+esc(e.location||'Location TBA')+'</small><span>'+(e.registered?'✓ Ticket reserved':Number(e.registration_count||0)+' joined')+' <i>↗</i></span></span></button>';
 const tabs=[['all','Discover'],['auditions','Auditions'],['performances','Performances'],['workshops','Workshops'],['community','Community'],['rehearsals','Rehearsals'],['other','Other'],['tickets','My tickets'],['past','Past']];
 return '<div class="kce-events kce-nightpulse">'+
 '<header class="kce-events-head"><div><span class="kce-eyebrow">KINETIC CREW / LIVE EXPERIENCES</span><h1>Find your <em>next moment.</em></h1><p>Discover what’s happening around your crew.</p></div><div class="kce-events-head-actions">'+(admin()?'<button type="button" class="kce-admin-event" data-view="new-event">＋ Create event</button>':'')+'<button type="button" class="kce-ticket-shortcut" data-event-filter="tickets">▣ My tickets <b>'+registered.length+'</b></button></div></header>'+
 '<label class="kce-event-search"><input id="kceEventSearch" type="search" placeholder="Search concerts, workshops, events..." value="'+esc(S.eventQuery||'')+'" autocomplete="off" aria-label="Search concerts, workshops and events"></label>'+
 (featured&&filter==='all'&&!query?'<button type="button" class="kce-featured-event" data-open-event="'+esc(featured.id)+'">'+art(featured,'featured')+'<span class="kce-featured-info"><i>✦ FEATURED EXPERIENCE</i><b>'+esc(featured.title)+'</b><small>◷ '+esc(dt(featured.starts_at))+'<br>⌖ '+esc(featured.location||'Venue to be announced')+'</small><strong>View event <span>↗</span></strong></span></button>':'')+
 (filter==='all'&&!query?'<div class="kce-category-mosaic kce-event-shortcuts"><button type="button" class="kce-category kce-cat-performances" data-event-filter="performances"><i>♫</i><b>Concerts & Shows</b><small>Live performances</small></button><button type="button" class="kce-category kce-cat-workshops" data-event-filter="workshops"><i>✳</i><b>Workshops</b><small>Learn with the crew</small></button><button type="button" class="kce-category kce-cat-community" data-event-filter="community"><i>♧</i><b>Community</b><small>Meet your people</small></button><button type="button" class="kce-category" data-event-filter="auditions"><i>✦</i><b>Auditions</b><small>Join the movement</small></button></div>':'')+
 '<div class="kce-discover-label"><div><span class="kce-eyebrow">'+(filter==='tickets'?'YOUR WALLET':'CURATED FOR YOU')+'</span><h2>'+(filter==='tickets'?'Your tickets':filter==='past'?'Past experiences':filter==='all'?'Recommended for you':tabs.find(x=>x[0]===filter)?.[1]||'Events')+'</h2></div><span>'+pool.length+' '+(pool.length===1?'EVENT':'EVENTS')+'</span></div>'+
 '<div class="kce-tabs" role="tablist" aria-label="Event filters">'+tabs.map(([key,label])=>'<button type="button" role="tab" aria-selected="'+(filter===key)+'" class="'+(filter===key?'active':'')+'" data-event-filter="'+key+'">'+label+(key==='tickets'&&registered.length?' <small>'+registered.length+'</small>':'')+'</button>').join('')+'</div>'+
 '<div class="kce-events-grid">'+(pool.length?pool.map(cardUI).join(''):'<div class="kce-empty-state"><span>✦</span><b>'+(filter==='tickets'?'Your ticket wallet is waiting':filter==='past'?'No past events yet':query?'No matching events':'No events here yet')+'</b><small>'+(filter==='tickets'?'Register for an event and your ticket will appear here.':query?'Try another event name, category or venue.':'New Kinetic Crew experiences will appear here.')+'</small>'+(filter==='tickets'?'<button type="button" data-event-filter="all">Discover events →</button>':'')+'</div>')+'</div>'+
 (admin()?eventForm():'')+'</div>';
}

function chatPage(){
 const items=(S.featureItems.chat||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
 const messages=items.map(item=>'<article class="wa-message '+(item.author_id===S.user.auth_id?'mine':'theirs')+'"><small>'+esc(item.author_name||'Crew member')+'</small><p>'+esc(item.body||item.title)+'</p><time>'+esc(new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</time></article>').join('');
 return welcome('Crew chat','The crew group chat — quick messages, shared energy, one conversation.')+'<section class="wa-chat-shell"><header class="wa-chat-head"><div class="wa-chat-mark">KC</div><div><b>Kinetic Crew</b><small>'+items.length+' messages · Crew group</small></div><span class="wa-online"><i></i> LIVE</span></header><div class="wa-chat-messages" id="waMessages">'+(messages||'<div class="wa-empty">✳<b>Start the conversation</b><small>Your crew messages will appear here.</small></div>')+'</div><form class="wa-chat-compose" data-feature-form="chat"><input type="hidden" name="title" value="Crew message"><textarea name="body" rows="1" maxlength="5000" required placeholder="Message the crew…"></textarea><button class="wa-send" type="submit" aria-label="Send message">➤</button></form></section>';
}

function socialFeedPage(){
 const posts=S.socialPosts||[],people=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(S.user?.auth_id)).slice(0,18);
 window.__kcGramPosts=posts;window.__kcGramPeople=people;
 const stories='<section class="kc-feed-stories"><div class="kc-feed-stories-head"><b>Stories</b><span>CREW MOMENTS</span></div><div class="kc-feed-story-rail"><button class="kc-feed-story own" data-view="profile"><span class="kc-story-ring"><span class="kc-story-avatar">'+avatarMarkup(S.user)+'</span><i>+</i></span><small>Your story</small></button>'+people.map((p,i)=>'<button class="kc-feed-story" data-open-profile="'+esc(p.auth_id)+'"><span class="kc-story-ring '+(i<5?'fresh':'')+'"><span class="kc-story-avatar">'+avatarMarkup(p)+'</span></span><small>'+esc((p.name||'Crew').split(' ')[0])+'</small></button>').join('')+'</div></section>';
 return '<div class="kc-feed-page"><header class="kc-feed-top"><div><span class="kc-feed-kicker">KINETIC CREW / COMMUNITY</span><h1>Kinetic <em>Gram</em></h1></div></header>'+
 '<div class="kc-feed-tabs"><span class="active">Feed</span><span>Following</span><span>Reels</span></div>'+stories+
 '<form id="socialPostForm" class="surface social-share-composer kc-feed-composer"><div class="kc-feed-compose-avatar">'+avatarMarkup(S.user)+'</div><div class="kc-feed-compose-main"><label class="field"><textarea name="caption" rows="2" maxlength="1200" placeholder="Share a moment with your crew…" aria-label="Caption">'+esc(S.sharedDraft?.caption||'')+'</textarea></label><div class="kc-feed-link-field"><span>↗</span><input name="link_url" type="url" inputmode="url" value="'+esc(S.sharedDraft?.url||'')+'" placeholder="Paste a reel, video or post link" required></div>'+(S.sharedDraft?.url?'<div class="kc-share-draft-preview"><span>LINK PREVIEW · NOT POSTED</span>'+socialEmbed(S.sharedDraft.url)+'<small>The original media stays on its social platform. Kinetic Crew stores only the shared URL and your caption.</small></div>':'')+'<div class="social-composer-foot"><small>Preview first. Nothing is posted until you tap Share.</small><button type="submit" class="primary">Share ↗</button></div></div></form>'+
 '<div class="kc-feed-section-head"><b>For the crew</b><span>'+posts.length+' POSTS</span></div><div class="social-feed-list">'+(posts.map(socialPostCard).join('')||empty('Your crew feed starts here','Share the first reel, performance or moment with everyone.'))+'</div></div>';
}

const featureLabels={rehearsals:'Rehearsals',leave:'Leave requests',memories:'KC Memories',polls:'Polls & voting',expenses:'Crew expenses',auditions:'Auditions',chat:'Crew chat',achievements:'Achievements'};
const featureMeta={
 rehearsals:['Plan a practice session','Create rehearsals, assign a choreographer and share the venue.','Session title','Practice details','Create session'],
 leave:['Request time away','Send a leave request to the crew admins.','Leave request','Reason and dates','Submit request'],
 memories:['KC Memories','Share the photo album and video links from crew moments.','Memory title','Caption and media link','Share memory'],
 auditions:['Audition portal','Publish auditions or submit your audition details and video link.','Audition / application','Dance style, contact and audition video link','Submit'],
 polls:['Crew polls','Vote on songs, themes and crew decisions.','Poll question','Add options separated by commas','Publish poll'],

 achievements:['Achievements','Recognize crew milestones and standout contributions.','Achievement title','Describe the achievement and recipient','Award achievement']
};
const featureKeys=Object.keys(featureLabels);

function updatesPage(){return welcome('Crew updates','Announcements, changes, and the latest from your people.',admin()?button('＋ New update','new-update'):'')+'<div class="twoCol"><div class="announcements">'+(S.announcements.map(announcement).join('')||empty('It is quiet in here','Updates will appear here when published.'))+'</div>'+(superadmin()?updateForm():'')+'</div>';}

function peoplePage(){
 const people=S.publicMembers||[],query=String(S.peopleQuery||'').trim().toLowerCase();
 const filtered=people.filter(m=>(String(m.name||'')+' '+String(m.username||'')+' '+String(m.role||'')+' '+String(m.bio||'')).toLowerCase().includes(query));
 return welcome('Find your crew','Search members and connect with your crew.')+
 '<section class="profile-discovery-bar"><label class="profile-search"><span aria-hidden="true">⌕</span><input id="peopleSearch" type="search" value="'+esc(S.peopleQuery||'')+'" placeholder="Search members…" autocomplete="off"></label><span class="profile-search-count" id="peopleSearchCount">'+filtered.length+' / '+people.length+'</span></section>'+
 '<div class="profile-directory" id="profileDirectoryGrid">'+(filtered.length?filtered.map(m=>'<article class="surface crew-profile-tile kc-member-directory-card"><button class="crew-profile-open" data-open-profile="'+esc(m.auth_id)+'">'+avatarMarkup(m)+'<span><b>'+esc(m.name||'Crew member')+'</b><small>@'+esc(m.username||'crew-member')+'</small></span></button><p>'+esc(m.bio||'Kinetic Crew member')+'</p><div class="kc-member-directory-footer"><span class="role-pill '+esc(m.role)+'">'+esc(role(m.role))+'</span><button type="button" class="outline" data-open-profile="'+esc(m.auth_id)+'">View profile <span aria-hidden="true">→</span></button></div></article>').join(''):empty(query?'No matching members':'No crew members yet',query?'Try a different name or username.':'Crew members will appear here after they join.'))+'</div>';
}

function attendancePage(){
 if(!admin())return memberAttendancePage();
 const finalized=!!S.roster?.finalized,audit=(S.attendanceAudit||[]).slice(0,12),rows=S.roster?.roster||[],selected=S.events.find(e=>String(e.id)===String(S.rosterEvent));
 const total=rows.length,present=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='present').length,absent=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='absent').length,pending=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='pending').length,notAttending=rows.filter(m=>(m.status||(m.attended?'present':'pending'))==='not_attending').length;
 const pct=total?Math.round(present/total*100):0;
 const eventOptions=S.events.map(e=>'<option value="'+esc(e.id)+'" '+(String(S.rosterEvent)===String(e.id)?'selected':'')+'>'+esc(e.title)+'</option>').join('');
 return '<main class="kc-attendance-home">'+
 '<header class="kc-attendance-heading"><div><span class="kc-attendance-kicker">KINETIC CREW / OPERATIONS</span><h1>Attendance <em>overview.</em></h1><p>Keep your crew in sync. Verify, track and manage event check-ins.</p></div><span class="kc-attendance-live"><i></i> LIVE DESK</span></header>'+
 '<section class="kc-attendance-quick"><button type="button" class="kc-attendance-task kc-task-scan" id="openQrScanner" '+(finalized?'disabled':'')+'><span class="kc-task-icon">▦</span><span><b>Scan QR</b><small>Instant check-in</small></span><i>↗</i></button><button type="button" class="kc-attendance-task kc-task-otp" data-scroll="verifyForm"><span class="kc-task-icon">⌗</span><span><b>Verify OTP</b><small>Six-digit code</small></span><i>↗</i></button><button type="button" class="kc-attendance-task kc-task-roster" data-scroll="attendanceRoster"><span class="kc-task-icon">☷</span><span><b>Event roster</b><small>Manage members</small></span><i>↗</i></button></section>'+
 '<section class="kc-attendance-next"><div class="kc-attendance-next-head"><span class="kc-attendance-kicker">NEXT UP</span><span class="kc-attendance-event-count">'+S.events.length+' EVENTS</span></div><label class="kc-attendance-event-select"><span>◷</span><select id="rosterSelect"><option value="">Select an event to manage</option>'+eventOptions+'</select><span>⌄</span></label><div class="kc-attendance-event-meta">'+(selected?'<b>'+esc(selected.title)+'</b><small>'+esc(dt(selected.starts_at))+' · '+esc(selected.location||'Venue to be announced')+'</small>':'<b>Choose your event</b><small>Your event roster and attendance summary will appear here.</small>')+'</div></section>'+
 (selected?attendanceReportCard(selected.id,false):'')+
 (S.roster?'<section class="kc-attendance-summary"><div class="kc-attendance-summary-head"><div><span class="kc-attendance-kicker">CHECK-IN PROGRESS</span><h2>'+pct+'% <small>present</small></h2></div><span class="kc-attendance-lock '+(finalized?'locked':'')+'">'+(finalized?'▣ LOCKED':'● OPEN')+'</span></div><div class="kc-attendance-progress"><span style="width:'+pct+'%"></span></div><div class="kc-attendance-stat-grid"><div><b>'+present+'</b><small>Present</small></div><div><b>'+pending+'</b><small>Pending</small></div><div><b>'+absent+'</b><small>Absent</small></div><div><b>'+notAttending+'</b><small>Not attending</small></div></div></section>':'<section class="kc-attendance-summary kc-attendance-empty"><span class="kc-attendance-kicker">YOUR ATTENDANCE SNAPSHOT</span><h2>Ready when your crew is.</h2><p>Select an event above to see live check-in progress and member statuses.</p></section>')+
 '<section class="kc-attendance-verify" id="verifyForm"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">QUICK ACTION</span><h2>Verify a member</h2><p>Use their event email and six-digit check-in code.</p></div><span class="kc-attendance-round-icon">⌗</span></div><form id="attendanceOtpForm" class="kc-attendance-otp-form"><input type="hidden" name="eventId" value="'+esc(S.rosterEvent||'')+'"><label><span>Member email</span><input name="memberEmail" type="email" placeholder="member@example.com" required></label><label><span>Event OTP</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required></label><button type="submit" class="kc-attendance-verify-btn" '+(!S.rosterEvent||finalized?'disabled':'')+'>Verify & check in <span>→</span></button></form><div class="kc-attendance-or"><span>OR</span></div><button type="button" class="kc-attendance-scan-btn" id="openQrScannerInline" '+(!S.rosterEvent||finalized?'disabled':'')+'>▦ &nbsp; Scan event QR code</button><div id="qrScanner" class="qr-scanner kc-attendance-scanner" hidden><video id="qrVideo" autoplay playsinline></video><button type="button" class="outline full" id="closeQrScanner">Close scanner</button></div><p class="kc-attendance-note">QR and OTP are alternative check-in methods. Both verify event registration on the server.</p></section>'+
 '<section class="kc-attendance-roster" id="attendanceRoster"><div class="kc-attendance-section-title"><div><span class="kc-attendance-kicker">YOUR PEOPLE</span><h2>Event roster</h2><p>'+total+' registered '+(total===1?'member':'members')+' · Tap a status to update it.</p></div><button type="button" class="kc-attendance-export" id="exportAttendance" '+(!S.roster?'disabled':'')+'>↓ CSV</button></div><label class="kc-attendance-search"><span>⌕</span><input id="attendanceSearch" type="search" value="'+esc(S.attendanceQuery||'')+'" placeholder="Find a member…" autocomplete="off"></label><div id="rosterBody">'+(S.roster?rosterRows(S.roster.roster):'<div class="kc-attendance-no-roster">Select an event to load its registered members.</div>')+'</div>'+
 (S.roster?'<div class="kc-attendance-finalize"><p>'+(finalized?'This event is locked. Only the Super Admin can reopen attendance.':'Finalizing marks all remaining pending members absent and locks the roster.')+'</p><button type="button" id="finalizeAttendance" '+(finalized?'disabled':'')+'>'+(finalized?'Attendance locked':'Finalize attendance <span>→</span>')+'</button>'+(finalized&&superadmin()?'<button type="button" id="reopenAttendance" class="kc-attendance-reopen">Reopen attendance</button>':'')+'</div><section class="kc-attendance-audit"><span class="kc-attendance-kicker">ACTIVITY</span><h3>Recent changes</h3>'+(audit.length?audit.map(a=>'<div class="attendance-audit-row"><span><b>'+esc(a.member_name)+'</b><small>'+esc(a.actor_name)+' · '+esc(a.action.replace('_',' '))+'</small></span><span>'+esc((a.previous_status||'—')+' → '+a.new_status)+'<small>'+esc(dt(a.changed_at))+'</small></span></div>').join(''):'<p class="kc-attendance-note">No changes recorded yet.</p>')+'</section>':'')+'</section></main>';
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
 if(!admin())return empty('Crew management is restricted','Only crew admins can manage members and access.');
 const canRemove=m=>m&&m.auth_id!==S.user.auth_id&&m.role!=='super_admin'&&(superadmin()||m.role==='member');
 const rows=(S.members||[]).map(m=>'<article class="crew-manage-row" data-managed-member="'+esc(m.auth_id)+'"><div class="crew-manage-person">'+avatarMarkup(m)+'<span><b>'+esc(m.name)+'</b><small>'+esc(m.email)+'</small></span></div><span class="roletag '+esc(m.role)+'">'+esc(role(m.role))+'</span>'+(superadmin()&&m.auth_id!==S.user.auth_id&&m.role!=='super_admin'?'<select class="select role-select" data-id="'+esc(m.auth_id)+'"><option value="member" '+(m.role==='member'?'selected':'')+'>Member</option><option value="admin" '+(m.role==='admin'?'selected':'')+'>Admin</option></select>':'')+(canRemove(m)?'<button type="button" class="kc-member-remove" data-member-remove="'+esc(m.auth_id)+'" data-member-name="'+esc(m.name||'Crew member')+'">Remove member</button>':'')+'</article>').join('');
 return welcome('Crew management','Manage the people and permissions behind Kinetic Crew.')+'<div class="crew-manage-summary"><div><b>'+S.members.length+'</b><small>CREW ACCOUNTS</small></div><div><b>'+S.members.filter(m=>m.role!=='member').length+'</b><small>ADMINS</small></div><div><b>'+S.members.filter(m=>m.role==='member').length+'</b><small>MEMBERS</small></div></div><section class="surface crew-manage-list"><div class="directoryhead"><div><h3>Members & access</h3><p>Manage crew roles and remove accounts when necessary.</p></div></div>'+(rows||empty('No members yet','New crew accounts will appear here.'))+'</section><button class="outline" data-view="attendance">Open attendance desk ↗</button>';
}
function chatMessagesMarkup(items){const rows=(items||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));return rows.length?rows.map(m=>{const own=String(m.author_id)===String(S.user.auth_id);return '<article class="wa-message '+(own?'own':'')+'"><small>'+esc(own?'You':m.author_name||'Crew member')+'</small><p>'+esc(m.body||m.title)+'</p><time>'+esc(dt(m.created_at))+'</time></article>';}).join(''):'<div class="wa-empty"><b>Start the crew conversation</b><small>Messages from your crew will appear here.</small></div>';}
function whatsAppChatPage(){const items=S.featureItems.chat||[];return welcome('Crew Chat','One crew conversation. Share plans, quick updates and moments.')+'<section class="wa-shell"><aside class="wa-rail"><div class="wa-rail-head"><b>KC MESSAGES</b><span>● ONLINE</span></div><div class="wa-room active"><span class="wa-room-avatar">KC</span><span><b>Main Crew</b><small>Everyone in Kinetic Crew</small></span></div></aside><div class="wa-conversation"><header class="wa-chat-head"><span class="wa-room-avatar">KC</span><span><b>Main Crew</b><small>Kinetic Crew group conversation · '+items.length+' messages</small></span></header><div class="wa-messages" id="waMessages">'+chatMessagesMarkup(items)+'</div><form class="wa-composer" data-feature-form="chat"><input type="hidden" name="title" value="Crew message"><textarea name="body" rows="1" maxlength="5000" required placeholder="Message the crew…"></textarea><button type="submit" aria-label="Send message">➤</button></form></div></section>';}
function paint(){
document.body.classList.toggle('kc-more-open',S.view==='more');document.body.classList.toggle('kc-home-screen',S.view==='overview');const headerBell=document.querySelector('.kc-header-notifications');if(headerBell)headerBell.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>'+(unread()?'<i></i>':'');const headerProfile=document.querySelector('.kc-header-profile');if(headerProfile)headerProfile.innerHTML=avatarMarkup(S.user||{},'small');
const communityItems=[['polls','◉','Polls & voting'],['memories','▧','KC Memories'],['leave','↗','Leave requests'],['rehearsals','◷','Rehearsals'],['updates','↗','Crew updates'],['people','♙','Discover crew']];
const groups=[
 ['overview',superadmin()?'SUPER ADMIN':admin()?'ADMIN SPACE':'MEMBER SPACE',superadmin()?'Full platform control':admin()?'Crew operations':'Your crew at a glance',[['overview','⌂','Overview']]],
 ['events','EVENTS','Performances & sessions',[['events','▦','Events'],['calendar','▦','Calendar'],['attendance','◎','Attendance report']]],
 ['chat',admin()?'CREW COMMUNITY':'CREW SPACE',admin()?'Member community and activity':'Talk, vote and share',communityItems],
 ['notifications','NOTIFICATIONS','Updates & alerts',[['notifications','♧','Notifications']]],
 ...(admin()?[['management',superadmin()?'SUPER ADMIN CONTROLS':'ADMIN TOOLS',superadmin()?'Roles and platform settings':'Member administration',[['crew-management','♙',superadmin()?'Roles & members':'Crew members']]]]:[]),
 ['settings','MY ACCOUNT','Your preferences',[['profile','◉','My profile'],['settings','⚙','App settings'],['credits','✧','Credits']]]
]
$('#nav').innerHTML=groups.map(([id,label,sub,items])=>{
const expanded=S.navOpen===id;
return '<section class="nav-group '+(expanded?'expanded':'')+'" data-nav-group-panel="'+id+'"><button type="button" class="nav-group-toggle '+(expanded?'expanded':'')+'" data-nav-group="'+id+'" aria-expanded="'+expanded+'"><span class="nav-group-symbol">'+({overview:'⌂',events:'▦',chat:'✉',notifications:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',management:'♙',settings:'⚙'}[id])+'</span><span class="nav-group-label"><b>'+label+'</b><small>'+sub+'</small></span><span class="nav-group-chevron">⌄</span></button><div class="nav-group-items" '+(expanded?'':'hidden')+'>'+items.map(n=>'<button class="navitem '+(S.view===n[0]?'active':'')+'" data-view="'+n[0]+'"><span class="nicon">'+n[1]+'</span><span>'+n[2]+'</span>'+(n[0]==='notifications'&&unread()?'<span class="count">'+unread()+'</span>':'')+'</button>').join('')+'</div></section>';
}).join('')+'<button type="button" class="kc-nav-signout" data-kc-signout><span>↗</span><b>Sign out</b></button>';
const crumb=$('#crumb');if(crumb)crumb.textContent=({overview:'Overview',more:'More',events:'Events','new-event':'Create event','event-edit':'Edit event',chat:'Crew chat',feed:'Crew Feed',memes:'Meme Zone','fun-zone-games':'Mini Games',notifications:'Notifications',people:'Discover crew','fun-zone':'Fun Zone',credits:'Credits','public-profile':'Crew profile','crew-management':'Crew management',attendance:'Attendance','brand-settings':'Brand identity',profile:'My profile',settings:'App settings',calendar:'Calendar',rehearsals:'Rehearsals',auditions:'Auditions',leaderboard:'Leaderboard'}[S.view]||'Crew management');
const fn={overview:home,more:morePage,events:eventsPage,'event-detail':eventDetailPage,'event-edit':()=>eventForm(S.events.find(x=>String(x.id)===String(S.editingEventId))||null),'new-event':()=>eventForm(),chat:chatPage,feed:socialFeedPage,memes:memeZonePage,'fun-zone-games':miniGamesPage,notifications:notificationsPage,updates:updatesPage,profile:profilePage,'app-settings':settingsPage,people:peoplePage,'public-profile':publicProfilePage,'crew-management':crewManagementPage,attendance:attendancePage,'brand-settings':brandSettingsPage,settings:settingsPage,rehearsals:()=>featurePage('rehearsals'),calendar:calendarPage,polls:()=>featurePage('polls'),memories:()=>featurePage('memories'),achievements:()=>featurePage('achievements'),leave:()=>featurePage('leave'),'fun-zone':funZonePage,credits:creditsPage}[S.view]||home;
$('#app').innerHTML=(S.error?'<div class="alert"><span>'+esc(S.error)+'</span><button data-clear>×</button></div>':'')+(S.offline?'<div class="offline-strip">OFFLINE · LAST SAVED DATA</div>':'')+fn();
renderProfileQrCards();
const founderProfileEntry=S.view==='profile'&&superadmin()&&!document.body.classList.contains('kc-founder-profile-open');
if(S.view!=='profile')document.body.classList.remove('kc-founder-profile-open');
if(founderProfileEntry){
 document.body.classList.add('kc-founder-profile-open');
 const founderApp=$('#app');founderApp.classList.add('kc-founder-enter');
 setTimeout(()=>founderApp.classList.remove('kc-founder-enter'),1650);
}
if(S.homeUpdateTimer){clearInterval(S.homeUpdateTimer);S.homeUpdateTimer=null;}
if(S.view==='overview'){
 const homeCarousel=document.querySelector('.kc-home-featured');
 const homeSlides=[...(homeCarousel?.querySelectorAll('[data-home-slide]')||[])];
 const homeDots=[...(homeCarousel?.querySelectorAll('[data-home-slide-to]')||[])];
 if(homeSlides.length>1){
  let current=0;
  const show=next=>{current=(next+homeSlides.length)%homeSlides.length;homeSlides.forEach((slide,i)=>slide.classList.toggle('is-active',i===current));homeDots.forEach((dot,i)=>dot.classList.toggle('active',i===current));};
  homeDots.forEach(dot=>dot.addEventListener('click',()=>{show(Number(dot.dataset.homeSlideTo));clearInterval(S.homeUpdateTimer);S.homeUpdateTimer=setInterval(()=>show(current+1),5200);}));
  S.homeUpdateTimer=setInterval(()=>show(current+1),5200);
  let swipeStartX=0,swipeStartY=0;
  homeCarousel.addEventListener('touchstart',event=>{clearInterval(S.homeUpdateTimer);const touch=event.changedTouches?.[0];swipeStartX=touch?.clientX||0;swipeStartY=touch?.clientY||0;},{passive:true});
  homeCarousel.addEventListener('touchend',event=>{const touch=event.changedTouches?.[0],dx=(touch?.clientX||0)-swipeStartX,dy=(touch?.clientY||0)-swipeStartY;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy))show(current+(dx<0?1:-1));clearInterval(S.homeUpdateTimer);S.homeUpdateTimer=setInterval(()=>show(current+1),5200);},{passive:true});
 }
 const rail=document.querySelector('.kc-home-updates'),track=rail?.querySelector('.kc-home-updates-track'),dots=[...(rail?.querySelectorAll('.kc-home-update-dots span')||[])],count=dots.length;
 if(track&&count>1){
  let index=0;
  const move=next=>{index=(next+count)%count;track.style.transform='translate3d('+(-index*100)+'%,0,0)';dots.forEach((dot,i)=>dot.classList.toggle('active',i===index));const label=rail.querySelector('.kc-home-update-count');if(label)label.textContent=String(index+1).padStart(2,'0')+' / '+String(count).padStart(2,'0');};
  S.homeUpdateTimer=setInterval(()=>move(index+1),5500);
  rail.addEventListener('mouseenter',()=>clearInterval(S.homeUpdateTimer));
  rail.addEventListener('mouseleave',()=>{clearInterval(S.homeUpdateTimer);S.homeUpdateTimer=setInterval(()=>move(index+1),5500);});
  rail.addEventListener('touchstart',()=>clearInterval(S.homeUpdateTimer),{passive:true});
  rail.addEventListener('touchend',()=>{clearInterval(S.homeUpdateTimer);S.homeUpdateTimer=setInterval(()=>move(index+1),5500);},{passive:true});
 }
}
}
function brandSettingsPage(){
 if(!superadmin())return empty('Super Admin access required','Only the Super Admin can change the official Kinetic Crew logo.');
 const current=S.appSettings?.brand_logo_url||window.KC_BRAND_LOGO_URL||window.kcPath('kinetic-crew-logo.svg');
 setTimeout(()=>{kcBrandDraw();kcBrandSetControls(!!kcBrandEditor.image);},0);
 return welcome('Brand identity','Create and manage the official Kinetic Crew logo across the app, browser and installed experience.')+
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
 '<small class="kc-brand-file-help">PNG, JPG or WebP · maximum 5 MB · transparent areas are preserved. The final icon is exported at 512 × 512.</small>'+
 '<button type="button" class="primary" id="uploadBrandLogo" disabled>Publish logo everywhere →</button>'+
 '<p class="kc-brand-security-note">Your Super Admin account can publish the official logo. PNG, JPG or WebP images up to 5 MB are supported.</p>'+
 '</section>';
}
function settingsPage(){
 const prefs=notificationPrefs(),settings=S.appSettings||{},version=window.KC_APP_VERSION||'1.2.2',latest=settings.latest_version||version;
 const updateAvailable=latest!==version;
 return welcome('App settings','Your Kinetic Crew app, account and device preferences.')+
 '<div class="settings-grid">'+
 '<section class="surface settings-card"><span class="settings-kicker">ACCOUNT</span><h3>Your crew identity</h3><p>Manage your profile, username, photo and banner.</p><button class="primary" data-view="profile">Edit profile →</button></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">APP VERSION</span><h3>Kinetic Crew <b>v'+esc(version)+'</b></h3><p>Developer: '+esc(settings.developer||'Kinetic Crew Development Team')+'</p><p class="settings-update-state">App updates install automatically in the background. No action is needed.</p></section>'+
 '<section class="surface settings-card kc-meet-developer"><span class="settings-kicker">THE PERSON BEHIND THE APP</span><h3>Meet the developer</h3><p>Built and maintained by <b>DinuVoX</b>, Founder of Kinetic Crew.</p><details class="kc-developer-details"><summary>Meet the developer →</summary><div class="kc-developer-profile"><span class="kc-developer-mark">DV</span><div><b>DinuVoX</b><small>Founder · Developer · Kinetic Crew</small></div></div><p>Designing and building digital experiences for the Kinetic Crew community.</p></details></section>'+
 (superadmin()?'<section class="surface settings-card kc-superadmin-brand-setting"><span class="settings-kicker">SUPER ADMIN ONLY</span><h3>App icon & logo</h3><p>Upload or replace the official Kinetic Crew logo. Changes apply across the website, browser icon and installed app.</p><button type="button" class="primary" data-view="brand-settings">Upload app icon & logo →</button></section>':'')+
 '<section class="surface settings-card"><span class="settings-kicker">APPEARANCE</span><h3>Make it yours</h3><p>Choose the theme used across your crew workspace.</p><div class="settings-choice"><button type="button" class="outline" data-set-theme="dark">☾ Dark</button><button type="button" class="outline" data-set-theme="light">☀ Light</button></div></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">NOTIFICATIONS</span><h3>Stay in the loop</h3><label class="settings-toggle"><span><b>In-app sound</b><small>Play a sound for crew activity.</small></span><input id="settingsSound" type="checkbox" '+(prefs.sound?'checked':'')+'></label><label class="settings-toggle"><span><b>Push notifications</b><small>Receive alerts when Kinetic Crew is not open.</small></span><button type="button" class="outline" id="enablePush">'+(prefs.push?'Enabled ✓':'Enable')+'</button></label><button class="outline" data-view="notifications">Open notification inbox</button></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">DEVICE</span><h3>App maintenance</h3><p>Clear temporary cached files without signing you out.</p><button class="outline" id="clearAppCache">Clear app cache</button><button class="outline" data-view="notifications">Notification settings</button></section>'+
 '<section class="surface settings-card settings-danger"><span class="settings-kicker">SESSION</span><h3>Sign out</h3><p>Sign out of this device. Your crew account remains active.</p><button class="outline" id="settingsSignOut">Sign out ↗</button></section></div>';
}
async function go(v){S.view=v;S.error='';S.navOpen=({overview:'overview',events:'events','event-detail':'events','event-edit':'events','new-event':'events',chat:'chat',notifications:'notifications',people:'chat',feed:'chat','public-profile':'chat','crew-management':'management',attendance:'management','brand-settings':'management',profile:'settings',settings:superadmin()?'management':'settings',rehearsals:'chat',calendar:'events',polls:'chat',memories:'chat',achievements:'chat',leave:'chat',auditions:'chat',more:'overview'}[v]||'overview');if(S.chatPoll){clearInterval(S.chatPoll);S.chatPoll=null;}if(v==='crew-management'&&admin()){try{S.members=await api('members');}catch(e){S.error=e.message||'Could not load crew members.';}}if(v==='people'||v==='feed'||v==='fun-zone'){try{const {data,error}=await rpc('crew_profile_directory',{});if(error)throw error;S.publicMembers=Array.isArray(data)?data:[];}catch(e){S.publicMembers=[];S.error=e.message||'Could not load crew profiles.';}}if(v==='feed'||v==='fun-zone'||v==='memes'){try{await loadSocialFeed();}catch(e){S.error=e.message||'Could not load the crew feed.';}}if(v==='profile'||v==='public-profile'||v==='settings'){try{const {data,error}=await rpc('crew_profile_social',{p_auth_id:v==='public-profile'?S.selectedProfileId:S.user.auth_id});if(error)throw error;S.profileSocial=data||null;if(v!=='public-profile'&&S.profileSocial?.profile)S.user={...S.user,...S.profileSocial.profile};}catch(e){S.profileSocial=null;S.error=e.message||'Could not load profile details.';}}if(v==='profile'){const results=await Promise.allSettled([loadSocialFeed(),(async()=>{const touch=await rpc('crew_profile_login_touch',{});if(touch.error)console.warn('Login streak could not be updated:',touch.error);return rpc('crew_profile_dashboard',{});})()]);if(results[0].status==='rejected'){S.socialPosts=[];S.socialLikes=[];S.socialComments=[];console.warn('Could not load profile uploads:',results[0].reason);}if(results[1].status==='fulfilled'&&!results[1].value.error)S.profileDashboard=results[1].value.data||{};else{S.profileDashboard={};console.warn('Could not load profile activity dashboard:',results[1].status==='rejected'?results[1].reason:results[1].value.error);}}setMobileMenu(false);if(v==='notifications'){try{await loadSocialFeed();}catch(error){console.warn('Notification post feed could not refresh:',error);}}if(v==='memories'){try{const [directory]=await Promise.all([rpc('crew_profile_directory',{}),loadMemories()]);if(directory.error)throw directory.error;S.publicMembers=Array.isArray(directory.data)?directory.data:[];}catch(e){S.error=e.message||'Could not load KC Memories.';}}else if(featureKeys.includes(v)){try{S.featureItems[v]=await featureApi('list',v,{});}catch(e){S.error=e.message||'Could not load this feature.';}}if(v==='leaderboard'){try{S.leaderboard=await featureApi('leaderboard',null,{});}catch(e){S.error=e.message||'Could not load leaderboard.';}}paint();const viewRoot=$('#app');viewRoot.classList.remove('kc-view-enter');void viewRoot.offsetWidth;viewRoot.classList.add('kc-view-enter');viewRoot.addEventListener('animationend',function done(e){if(e.target===viewRoot){viewRoot.classList.remove('kc-view-enter');viewRoot.removeEventListener('animationend',done);}},{once:false});if(v==='chat'){S.chatPoll=setInterval(async()=>{if(S.view!=='chat'||S.chatBusy)return;S.chatBusy=true;try{const rows=await featureApi('list','chat',{});const previous=S.featureItems.chat||[],previousIds=new Set(previous.map(m=>String(m.id)));const incoming=rows.filter(m=>!previousIds.has(String(m.id)));if(incoming.length){const latest=incoming[incoming.length-1];if(String(latest.author_id)!==String(S.user.auth_id)){window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:latest.author_name||'Crew chat',body:latest.body||'Sent you a new message.',target:'chat'}}));if(document.hidden&&'Notification'in window&&Notification.permission==='granted')new Notification('Kinetic Crew · Crew chat',{body:(latest.author_name||'A crew member')+': '+(latest.body||'New message'),icon:window.kcPath('kinetic-crew-logo.svg')});}}if(rows.length!==(S.featureItems.chat||[]).length||incoming.length){S.featureItems.chat=rows;const box=$('#waMessages');if(box){const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;box.innerHTML=chatMessagesMarkup(rows);if(atBottom)box.scrollTop=box.scrollHeight;}}}catch{}finally{S.chatBusy=false;}},5000);}window.scrollTo({top:0,behavior:'auto'});savePageState();}
async function exportAttendance(){
 if(!S.roster?.roster?.length){notice('No attendance rows to export.');return;}
 const rows=[['KINETIC CREW · OFFICIAL ATTENDANCE REPORT'],['Generated by Kinetic Crew'],['Event ID',S.rosterEvent],[],['Member name','Email','Attendance status','Registered at'],...S.roster.roster.map(m=>[m.name,m.email,m.status||(m.attended?'present':'pending'),m.registered_at||'']),[],['KINETIC CREW · BUILT TO MOVE TOGETHER']];
 if(window.XLSX){const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:28},{wch:34},{wch:22},{wch:28}];XLSX.utils.book_append_sheet(wb,ws,'Attendance');XLSX.writeFile(wb,'kinetic-crew-attendance-'+S.rosterEvent+'.xlsx');notice('Branded Excel attendance report downloaded.');return;}
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
function showOtp(code,expires,title){$('#modalRoot').innerHTML='<div class="modalback" id="otpBackdrop"><div class="modal" role="dialog" aria-modal="true"><button class="iconbutton modalclose" id="closeOtp">×</button><div class="modalemblem">◎</div><div class="eyebrow" style="justify-content:center">ATTENDANCE PASS / '+esc(title)+'</div><h2>Your code is ready.</h2><p>Show this six-digit code to an authorized crew admin.</p><div class="code">'+code.split('').map(d=>'<span>'+d+'</span>').join('')+'</div><div class="modalhint">◷ Expires '+esc(new Date(expires).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</div><p>✦ Single-use · Keep your code private</p><button class="primary full" id="doneOtp">Got it ✓</button></div></div>';$('#closeOtp').onclick=()=>$('#modalRoot').innerHTML='';$('#doneOtp').onclick=()=>$('#modalRoot').innerHTML='';$('#otpBackdrop').onclick=e=>{if(e.target.id==='otpBackdrop')$('#modalRoot').innerHTML='';};}

let kcProfileLastTap=0,kcProfileLastTapCard=null,kcLastTouchFlipAt=0;
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
document.addEventListener('pointerup',event=>{
 if(event.pointerType!=='touch')return;
 const card=event.target.closest('[data-profile-flip]');
 if(!card||event.target.closest('button,a,input,textarea,summary,[contenteditable="true"]')){kcProfileLastTap=0;kcProfileLastTapCard=null;return;}
 const now=performance.now();
 if(kcProfileLastTapCard===card&&now-kcProfileLastTap>=90&&now-kcProfileLastTap<=650){
  kcFlipProfileCard(card);kcLastTouchFlipAt=now;kcProfileLastTap=0;kcProfileLastTapCard=null;
 }else{kcProfileLastTap=now;kcProfileLastTapCard=card;}
},{passive:true});
document.addEventListener('dblclick',event=>{
 if(performance.now()-kcLastTouchFlipAt<850)return;
 const card=event.target.closest('[data-profile-flip]');
 if(!card||event.target.closest('button,a,input,textarea,summary,[contenteditable="true"]'))return;
 event.preventDefault();kcFlipProfileCard(card);
});
document.addEventListener('animationend',event=>{
 const card=event.target.closest?.('[data-profile-flip].kc-flip-intro');
 if(!card||event.animationName!=='kc-profile-flip-intro')return;
 card.classList.remove('kc-flip-intro');
 try{localStorage.setItem('kc_profile_flip_intro_v1','1');}catch{}
});
document.addEventListener('click',event=>{const edit=event.target.closest('[data-edit-event]');if(!edit)return;event.preventDefault();if(!admin()){notice('Admin access required to edit events.');return;}S.editingEventId=edit.dataset.editEvent;go('event-edit');});
document.addEventListener('click',async e=>{if(e.target.closest('#downloadEventPass')){await downloadEventPass();return;}const flipBack=e.target.closest('[data-profile-flip-back]');if(flipBack){flipBack.closest('[data-profile-flip]')?.classList.remove('is-flipped');return;}const shareProfile=e.target.closest('[data-share-profile]');if(shareProfile){const data={title:(S.user?.name||'Kinetic Crew')+' · Kinetic Crew',text:'Connect with '+(S.user?.name||'me')+' on Kinetic Crew · @'+(S.user?.username||'crew-member')};if(navigator.share){try{await navigator.share(data);}catch(err){if(err.name!=='AbortError')notice('Could not share profile.');}}else{try{await navigator.clipboard.writeText(data.text);notice('Profile details copied.');}catch{notice('Sharing is unavailable in this browser.');}}return;}const removeMember=e.target.closest('[data-member-remove]');if(removeMember){if(removeMember.disabled)return;const targetId=removeMember.dataset.memberRemove,name=removeMember.dataset.memberName||'this member';const target=(S.members||[]).find(m=>String(m.auth_id)===String(targetId));if(!target){notice('Member list is out of date. Refresh and try again.');return;}const permitted=target.auth_id!==S.user?.auth_id&&target.role!=='super_admin'&&(superadmin()||target.role==='member');if(!permitted){notice('Your role cannot remove this account.');return;}const first=confirm('PERMANENTLY REMOVE '+name+'?\n\nThis deletes the member’s sign-in account, profile, uploads, follows, login streak, event registrations, attendance records, and personal app data. Shared events and crew-wide records are kept where possible.\n\nThis cannot be undone. Continue to the second check?');if(!first)return;const typed=prompt('Final confirmation\n\nType DELETE to permanently remove '+name+'.');if(typed!=='DELETE'){notice('Removal cancelled. Nothing was deleted.');return;}if(!confirm('FINAL CHECK\n\nDelete '+name+' and their account permanently now?'))return;removeMember.disabled=true;removeMember.textContent='Removing…';try{const {data,error}=await client.functions.invoke('delete-crew-member',{body:{authId:targetId}});if(error){let message=error.message||'Member removal failed.';try{const payload=await error.context?.json?.();message=payload?.error||message;}catch{}throw Error(message);}if(data?.error)throw Error(data.error);S.members=(S.members||[]).filter(m=>String(m.auth_id)!==String(targetId));S.publicMembers=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(targetId));notice(data?.message||name+' was permanently removed.');paint();}catch(error){removeMember.disabled=false;removeMember.textContent='Remove member';notice(error.message||'Could not remove this member.');}return;}const connectionClose=e.target.closest('[data-connections-close]');if(connectionClose){document.getElementById('kcConnectionsModal')?.remove();return;}if(e.target.id==='kcConnectionsModal'){e.target.remove();return;}const connectionOpen=e.target.closest('[data-open-connection]');if(connectionOpen){const id=connectionOpen.dataset.openConnection;document.getElementById('kcConnectionsModal')?.remove();if(String(id)===String(S.user?.auth_id))go('profile');else{S.selectedProfileId=id;go('public-profile');}return;}const connectionButton=e.target.closest('[data-profile-connections]');if(connectionButton){await openProfileConnections(connectionButton.dataset.profileConnections,connectionButton.dataset.profileOwner);return;}const profileScan=e.target.closest('[data-profile-scan]');if(profileScan){window.KC_QR_SCANNER?.open?.();return;}const profileTab=e.target.closest('[data-profile-tab]');if(profileTab){const activityRoot=profileTab.closest('.kc-profile-activity');if(activityRoot){S.profileTab=profileTab.dataset.profileTab;activityRoot.querySelectorAll('[data-profile-tab]').forEach(b=>b.classList.toggle('active',b===profileTab));activityRoot.querySelectorAll('[data-profile-panel]').forEach(panel=>panel.hidden=panel.dataset.profilePanel!==S.profileTab);}return;}const funCreate=e.target.closest('[data-fun-create]');if(funCreate){await go('feed');requestAnimationFrame(()=>document.querySelector('#socialPostForm textarea')?.focus());return;}const docSelect=e.target.closest('[data-doc-select]');if(docSelect){$('#doc-'+docSelect.dataset.docSelect)?.click();return;}const docView=e.target.closest('[data-doc-view]');if(docView){const row=(S.profileDocuments||[]).find(x=>x.document_type===docView.dataset.docView);if(!row)return;const signed=await client.storage.from('crew-profile-documents').createSignedUrl(row.storage_path,60);if(signed.error){notice(signed.error.message||'Could not open document.');return;}window.open(signed.data.signedUrl,'_blank','noopener');return;}const shareEvent=e.target.closest('[data-share-event]');if(shareEvent){const item=S.events.find(x=>String(x.id)===String(shareEvent.dataset.shareEvent));if(!item)return;const shareData={title:item.title,text:'Join me at '+item.title+(item.location?' · '+item.location:''),url:location.origin+window.kcPath('')};if(navigator.share){try{await navigator.share(shareData);}catch(error){if(error.name!=='AbortError')notice('Could not open sharing.');}}else{try{await navigator.clipboard.writeText(shareData.text+' '+shareData.url);notice('Event invite copied.');}catch{notice('Sharing is not available in this browser.');}}return;}const nestButton=e.target.closest('[data-nest-toggle]');if(nestButton){const panel=nestButton.closest('[data-nav-nest]'),items=panel.querySelector('.nav-nest-items'),open=nestButton.getAttribute('aria-expanded')==='true';document.querySelectorAll('[data-nav-nest]').forEach(p=>{p.classList.remove('expanded');p.querySelector('[data-nest-toggle]')?.setAttribute('aria-expanded','false');p.querySelector('.nav-nest-items')?.setAttribute('hidden','');});if(!open){panel.classList.add('expanded');nestButton.setAttribute('aria-expanded','true');items?.removeAttribute('hidden');}return;}const themeChoice=e.target.closest('[data-set-theme]');if(themeChoice){const toggle=document.querySelector('[data-theme-toggle]');if(toggle&&document.documentElement.dataset.theme!==themeChoice.dataset.setTheme)toggle.click();notice('Appearance updated.');return;}const groupButton=e.target.closest('[data-nav-group]');if(groupButton){const key=groupButton.dataset.navGroup;S.navOpen=S.navOpen===key?'':key;paint();return;}const funStart=e.target.closest('[data-fun-start]');if(funStart){S.funRound={state:'waiting',best:S.funRound?.best??null,last:null};paint();const delay=1200+Math.random()*2600;clearTimeout(S.funTimer);S.funTimer=setTimeout(()=>{if((S.view==='fun-zone-games'||S.view==='fun-zone')&&S.funRound?.state==='waiting'){S.funRound={...S.funRound,state:'go',startedAt:Date.now()};paint();}},delay);return;}const funHit=e.target.closest('[data-fun-hit]');if(funHit){if(S.funRound?.state==='waiting'){clearTimeout(S.funTimer);S.funRound={...S.funRound,state:'early'};paint();return;}if(S.funRound?.state==='go'){const ms=Date.now()-S.funRound.startedAt;S.funRound={state:'done',last:ms,best:S.funRound.best==null?ms:Math.min(S.funRound.best,ms)};paint();return;}return;}if(e.target.closest('[data-fun-reset]')){clearTimeout(S.funTimer);S.funRound={state:'ready',best:null,last:null};paint();return;}if(e.target.closest('[data-dance-prompt]')){const prompts=['Freestyle for 30 seconds without stopping.','Create a 4-count move and teach it to someone.','Dance to the next song you hear.','Try a move using only footwork.','Recreate a signature move from your last performance.','Make a 2-person mirror routine.','Do a clean 8-count in slow motion.'];const p=prompts[Math.floor(Math.random()*prompts.length)];const el=$('#dancePrompt');if(el)el.textContent=p;return;}const like=e.target.closest('[data-social-like]');if(like){await action(async()=>{const postId=like.dataset.socialLike;if(like.dataset.liked==='true'){const {error}=await client.from('crew_social_likes').delete().eq('post_id',postId).eq('user_id',S.user.auth_id);if(error)throw error;}else{const {error}=await client.from('crew_social_likes').upsert({post_id:postId,user_id:S.user.auth_id},{onConflict:'post_id,user_id',ignoreDuplicates:true});if(error)throw error;}await loadSocialFeed();});return;}const commentToggle=e.target.closest('[data-social-comments-toggle]');if(commentToggle){const panel=document.querySelector('[data-social-comments="'+commentToggle.dataset.socialCommentsToggle+'"]');if(panel)panel.hidden=!panel.hidden;return;}const share=e.target.closest('[data-social-share]');if(share){const post=S.socialPosts.find(p=>String(p.id)===String(share.dataset.socialShare));if(post){try{if(navigator.share)await navigator.share({title:'Kinetic Crew',text:'Shared by the crew',url:post.link_url});else{await navigator.clipboard.writeText(post.link_url);notice('Link copied.');}}catch(err){if(err?.name!=='AbortError')notice('Could not share this link from the browser.');}}return;}const socialDelete=e.target.closest('[data-social-delete]');if(socialDelete){if(!confirm('Delete this crew post?'))return;await action(async()=>{const {error}=await client.from('crew_social_posts').delete().eq('id',socialDelete.dataset.socialDelete);if(error)throw error;await loadSocialFeed();notice('Post deleted.');});return;}const vote=e.target.closest('[data-vote-id]');if(vote){await action(async()=>{const res=await featureApi('vote','polls',{id:vote.dataset.voteId,choice:vote.dataset.choice});notice(res.message);S.featureItems.polls=await featureApi('list','polls',{});});return;}const results=e.target.closest('[data-poll-results]');if(results){await action(async()=>{const rows=await featureApi('vote-results','polls',{id:results.dataset.pollResults});notice(rows.map(x=>x.choice+': '+x.votes).join(' · ')||'No votes yet');});return;}const mod=e.target.closest('[data-moderate]');if(mod){await action(async()=>{const res=await featureApi('moderate',mod.dataset.feature,{id:mod.dataset.moderate,status:mod.dataset.status});notice(res.message);S.featureItems[mod.dataset.feature]=await featureApi('list',mod.dataset.feature,{});});return;}const delFeature=e.target.closest('[data-feature-delete]');if(delFeature){if(!confirm('Delete this item?'))return;await action(async()=>{const res=await featureApi('delete',delFeature.dataset.feature,{id:delFeature.dataset.featureDelete});notice(res.message);S.featureItems[delFeature.dataset.feature]=await featureApi('list',delFeature.dataset.feature,{});});return;}const follow=e.target.closest('[data-follow]');if(follow){const targetId=follow.dataset.follow,wasFollowing=follow.dataset.following==='true';follow.disabled=true;await action(async()=>{const {error}=await rpc('crew_follow_profile',{p_target_auth_id:targetId,p_follow:!wasFollowing});if(error)throw Error(error.message||'Could not update follow.');const [profileResult,directoryResult]=await Promise.all([rpc('crew_profile_social',{p_auth_id:targetId}),rpc('crew_profile_directory',{})]);if(profileResult.error)throw profileResult.error;S.profileSocial=profileResult.data||null;if(!directoryResult.error)S.publicMembers=Array.isArray(directoryResult.data)?directoryResult.data:[];notice(wasFollowing?'Unfollowed member.':'You are now following this member.');paint();});return;}const profileEdit=e.target.closest('[data-profile-edit]');if(profileEdit){const editor=$('#profileEditor');if(editor){editor.hidden=false;editor.scrollIntoView({behavior:'smooth',block:'start'});editor.querySelector('input[name="name"]')?.focus({preventScroll:true});}return;}const profileEditorClose=e.target.closest('[data-profile-editor-close]');if(profileEditorClose){const editor=$('#profileEditor');if(editor)editor.hidden=true;return;}const profileOpen=e.target.closest('[data-open-profile]');if(profileOpen){S.selectedProfileId=profileOpen.dataset.openProfile;go('public-profile');return;}const eventFilter=e.target.closest('[data-event-filter]');if(eventFilter){S.eventsFilter=eventFilter.dataset.eventFilter||'all';paint();return;}const openEvent=e.target.closest('[data-open-event]');if(openEvent){S.selectedEvent=openEvent.dataset.openEvent;go('event-detail');return;}const v=e.target.closest('[data-view]');if(v){const target=v.dataset.view;const route=target==='new-event'?'events':target==='new-update'?'updates':target==='achievement-form'?'achievements':target;go(route).then(()=>{const anchor=target==='new-event'?'#eventForm':target==='new-update'?'#updateForm':target==='achievement-form'?'#achievementFormHost':null;if(anchor)$(anchor)?.scrollIntoView({behavior:'smooth',block:'center'});});return;}const r=e.target.closest('[data-register]');if(r){if(r.disabled||r.dataset.submitting==='true')return;r.disabled=true;r.dataset.submitting='true';r.setAttribute('aria-busy','true');r.textContent='Registering…';try{await action(async()=>{const d=await api('register','POST',{eventId:r.dataset.register});notice(d.message||'Registration successful.');await refresh();});}finally{if(r.isConnected){r.disabled=false;r.dataset.submitting='false';r.removeAttribute('aria-busy');r.textContent='Register for this event →';}}return;}const eq=e.target.closest('[data-event-qr]');if(eq){const event=S.events.find(x=>String(x.id)===String(eq.dataset.eventQr));if(event)showEventQr(event.id,event.title);return;}const o=e.target.closest('[data-otp]');if(o){await action(async()=>{let e0=S.events.find(x=>String(x.id)===String(o.dataset.otp));let d=await api('otp','POST',{eventId:o.dataset.otp});showOtp(d.code,d.expiresAt,e0?.title||'Crew event');notice(d.message);});return;}const s=e.target.closest('[data-scroll]');if(s){$('#'+s.dataset.scroll)?.scrollIntoView({behavior:'smooth'});return;}if(e.target.closest('[data-clear]')){S.error='';paint();return;}if(e.target.closest('#openQrScanner')){startQr();return;}if(e.target.closest('#closeQrScanner')){stopQr();$('#qrScanner').hidden=true;return;}if(e.target.closest('#finalizeAttendance')){if(!S.rosterEvent||!confirm('Finalize this event attendance? All remaining pending members will be marked absent. This locks the roster.'))return;await action(async()=>{const r=await api('finalize-attendance','POST',{eventId:S.rosterEvent});S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>x.data||[]);notice(r.message);});return;}const attendanceStatus=e.target.closest('[data-attendance-status]');if(attendanceStatus){if(!S.rosterEvent||!attendanceStatus.dataset.memberId)return;await action(async()=>{const {data,error}=await rpc('crew_set_attendance_status',{p_event_id:S.rosterEvent,p_member_id:attendanceStatus.dataset.memberId,p_status:attendanceStatus.dataset.attendanceStatus});if(error)throw error;S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});notice(data?.message||'Attendance updated.');});return;}if(e.target.closest('#reopenAttendance')){if(!superadmin()||!S.rosterEvent||!confirm('Reopen attendance for this event? Admins will be able to edit statuses again.'))return;await action(async()=>{const {data,error}=await rpc('crew_reopen_attendance',{p_event_id:S.rosterEvent});if(error)throw error;S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});notice(data?.message||'Attendance reopened.');});return;}if(e.target.closest('#exportAttendance')){exportAttendance();return;}const del=e.target.closest('[data-delete-event]');if(del){if(!confirm('Delete this event and all its registrations and attendance records? This cannot be undone.'))return;await action(async()=>{const r=await api('delete-event','DELETE',{eventId:del.dataset.deleteEvent});if(S.rosterEvent===del.dataset.deleteEvent){S.roster=null;S.rosterEvent='';}notice(r.message);await refresh();});return;}if(e.target.closest('#logoutProfile')){await auth.signOut();location.replace(window.kcPath('login.html'));return;}const deleteUpdate=e.target.closest('[data-delete-announcement]');if(deleteUpdate){if(!superadmin()){notice('Only the Super Admin can delete crew updates.');return;}if(!confirm('Delete this crew update for everyone?'))return;await action(async()=>{const {data,error}=await rpc('crew_delete_announcement',{p_announcement_id:deleteUpdate.dataset.deleteAnnouncement});if(error)throw Error(error.message||'Could not delete update.');notice('Crew update deleted.');await refresh();});return;}const readBtn=e.target.closest('[data-read-notice]');if(readBtn){markRead(readBtn.dataset.readNotice);paint();notice('Notification marked as read.');return;}const noticeItem=e.target.closest('[data-notice-id]');if(noticeItem&&!e.target.closest('button')){markRead(noticeItem.dataset.noticeId);paint();return;}const categoryBtn=e.target.closest('[data-notice-category]');if(categoryBtn){S.noticeCategory=categoryBtn.dataset.noticeCategory;paint();return;}const filterBtn=e.target.closest('[data-notice-filter]');if(filterBtn){S.noticeFilter=filterBtn.dataset.noticeFilter;paint();return;}const openNotice=e.target.closest('[data-notice-open]');if(openNotice){const id=openNotice.dataset.noticeOpen;markRead(id);if(openNotice.dataset.noticeType==='event'){S.selectedEvent=openNotice.dataset.noticeTarget;go('event-detail');}else if(openNotice.dataset.noticeType==='post'){const postId=openNotice.dataset.noticeTarget;go('feed').then(()=>requestAnimationFrame(()=>document.querySelector('[data-social-post="'+CSS.escape(String(postId))+'"]')?.scrollIntoView({behavior:'smooth',block:'center'})));}else go('updates');return;}if(e.target.closest('#markAllRead')){localStorage.setItem(readKey(),JSON.stringify(notificationItems().map(a=>a.notice_id)));paint();notice('All notifications marked as read.');return;}if(e.target.closest('#testNoticeSound')){playNoticeSound();notice('That is your Kinetic Crew alert sound.');return;}if(e.target.closest('#enablePush')){await action(async()=>{const result=await window.kcPush.enable();saveNotificationPrefs({push:true});notice(result.message||'Push alerts enabled on this device.');});return;}});
document.addEventListener('input',e=>{if(e.target.id==='peopleSearch'){S.peopleQuery=e.target.value;const pos=e.target.selectionStart;const grid=$('#profileDirectoryGrid');if(grid){const temp=document.createElement('div');temp.innerHTML=peoplePage();const fresh=temp.querySelector('#profileDirectoryGrid');if(fresh)grid.replaceWith(fresh);const count=$('#peopleSearchCount');if(count)count.textContent=fresh?String(fresh.querySelectorAll('.kc-member-directory-card').length)+' / '+(S.publicMembers||[]).length:count.textContent;const input=$('#peopleSearch');if(input){input.focus();input.setSelectionRange(pos,pos);}}return;}if(e.target.id==='attendanceSearch'){S.attendanceQuery=e.target.value;const body=$('#rosterBody');if(body)body.innerHTML=rosterRows(S.roster?.roster||[]);}});
document.addEventListener('input',e=>{if(e.target.id==='noticeSearch'){S.noticeQuery=e.target.value;const pos=e.target.selectionStart;const app=$('#app');const page=notificationsPage();const start=app.querySelector('.notice-layout');if(start){const temp=document.createElement('div');temp.innerHTML=page;const fresh=temp.querySelector('.notice-layout');start.replaceWith(fresh);const input=$('#noticeSearch');if(input){input.focus();input.setSelectionRange(pos,pos);}}}});
document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;const fallback=img.dataset.fallback;if(!fallback)return;const node=document.createElement('span');node.className=img.classList.contains('profile-photo')?'profile-photo profile-photo-placeholder':('avatar-fallback '+(img.classList.contains('small')?'small':''));node.textContent=fallback;node.setAttribute('aria-label','Profile image unavailable');img.replaceWith(node);},true);

document.addEventListener('input',e=>{if(e.target.id!=='kceEventSearch')return;S.eventQuery=e.target.value;const pos=e.target.selectionStart,old=document.querySelector('.kce-events');if(!old)return;const temp=document.createElement('div');temp.innerHTML=eventsPage();const fresh=temp.querySelector('.kce-events');if(fresh)old.replaceWith(fresh);const input=document.querySelector('#kceEventSearch');if(input){input.focus();input.setSelectionRange(pos,pos);}});
function openImageCrop(file,isBanner){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){notice('Choose a JPG, PNG or WebP image under 8 MB.');return;}
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
  const uploaded=await client.storage.from('crew-avatars').upload(path,blob,{upsert:false,contentType:'image/jpeg',cacheControl:'3600'});
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
  let bitmap;if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(file);else bitmap=await new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image could not be opened.'));};image.src=url;});
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
 const button=event.target.closest('#uploadBrandLogo');if(!button)return;
 event.preventDefault();
 if(!superadmin()){notice('Only the Super Admin can change the official logo.');return;}
 if(!kcBrandEditor.image){notice('Choose a logo image first.');return;}
 const oldLabel=button.textContent;button.disabled=true;button.textContent='Preparing logo…';
 try{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Your browser could not prepare the logo image.');
  kcBrandClampPan();const p=kcBrandEditor,m=kcBrandMetrics(),img=p.image;
  ctx.clearRect(0,0,512,512);ctx.translate(256+p.x,256+p.y);ctx.rotate(m.rot*Math.PI/180);ctx.scale(m.scale,m.scale);ctx.drawImage(img,-img.width/2,-img.height/2);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Could not export the edited logo. Try another image.');
  button.textContent='Uploading logo…';
  const storage=client.storage.from('crew-brand-assets');
  const uploaded=await storage.upload('brand/kinetic-crew-logo.png',blob,{upsert:true,contentType:'image/png',cacheControl:'0'});
  if(uploaded.error)throw uploaded.error;
  const publicUrl=storage.getPublicUrl(uploaded.data.path).data.publicUrl+'?v='+Date.now();
  button.textContent='Applying everywhere…';
  const saved=await rpc('crew_set_app_setting',{p_key:'brand_logo_url',p_value:publicUrl});
  if(saved.error)throw saved.error;
  S.appSettings={...(S.appSettings||{}),brand_logo_url:publicUrl};
  window.kcApplyBrandLogo?.(publicUrl);
  const current=$('#brandLogoCurrent');if(current)current.src=publicUrl;
  kcBrandEditor.status='Published successfully · This logo is now live across Kinetic Crew';const status=$('#brandLogoEditorStatus');if(status)status.textContent=kcBrandEditor.status;
  notice('Official Kinetic Crew logo updated everywhere.');paint();
 }catch(error){kcBrandEditor.status=error.message||'Logo upload failed. Your current logo is unchanged.';const status=$('#brandLogoEditorStatus');if(status)status.textContent=kcBrandEditor.status;notice(kcBrandEditor.status);button.disabled=!kcBrandEditor.image;button.textContent=oldLabel;}
});
document.addEventListener('change',async e=>{
 if(e.target.id==='settingsSound'){saveNotificationPrefs({sound:e.target.checked});if(e.target.checked)playNoticeSound();notice(e.target.checked?'In-app sounds enabled.':'In-app sounds muted.');}
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
document.addEventListener('change',async e=>{if(e.target.matches('[data-doc-input]')){const file=e.target.files?.[0],type=e.target.dataset.docInput;if(!file)return;const ext=(file.name.split('.').pop()||'').toLowerCase(),mimeByExt={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},mime=mimeByExt[ext];if(!mime||file.size>10*1024*1024){notice('Choose a PDF, DOC or DOCX file under 10 MB.');e.target.value='';return;}await action(async()=>{const userId=S.user?.auth_id;if(!userId)throw Error('Please sign in again.');const old=(S.profileDocuments||[]).find(x=>x.document_type===type);const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=userId+'/'+type+'/'+Date.now()+'-'+safe;const uploaded=await client.storage.from('crew-profile-documents').upload(path,file,{upsert:false,contentType:mime,cacheControl:'3600'});if(uploaded.error)throw uploaded.error;const saved=await client.from('crew_profile_documents').upsert({auth_id:userId,document_type:type,storage_path:path,file_name:file.name,mime_type:mime,size_bytes:file.size,updated_at:new Date().toISOString()},{onConflict:'auth_id,document_type'});if(saved.error){await client.storage.from('crew-profile-documents').remove([path]);throw saved.error;}if(old?.storage_path)await client.storage.from('crew-profile-documents').remove([old.storage_path]);const rows=await client.from('crew_profile_documents').select('*').eq('auth_id',userId);if(rows.error)throw rows.error;S.profileDocuments=rows.data||[];paint();notice(type==='resume'?'Resume uploaded.':'Cover letter uploaded.');});e.target.value='';}else if(e.target.id==='profilePhotoInput'||e.target.id==='profileBannerInput'){const file=e.target.files?.[0];if(file)openImageCrop(file,e.target.id==='profileBannerInput');}else if(e.target.id==='noticeSound'){saveNotificationPrefs({sound:e.target.checked});if(e.target.checked)playNoticeSound();notice(e.target.checked?'In-app sound enabled.':'In-app sound muted.');}});
document.addEventListener('click',async e=>{const save=e.target.closest('.profile-admin-save');if(!save)return;const row=save.closest('[data-profile-row]');await action(async()=>{const {data,error}=await rpc('crew_manage_profile',{p_auth_id:row.dataset.profileRow,p_name:row.querySelector('[name=member_name]').value,p_bio:row.querySelector('[name=member_bio]').value});if(error)throw Error(error.message||'Could not update member profile.');notice('Member profile updated.');await refresh();});});
document.addEventListener('keydown',e=>{const item=e.target.closest('[data-open-event]');if(item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();S.selectedEvent=item.dataset.openEvent;go('event-detail');}}); 
document.addEventListener('submit',async e=>{
 let f=e.target;
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
     const uploaded=await client.storage.from('crew-memories').upload(uploadedPath,photo,{cacheControl:'3600',upsert:false,contentType:photo.type});
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
  try{
   const body=String(d.get('body')||'');
   const res=await featureApi('create',key,{title:d.get('title'),body,data});
   notice(res.message);
   S.featureItems[key]=await featureApi('list',key,{});
   if(key==='chat'){S.view='chat';paint();$('#waMessages')?.scrollTo({top:$('#waMessages').scrollHeight,behavior:'smooth'});}
  }catch(error){S.error=error.message||'Could not save this item.';paint();}
  return;
 }
if(f.id==='attendanceReportForm'){e.preventDefault();const d=new FormData(f),button=f.querySelector('button[type="submit"]'),eventId=String(d.get('eventId')||''),toEmail=String(d.get('toEmail')||'').trim();if(!eventId){notice('Choose an event first.');return;}if(!toEmail){notice('Enter the report email address.');return;}button.disabled=true;button.textContent='Preparing PDF and sending…';try{const {data,error}=await client.functions.invoke('send-attendance-report',{body:{eventId,toEmail}});if(error){let detail=error.message||'Attendance report email failed.';try{const ctx=error.context;if(ctx&&typeof ctx.json==='function'){const payload=await ctx.json();detail=payload.error||payload.message||detail;}}catch{}throw Error(detail);}if(data?.error)throw Error(data.error);notice(data?.scope==='personal'?'Personal attendance report sent with PDF.':'Complete attendance report sent with PDF.');}catch(error){notice('Report email failed: '+(error.message||'Check the email service configuration.'));}finally{button.disabled=false;button.textContent='✉ Send attendance report + PDF';}return;}if(f.id==='sendEventTicketsForm'){e.preventDefault();if(!admin()){notice('Admin access required.');return;}const d=new FormData(f),button=f.querySelector('button[type="submit"]');if(d.get('recipientMode')==='single'&&!d.get('email')){notice('Choose one registered member first.');return;}button.disabled=true;button.textContent='Sending tickets…';try{const {data,error}=await client.functions.invoke('send-event-ticket',{body:{eventId:d.get('eventId'),recipientMode:d.get('recipientMode'),email:d.get('email')}});if(error){let detail=error.message||'Ticket email request failed.';try{const ctx=error.context;if(ctx&&typeof ctx.json==='function'){const payload=await ctx.json();detail=payload.error||payload.message||detail;}}catch{}throw Error(detail);}if(data?.error)throw Error(data.error);const sent=Number(data?.sent||0),failed=Number(data?.failed||0),details=Array.isArray(data?.results)?data.results.filter(x=>!x.ok).map(x=>(x.email||'Recipient')+': '+(x.error||'SMTP rejected the message')):[];if(failed){const detail=details.length?' '+details.join(' · '):'';notice('Tickets sent: '+sent+' · Failed: '+failed+'.'+detail);}else notice('Tickets sent successfully: '+sent+'.');}catch(error){notice('Ticket send failed: '+(error.message||'Check the SMTP configuration.'));}finally{button.disabled=false;button.textContent='✉ Send event tickets';}return;}if(f.id==='socialPostForm'){e.preventDefault();const d=new FormData(f);await action(async()=>{const link=safeSocialUrl(d.get('link_url'));if(!link)throw Error('Paste a valid HTTPS link.');const {error}=await client.from('crew_social_posts').insert({author_id:S.user.auth_id,link_url:link,caption:String(d.get('caption')||'').trim()});if(error)throw error;S.sharedDraft=null;await loadSocialFeed();notice('Shared with the crew.');});return;}if(f.matches('[data-social-comment-form]')){e.preventDefault();const d=new FormData(f),body=String(d.get('body')||'').trim(),postId=f.dataset.socialCommentForm;if(!body)return;await action(async()=>{const {error}=await client.from('crew_social_comments').insert({post_id:postId,user_id:S.user.auth_id,body});if(error)throw error;await loadSocialFeed();notice('Comment added.');});return;}if(f.id==='profileForm'){e.preventDefault();const d=new FormData(f);await action(async()=>{const username=String(d.get('username')||'').trim().toLowerCase();const availability=await rpc('crew_check_username',{p_username:username});if(availability.error)throw availability.error;if(!availability.data?.available)throw Error(availability.data?.message||'Username already taken.');const result=await api('profile','PATCH',{name:d.get('name'),bio:d.get('bio'),username,avatar_url:S.pendingAvatarUrl||S.user.avatar_url||null,banner_url:S.pendingBannerUrl||S.user.banner_url||null});S.pendingAvatarUrl=null;S.pendingBannerUrl=null;S.user={...S.user,...result,name:result.name||d.get('name'),bio:result.bio??d.get('bio')};S.view='profile';if(result._profileLimited)notice('Name saved. Apply the profile migration in Supabase to save bio and photo.');else notice('Profile updated.');await refresh();S.user={...S.user,...result};const profileResult=await rpc('crew_profile_social',{p_auth_id:S.user.auth_id});if(profileResult.error)throw profileResult.error;S.profileSocial=profileResult.data;celebrateSave();paint();});}else if(f.id==='eventForm'){e.preventDefault();const d=new FormData(f),eventId=String(d.get('eventId')||'').trim(),editing=!!eventId,button=f.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent=editing?'Saving changes…':'Publishing event…';}try{const payload={p_event_id:eventId||null,p_title:String(d.get('title')||'').trim(),p_description:String(d.get('description')||''),p_location:String(d.get('location')||''),p_starts_at:new Date(d.get('starts_at')).toISOString(),p_capacity:Number(d.get('capacity')),p_category:String(d.get('category')||'Community'),p_cover_url:String(d.get('cover_url')||''),p_featured:d.get('featured')==='true'};const {data,error}=await rpc('crew_event_save',payload);if(error)throw error;const id=String(data.id||eventId),previous=S.events.find(x=>String(x.id)===id)||{},updatedAt=data.updated_at||new Date().toISOString(),saved={...previous,id,title:payload.p_title,description:payload.p_description,location:payload.p_location,starts_at:payload.p_starts_at,capacity:payload.p_capacity,category:payload.p_category,cover_url:payload.p_cover_url,featured:payload.p_featured,updated_at:updatedAt,created_at:previous.created_at||updatedAt};if(editing)S.events=S.events.map(x=>String(x.id)===id?saved:x);else S.events=[...S.events,saved];S.selectedEvent=id;S.editingEventId=null;S.view=editing?'event-detail':'events';notice(editing?'Event updated. Members will see the latest details.':'Event published.');paint();try{await window.kcPush.send(editing?'Event updated: '+payload.p_title:'New crew event: '+payload.p_title,editing?'Event details have changed. Open the event to see the latest information.':payload.p_description||('Event at '+(payload.p_location||'location TBA')),'all');}catch(pushError){console.warn('Event saved; push delivery failed:',pushError);}refresh().catch(error=>console.warn('Background event refresh failed:',error));}catch(error){notice(error.message||'Could not save this event.');if(button){button.disabled=false;button.textContent=editing?'Save event changes':'＋ Publish event';}}}else if(f.id==='updateForm'){e.preventDefault();let d=new FormData(f);await action(async()=>{let a=await api('announcements','POST',{title:d.get('title'),body:d.get('body'),audience:d.get('audience')});S.view='updates';notice(a.message);try{const push=await window.kcPush.send(d.get('title'),d.get('body'),d.get('audience'));console.info('Push delivery:',push);}catch(pushError){console.warn('Announcement saved; push delivery failed:',pushError);}await refresh();});}else if(f.id==='verifyForm'||f.id==='attendanceOtpForm'){e.preventDefault();const d=new FormData(f),eventId=String(d.get('eventId')||S.rosterEvent||''),memberEmail=String(d.get('memberEmail')||'').trim(),code=String(d.get('code')||'').trim();if(!eventId||!memberEmail||!/^\\d{6}$/.test(code)){notice('Enter the event, member email and six-digit OTP.');return;}await action(async()=>{const result=await api('verify','POST',{eventId,memberEmail,code});S.rosterEvent=eventId;S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));notice(result.message||'OTP verified. Attendance marked present.');});}});
document.addEventListener('change',async e=>{if(e.target.matches('select[name="eventId"]')){S.rosterEvent=e.target.value;if(!S.rosterEvent){S.roster=null;paint();return;}await action(async()=>{S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});});}else if(e.target.id==='attendanceReportEventSelect'){S.attendanceReportEvent=e.target.value;paint();}else if(e.target.id==='rosterSelect'){S.rosterEvent=e.target.value;if(!S.rosterEvent){S.roster=null;paint();return;}await action(async()=>{S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});paint();});}else if(e.target.matches('.profile-admin-save')){const row=e.target.closest('[data-profile-row]');await action(async()=>{const {data,error}=await rpc('crew_manage_profile',{p_auth_id:row.dataset.profileRow,p_name:row.querySelector('[name="member_name"]').value,p_bio:row.querySelector('[name="member_bio"]').value});if(error)throw Error(error.message||'Could not update member profile.');notice('Member profile updated.');await refresh();});}else if(e.target.matches('.role-select')){await action(async()=>{let d=await api('role','PATCH',{authId:e.target.dataset.id,role:e.target.value});notice(d.message);await refresh();});}});
$('#app').addEventListener('change',e=>{if(e.target.id==='profilePhotoInput'&&e.target.files?.[0]){const img=$('#profilePhotoPreview');if(img)img.src=URL.createObjectURL(e.target.files[0]);}});$('#logoutProfile')?.addEventListener('click',()=>$('#logout').click());
async function performCrewSignOut(){
 if(!confirm('Sign out of Kinetic Crew on this device?'))return;
 try{await auth.signOut();}catch(error){notice(error.message||'Could not sign out. Please try again.');return;}
 S.user=null;S.events=[];S.announcements=[];S.members=[];
 try{sessionStorage.removeItem(PAGE_STATE_KEY);}catch{}
 location.replace(window.kcPath('login.html'));
}
$('#logout').addEventListener('click',performCrewSignOut);
document.addEventListener('click',event=>{if(event.target.closest('[data-kc-signout]'))performCrewSignOut();});

function setMobileMenu(open){
 const sidebar=$('#sidebar'),shade=$('#navShade'),toggle=$('#menuToggle');
 if(!sidebar||!shade)return;
 if(open&&$('#nav')&&!$('#nav').children.length&&typeof paint==='function')paint();
 sidebar.classList.toggle('open',!!open);shade.classList.toggle('open',!!open);
 sidebar.setAttribute('aria-hidden',open?'false':'true');
 sidebar.style.transform=open?'translate3d(0,0,0)':'translate3d(-110%,0,0)';
 sidebar.style.visibility=open?'visible':'hidden';
 sidebar.style.opacity=open?'1':'0';
 sidebar.style.pointerEvents=open?'auto':'none';
 shade.style.zIndex='19990';sidebar.style.zIndex='20000';
 if(toggle){toggle.setAttribute('aria-expanded',open?'true':'false');toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');}
 document.body.classList.toggle('kc-menu-open',!!open);
}
document.addEventListener('click',event=>{const toggle=event.target.closest('#menuToggle');if(!toggle)return;event.preventDefault();event.stopPropagation();go('more');});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#sidebar')?.classList.contains('open'))setMobileMenu(false);});
window.addEventListener('popstate',()=>{if($('#sidebar')?.classList.contains('open'))setMobileMenu(false);});
$('#nav')?.addEventListener('click',event=>{if(event.target.closest('[data-view]'))setMobileMenu(false);});

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
async function boot(){
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
  const session=result?.data?.session;
  const incomingProfile=new URLSearchParams(location.search).get('kc_profile');
  let pendingProfileId=incomingProfile||localStorage.getItem('kc_pending_profile')||'';
  if(incomingProfile){try{localStorage.setItem('kc_pending_profile',incomingProfile);}catch{}const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('kc_profile');history.replaceState({},'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);}
  if(!session||!session.user){location.replace(window.kcPath('login.html'));return;}
  rpc('crew_profile_login_touch',{}).catch(error=>console.warn('Could not record today’s profile login:',error));
  const saved=readPageState();
  const incomingShare=new URLSearchParams(location.search);
  if(incomingShare.has('share_target')){
   const raw=[incomingShare.get('url'),incomingShare.get('text'),incomingShare.get('title')].filter(Boolean).join(' ');
   const match=raw.match(/https:\/\/[^\s<>"']+/i);
   const sharedUrl=safeSocialUrl(match?.[0]||'');
   if(sharedUrl){S.sharedDraft={url:sharedUrl,caption:incomingShare.get('title')||''};S.view='feed';history.replaceState({},'',location.pathname);}
  }
  if(!pendingProfileId&&!S.sharedDraft&&saved&&(!saved.userId||saved.userId===(session.user.id||session.user.auth_id))){
   S.view=saved.view||'overview';S.selectedEvent=saved.selectedEvent||null;S.selectedProfileId=saved.selectedProfileId||null;S.navOpen=saved.navOpen||'overview';
  }
  try{
   await withTimeout(refresh(),15000,'Crew data is taking too long to load. Please retry.');
  }catch(error){
   if(!restoreOffline(session.user))throw error;
  }
  // Render the authenticated shell before optional community queries. A slow feed must
  // never hold the entire app on its launch screen.
  paint();
  seedAnnouncementNotifications();
  startCrewNotificationPolling();
  loadSocialFeed().then(()=>{if(S.view==='overview'||S.view==='feed'||S.view==='fun-zone'||S.view==='memes')paint();})
   .catch(error=>console.warn('Home stories unavailable:',error));
  if(saved&&S.view!=='overview'){
   const target=S.view;
   go(target).catch(error=>{console.warn('Saved page restore failed:',error);S.view='overview';paint();});
  }

  if(pendingProfileId){try{localStorage.removeItem('kc_pending_profile');}catch{}S.selectedProfileId=pendingProfileId;await go('public-profile');}
  else if(saved&&(!saved.userId||saved.userId===(session.user.id||session.user.auth_id)))restorePageScroll(saved);
  else savePageState();
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
window.addEventListener('online',()=>{if(S.user)refresh().then(()=>notice('Connection restored. Crew data refreshed.')).catch(e=>{S.error=e.message||'Could not refresh crew data.';paint();});});
window.addEventListener('offline',()=>{if(S.user){S.offline=true;S.error='You are offline. Showing the last available crew information.';paint();}});
window.addEventListener('error',event=>{console.error('Kinetic Crew runtime error:',event.error||event.message);});
window.addEventListener('unhandledrejection',event=>{console.error('Kinetic Crew async error:',event.reason);});

let installPrompt=null;
let installCompleted=window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
function syncInstallButtons(){document.querySelectorAll('[data-kc-install]').forEach(button=>{button.disabled=installCompleted;button.textContent=installCompleted?'✓ App installed':'↓ Install app';button.setAttribute('aria-label',installCompleted?'Kinetic Crew is installed':'Install Kinetic Crew');});}
function showInstallHelp(){
 const root=$('#modalRoot');if(!root)return;
 root.innerHTML='<div class="kc-install-backdrop" data-install-close><section class="kc-install-dialog" role="dialog" aria-modal="true" aria-labelledby="kcInstallTitle"><button class="kc-install-close" type="button" data-install-close aria-label="Close">×</button><span class="kc-install-icon">↓</span><h2 id="kcInstallTitle">Install Kinetic Crew</h2><p>Chrome has not offered the one-tap install prompt yet. You can still install the app:</p><ol><li>Open the Chrome <b>⋮</b> menu.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm <b>Install</b>.</li></ol><button type="button" class="primary" data-install-close>Got it</button></section></div>';
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;syncInstallButtons();});
window.addEventListener('appinstalled',()=>{installPrompt=null;installCompleted=true;syncInstallButtons();notice('Kinetic Crew is installed on your device.');});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-kc-install]');if(!button)return;
 event.preventDefault();event.stopPropagation();
 if(installCompleted){notice('Kinetic Crew is already installed.');return;}
 if(!installPrompt){showInstallHelp();return;}
 const promptEvent=installPrompt;installPrompt=null;
 try{const promptResult=promptEvent.prompt();setMobileMenu(false);await promptResult;const choice=await promptEvent.userChoice;if(choice?.outcome==='accepted'){installCompleted=true;notice('Kinetic Crew installation started.');}else notice('Installation was cancelled. You can install it later from this menu.');}
 catch(error){showInstallHelp();}
 syncInstallButtons();
});
document.addEventListener('click',event=>{if(event.target.closest('[data-install-close]'))$('#modalRoot').innerHTML='';});
syncInstallButtons();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(window.kcPath('sw.js'),{scope:window.kcPath('')}).catch(()=>{}));
boot().finally(()=>{});
})();