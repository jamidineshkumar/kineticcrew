(() => {
'use strict';
const client=window.kcSupabase, auth=client&&client.auth, $=s=>document.querySelector(s);
window.KC_APP_VERSION='1.2.5';
const S={user:null,view:'overview',navOpen:'overview',selectedEvent:null,events:[],announcements:[],members:[],publicMembers:[],featureItems:{},socialPosts:[],socialLikes:[],socialComments:[],roster:null,rosterEvent:'',attendanceAudit:[],attendanceQuery:'',error:'',peopleQuery:''};
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
const admin=()=>S.user&&S.user.role!=='member', superadmin=()=>S.user&&S.user.role==='super_admin';
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
const FEATURE_ALIASES={'leave request':'leave','leave requests':'leave','kc memories':'memories','audition portal':'auditions','polls & voting':'polls','crew chat':'chat','crew expenses':'expenses','crew achievements':'achievements','crew rehearsals':'rehearsals'};
function normalizeFeatureKey(value,payload){
 const raw=String(value??payload?.feature??'').trim().toLowerCase();
 return FEATURE_ALIASES[raw]||raw.replace(/\s+/g,'_');
}
async function featureApi(action,feature,payload){
 const operation=String(action||'').trim().toLowerCase(),cleanPayload=payload&&typeof payload==='object'?payload:{};
 const requested=normalizeFeatureKey(feature,cleanPayload);
 if(operation!=='leaderboard'&&!featureKeys.includes(requested))throw Error('Unsupported crew feature requested: '+String(feature??cleanPayload.feature??'(empty)')+'. Please reload Kinetic Crew and try again.');
 const {data,error}=await rpc('crew_features',{p_action:operation,p_feature:operation==='leaderboard'?null:requested,p_payload:cleanPayload});
 if(error){const m=error.message||'Feature request failed.';if(/could not find the function|schema cache/i.test(m))throw Error('The crew feature service is not ready. Reload the app; if this continues, contact the Super Admin.');throw Error(m);}
 return data;
}
function notice(text){const t=$('#toast');if(!t){console.warn('Kinetic Crew toast container is missing:',text);return;}t.textContent=String(text??'');t.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.remove('show'),3000);}
function cacheKey(userId){return 'kc-bootstrap-v2:'+userId;}
function paintUser(){if(!S.user)return;const name=$('#profileName'),userRole=$('#profileRole'),avatar=$('#avatar'),topAvatar=$('#topAvatar');if(name)name.textContent=S.user.name||S.user.email||'Crew Member';if(userRole)userRole.textContent=role(S.user.role);if(avatar)avatar.innerHTML=avatarMarkup(S.user);if(topAvatar)topAvatar.innerHTML=avatarMarkup(S.user,'small');}
async function refresh(){
 const results=await Promise.all([api('bootstrap'),rpc('crew_get_app_settings',{}).catch(error=>({error}))]);
 const d=results[0],cfg=results[1];
 S.user=d.user;S.events=d.events||[];S.announcements=d.announcements||[];S.members=d.members||[];
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
function welcome(title,sub,action=''){return '<div class="welcome"><div><div class="eyebrow"><span class="eyedot"></span>'+role(S.user.role).toUpperCase()+' SPACE <span class="muted">/</span> KINETIC CREW</div><h1>'+title+'</h1><p>'+sub+'</p></div>'+action+'</div>';}
function section(title,sub,act=''){return '<div class="sectionhead"><div><h2>'+title+'</h2><p>'+sub+'</p></div>'+act+'</div>';}
function empty(title,sub){return '<div class="empty"><div class="emptyicon">✳</div><b>'+title+'</b><p>'+sub+'</p></div>';}
function stat(title,value,foot,ico){return '<div class="stat"><div class="statlabel"><span>'+title+'</span><span>'+ico+'</span></div><b class="statvalue">'+value+'</b><small>'+foot+'</small></div>';}

document.addEventListener('error',event=>{
 const img=event.target;
 if(!(img instanceof HTMLImageElement))return;
 if(img.classList.contains('brand-logo')){
  if(img.dataset.kcFallback!=='yes'){img.dataset.kcFallback='yes';img.src=window.kcPath('kinetic-crew-logo.jpg');}
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
function brandMarkMarkup(extra=''){return '<img class="kc-brand-mark '+extra+'" src="'+window.kcPath('kinetic-crew-logo.jpg')+'" alt="Kinetic Crew" loading="eager" decoding="async">';}
function avatarMarkup(user,size='') {const src=user?.avatar_url;return src?'<img class="avatar-photo '+size+'" data-fallback="'+esc(initials(user?.name||user?.email))+'" src="'+esc(src)+'" alt="'+esc(user.name||'Crew member')+'">':'<span class="avatar-fallback '+size+'">'+esc(initials(user?.name||user?.email))+'</span>';}
function profileCover(url){return url?' style="background-image:url(&quot;'+esc(url)+'&quot;)':'';}
function profilePage(){
const u=S.user||{},social=S.profileSocial||{},founder=superadmin(),docs=Array.isArray(S.profileDocuments)?S.profileDocuments:[],events=Array.isArray(S.events)?S.events:[],gigs=Array.isArray(S.featureItems?.gigs)?S.featureItems.gigs:[];
const followers=Number(social.followers_count||0),following=Number(social.following_count||0),attended=events.filter(e=>e.attended===true||e.attendance_status==='present').length,completedGigs=gigs.filter(g=>/completed|complete|done/i.test(String(g.status||g.state||''))).length;
const rawDob=u.date_of_birth||u.dob||u.birth_date||'',age=Number.isFinite(Number(u.age))&&u.age!==''?Number(u.age):(rawDob?Math.max(0,Math.floor((Date.now()-new Date(rawDob).getTime())/31557600000)):null);
const gender=String(u.gender||'').toLowerCase(),genderMark=/^(male|m)$/.test(gender)?'M':/^(female|f)$/.test(gender)?'F':'';
const meta=[age!==null&&!Number.isNaN(age)?age+'Y':'',genderMark].filter(Boolean).join('');
const photo=u.avatar_url||'',banner=u.banner_url||photo,job=u.profession||u.designation||u.occupation||u.job_title||(founder?'Founder & President':'Kinetic Crew Member');
const doc=(type)=>docs.find(x=>x.document_type===type);
const documentCard=(type,title,description)=>{const saved=doc(type);return '<article class="kc-profile-document"><div class="kc-profile-document-copy"><b>'+title+'</b><small>'+(saved?esc(saved.file_name):description)+'</small><span>PDF, DOC or DOCX · Max 10 MB</span><div class="kc-profile-document-actions">'+(saved?'<button type="button" data-doc-view="'+type+'">View file</button><button type="button" data-doc-select="'+type+'">Replace</button>':'<button type="button" data-doc-select="'+type+'">Upload</button>')+'</div></div><div class="kc-profile-document-art">'+(type==='resume'?'▤':'✉')+'</div><input type="file" hidden id="doc-'+type+'" data-doc-input="'+type+'" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></article>';};
const editForm='<details class="kc-profile-editor" id="profileEditor"><form id="profileForm" class="kc-profile-form">'+
'<label class="field">Full name<input name="name" maxlength="100" required value="'+esc(u.name||'')+'"></label>'+
'<label class="field">About you<textarea name="bio" maxlength="500" rows="3">'+esc(u.bio||'')+'</textarea></label>'+
'<label class="field">Email address<input value="'+esc(u.email||'')+'" disabled></label>'+
'<label class="field">Username<input name="username" id="profileUsername" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="'+esc(u.username||'')+'" placeholder="your_username" required></label>'+
'<div class="kc-profile-upload-row"><label for="profilePhotoInput">Profile photo<input id="profilePhotoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><label for="profileBannerInput">Cover photo<input id="profileBannerInput" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>'+
'<p class="hint">JPG, PNG or WebP · Maximum 5 MB each.</p><button class="primary full">Save profile</button><button type="button" class="outline full" id="logoutProfile">Sign out ↗</button></form></details>';
const adminPanel=founder?'<section class="kc-founder-console"><div class="kc-profile-section-title"><span>FOUNDER ACCESS</span><h2>Super Admin Command Center</h2><p>Privileged tools are available only to the Super Admin account.</p></div><div class="kc-founder-tools"><button data-view="crew-management"><span>♙</span><b>Manage crew</b><small>Members & roles</small></button><button data-view="attendance"><span>◎</span><b>Attendance</b><small>Verify member check-ins</small></button><button data-view="events"><span>▦</span><b>Manage events</b><small>Sessions & registrations</small></button><button data-view="updates"><span>✦</span><b>Announcements</b><small>Pin crew updates</small></button><button data-view="settings"><span>⚙</span><b>App settings</b><small>Platform controls</small></button></div></section>':'';
const founderStory=founder?'<section class="kc-founder-story"><span>THE FOUNDER’S NOTE</span><h2>Building more than a crew.</h2><p>'+esc(u.bio||'Kinetic Crew is a space to create, perform, grow and move forward together. Built with the crew, for the crew.')+'</p><div class="kc-founder-glow"></div></section><section class="kc-founder-featured"><div class="kc-profile-section-title"><span>PINNED FOR THE CREW</span><h2>Founder updates</h2></div>'+(S.announcements||[]).slice(0,2).map(announcement).join('')+'</section>':'';
return '<div class="kc-reference-profile '+(founder?'is-founder':'')+'"><section class="kc-profile-hero" '+(banner?'style="--kc-profile-cover:url(\''+esc(banner)+'\')"':'')+'>'+
'<div class="kc-profile-hero-actions"><button class="kc-profile-back" data-view="overview" aria-label="Back home">‹</button><div class="kc-profile-hero-right"><button class="kc-profile-share-button" type="button" data-share-profile aria-label="Share profile">↗</button><button class="kc-profile-edit-button" data-profile-edit>Edit profile</button></div></div>'+
'<div class="kc-profile-identity"><h1>'+esc(u.name||'Kinetic Crew Member').toUpperCase()+'</h1><p>@'+esc(u.username||String(u.email||'crew-member').split('@')[0])+(meta?' <span>·</span> '+esc(meta):'')+'</p><span class="kc-profile-role">'+(founder?'FOUNDER / SUPER ADMIN':esc(String(job).toUpperCase()))+'</span></div>'+
(founder?'<div class="kc-founder-emblem"><span>✦</span><b>FOUNDING<br>LEADERSHIP</b></div>':'')+'</section>'+
'<section class="kc-profile-metrics"><button type="button" data-view="people"><span class="kc-profile-metric-icon">♧</span><b>'+followers+'</b><span>Connections</span></button><article><span class="kc-profile-metric-icon">♟</span><b>—</b><span>Tribes <i>COMING SOON</i></span></article></section>'+
'<section class="kc-profile-documents">'+documentCard('resume','Resume','Tap to manage your resume')+documentCard('cover_letter','Cover Letter','Tap to manage your cover letter')+'</section>'+
'<section class="kc-profile-metrics kc-profile-metrics-bottom"><article><span class="kc-profile-metric-icon">✦</span><b>'+completedGigs+'</b><span>Gigs completed</span></article><button type="button" data-view="events"><span class="kc-profile-metric-icon">▣</span><b>'+attended+'</b><span>Events attended</span></button></section>'+
(founder?'<section class="kc-founder-stats"><div><b>'+Number(S.members?.length||0)+'</b><span>Crew members</span></div><div><b>'+events.length+'</b><span>Events created</span></div><div><b>'+followers+'</b><span>Connections</span></div></section>':'')+
founderStory+adminPanel+editForm+'</div>';
}function publicProfilePage(){
 const p=S.profileSocial?.profile;
 if(!p)return empty('Profile unavailable','This crew profile could not be loaded.');
 const self=String(p.auth_id)===String(S.user?.auth_id);
 const founder=p.role==='super_admin';
 return '<button class="backlink" data-view="people">← Back to crew</button>'+
 '<section class="surface kc-public-member-card">'+
 '<div class="kc-public-member-head">'+
 (p.avatar_url?'<img class="kc-public-member-avatar" src="'+esc(p.avatar_url)+'" alt="Profile photo">':'<span class="kc-public-member-avatar">'+esc(initials(p.name||p.email))+'</span>')+
 '<div class="kc-public-member-name"><h2>'+esc(p.name||'Kinetic Crew Member')+'</h2><p>@'+esc(p.username||'crew-member')+'</p></div>'+
 '<span class="kc-public-member-role">'+(founder?'SUPER ADMIN':esc(role(p.role).toUpperCase()))+'</span>'+
 '</div>'+
 '<div class="kc-public-member-body"><p>'+esc(p.bio||'Kinetic Crew member.')+'</p>'+
 (self?'<button class="primary" data-view="profile">Edit profile</button>':'')+
 '</div></section>';
}
function legacyPeoplePage(){const people=S.publicMembers||[];return welcome('Discover the crew','Find your people, open their profiles and follow their journey.')+'<div class="profile-directory">'+(people.length?people.map(m=>'<article class="surface crew-profile-tile"><button class="crew-profile-open" data-open-profile="'+esc(m.auth_id)+'">'+avatarMarkup(m)+'<span><b>'+esc(m.name)+'</b><small>@'+esc(m.username||'crew-member')+'</small></span></button><p>'+esc(m.bio||'Kinetic Crew member')+'</p><div class="crew-profile-stats"><b>'+Number(m.followers_count||0)+' followers</b><span>'+esc(role(m.role))+'</span></div><button class="outline full" data-open-profile="'+esc(m.auth_id)+'">View profile</button></article>').join(''):empty('No crew profiles yet','Crew members will appear here once they have signed in.'))+'</div>';}
function readKey(){return 'kc-read-notices:'+String(S.user?.id||S.user?.auth_id||'guest');}
function prefsKey(){return 'kc-notification-prefs:'+String(S.user?.auth_id||S.user?.id||'guest');}
function notificationPrefs(){try{return {sound:true,push:localStorage.getItem('kc-push-enabled')==='yes',...JSON.parse(localStorage.getItem(prefsKey())||'{}')}}catch{return {sound:true,push:false}}}
function saveNotificationPrefs(patch){const next={...notificationPrefs(),...patch};localStorage.setItem(prefsKey(),JSON.stringify(next));return next;}
function isRead(id){try{return JSON.parse(localStorage.getItem(readKey())||'[]').includes(id)}catch{return false}}
function markRead(id){const ids=new Set(JSON.parse(localStorage.getItem(readKey())||'[]'));ids.add(id);localStorage.setItem(readKey(),JSON.stringify([...ids]));}
function unread(){return S.announcements.filter(a=>!isRead(a.id)).length}
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
async function pollCrewNotifications(){
 if(!S.user||document.hidden||!navigator.onLine)return;
 try{
  const data=await api('bootstrap');
  const rows=Array.isArray(data.announcements)?data.announcements:[];
  if(kcKnownAnnouncementIds===null){kcKnownAnnouncementIds=new Set(rows.map(a=>String(a.id)));S.announcements=rows;return;}
  const incoming=rows.filter(a=>!kcKnownAnnouncementIds.has(String(a.id)));
  rows.forEach(a=>kcKnownAnnouncementIds.add(String(a.id)));
  if(!incoming.length)return;
  S.announcements=rows;
  const latest=incoming[0];
  window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:latest.title||'Crew update',body:latest.body||'A new update was posted.',target:'notifications'}}));
  if(S.view==='notifications')paint();
 }catch(error){console.warn('Crew notification sync failed:',error);}
}
function startCrewNotificationPolling(){
 if(kcAnnouncementPoll)clearInterval(kcAnnouncementPoll);
 kcAnnouncementPoll=setInterval(pollCrewNotifications,25000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollCrewNotifications();});
}
function playNoticeSound(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),now=ctx.currentTime;[660,880].forEach((hz,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,now+i*.12);gain.gain.exponentialRampToValueAtTime(.11,now+i*.12+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.12+.22);osc.connect(gain);gain.connect(ctx.destination);osc.start(now+i*.12);osc.stop(now+i*.12+.24);});setTimeout(()=>ctx.close(),700);}catch{}}
function notificationCard(a){const read=isRead(a.id);return '<article class="notification-item '+(read?'read':'unread')+'" data-notice-id="'+esc(a.id)+'"><span class="notification-icon">'+(read?'✓':'✦')+'</span><div class="notification-copy"><div class="announce-meta"><b>CREW UPDATE</b><span>·</span><span>'+esc(dt(a.created_at))+'</span><span class="notice-state">'+(read?'READ':'NEW')+'</span></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.body)+'</p><small>From '+esc(a.author_name||'Kinetic Crew Admin')+'</small></div><button class="notice-read-button" data-read-notice="'+esc(a.id)+'" aria-label="'+(read?'Already read':'Mark as read')+'" '+(read?'disabled':'')+'>'+(read?'✓':'Mark read')+'</button>'+(superadmin()?'<button class="notice-delete-button" data-delete-announcement="'+esc(a.id)+'" aria-label="Delete crew update">×</button>':'')+'</article>';}
function notificationsPage(){
 const prefs=notificationPrefs(),filter=S.noticeFilter||'all',query=(S.noticeQuery||'').trim().toLowerCase();
 const filtered=S.announcements.filter(a=>(filter==='all'||(filter==='unread'&&!isRead(a.id)))&&(!query||(String(a.title||'')+' '+String(a.body||'')+' '+String(a.author_name||'')).toLowerCase().includes(query)));
 return welcome('Your notifications','All the important moments from your crew, in one place.')+
 '<section class="notice-hero"><div class="notice-hero-copy"><span class="notice-kicker">KINETIC CREW / INBOX</span><h2>'+unread()+' <em>new</em> updates</h2><p>Stay close to rehearsals, events and everything happening in the crew.</p></div><div class="notice-orbit"><span>✳</span><i></i><b></b></div></section>'+
 '<section class="notice-controls"><div class="notice-tabs"><button data-notice-filter="all" class="'+(filter==='all'?'active':'')+'">All <span>'+S.announcements.length+'</span></button><button data-notice-filter="unread" class="'+(filter==='unread'?'active':'')+'">Unread <span>'+unread()+'</span></button></div><div class="notice-actions"><input id="noticeSearch" type="search" placeholder="Search notifications…" value="'+esc(S.noticeQuery||'')+'"><button class="outline" id="markAllRead" '+(unread()?'':'disabled')+'>Mark all read</button></div></section>'+
 '<section class="notice-layout"><div class="notice-feed"><div class="notice-feed-head"><div><b>Activity</b><small>'+filtered.length+' updates</small></div><span class="notice-live"><i></i> CREW FEED</span></div>'+
 (filtered.length?filtered.map(notificationCard).join(''):empty(query?'No matching updates':'You are all caught up',query?'Try a different search.':'New crew announcements will appear here.'))+'</div>'+
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
function eventDetailPage(){const e=S.events.find(x=>String(x.id)===String(S.selectedEvent));if(!e)return eventsPage();const act=e.attended?'<span class="pill">✓ Attendance marked</span>':e.registered?'<div class="event-pass-actions"><button class="outline" data-otp="'+esc(e.id)+'">Get event OTP</button><button class="primary" data-event-qr="'+esc(e.id)+'">Show event QR</button></div>':'<button class="primary" data-register="'+esc(e.id)+'">Register for this event →</button>';return '<button class="backlink" data-view="events">← Back to all events</button><div class="event-detail"><div class="event-detail-hero"><div class="eventtype"><i></i>'+ (new Date(e.starts_at)>new Date()?'UPCOMING EVENT':'CREW EVENT')+'</div>'+brandMarkMarkup('detail-brand-logo')+'<h1>'+esc(e.title)+'</h1><p>'+esc(e.description||'Join the crew for this event.')+'</p></div><div class="event-detail-grid"><section class="surface detail-main"><h2>Event details</h2><div class="detail-facts"><div><small>DATE & TIME</small><b>'+esc(dt(e.starts_at))+'</b></div><div><small>LOCATION</small><b>'+esc(e.location||'To be announced')+'</b></div><div><small>REGISTRATIONS</small><b>'+Number(e.registration_count||0)+' / '+Number(e.capacity||0)+'</b></div><div><small>YOUR STATUS</small><b>'+(e.attended?'Attended':e.registered?'Registered':'Not registered')+'</b></div></div><h3>About this event</h3><p class="detail-description">'+esc(e.description||'More event information will be shared by the crew admins.')+'</p></section><aside class="surface detail-action"><h2>Join this event</h2><p>'+(e.registered?'You are on the guest list. Your event check-in pass is available below.':'Register to reserve your place. After registering, your event-specific OTP and QR pass will appear here.')+'</p>'+act+'</aside></div>'+(admin()?'<div class="detail-admin"><button class="outline danger-link" data-delete-event="'+esc(e.id)+'">Delete event</button></div>':'')+'</div>';}
function announcement(a){return '<article class="announcement"><div class="announceicon">♧</div><div class="announcebody"><div class="announce-meta"><b>CREW SIGNAL</b><span>·</span><span>'+esc(dt(a.created_at))+'</span></div><h3>'+esc(a.title)+'</h3><p>'+esc(a.body)+'</p><div class="author">Posted by <b>'+esc(a.author_name||'Crew Admin')+'</b></div></div>'+(superadmin()?'<button type="button" class="textlink danger-link" data-delete-announcement="'+esc(a.id)+'">Delete</button>':'')+'</article>';}
function formTitle(icon,title,sub){return '<div class="formtitle"><div class="formicon">'+icon+'</div><div><h3>'+title+'</h3><p>'+sub+'</p></div></div>';}
function eventForm(){return '<form id="eventForm" class="surface formgrid">'+formTitle('＋','Create an event','Put the next crew moment on the calendar.')+'<label class="field">Event name<input name="title" maxlength="120" required placeholder="Freshers Showcase"></label><label class="field">Location<input name="location" maxlength="160" placeholder="Dance studio / auditorium"></label><label class="field">Date & time<input name="starts_at" type="datetime-local" required></label><label class="field">Capacity<input name="capacity" type="number" min="1" max="10000" value="40" required></label><label class="field span2">Description<textarea name="description" rows="3" maxlength="2500" placeholder="What should members know?"></textarea></label><button class="primary">＋ Publish event</button></form>';}
function updateForm(){return '<form id="updateForm" class="surface publish">'+formTitle('♧','Broadcast a message','Send the crew a clear signal.')+'<label class="field">Headline<input name="title" maxlength="140" required placeholder="What is the update?"></label><label class="field">Message<textarea name="body" rows="5" maxlength="5000" required placeholder="Share the details…"></textarea></label><label class="field">Audience<select name="audience"><option value="all">Everyone</option><option value="member">Members</option><option value="admin">Admins</option><option value="super_admin">Super admins</option></select></label><button class="primary full">Publish update →</button><div class="notice">Announcements appear in Crew HQ. Push notifications when the app is closed require a separate delivery setup.</div></form>';}
function home(){
 const rows=Array.isArray(S.events)?S.events:[];
 const dateOf=e=>{const n=new Date(e?.starts_at||e?.start_at||e?.date||'').getTime();return Number.isFinite(n)?n:null;};
 const isRegistered=e=>e?.registered===true||e?.is_registered===true||String(e?.registration_status||'').toLowerCase()==='registered';
 const isAttended=e=>e?.attended===true||e?.attendance_status==='present'||e?.attendance_status==='attended'||e?.checked_in===true;
 const all=rows.slice().sort((a,b)=>(dateOf(a)??Infinity)-(dateOf(b)??Infinity));
 const now=Date.now(),upcoming=all.filter(e=>dateOf(e)!==null&&dateOf(e)>=now);
 const registered=upcoming.filter(isRegistered),attended=all.filter(isAttended);
 const u=S.user||{},name=(u.name||u.email||'Crew member').split('@')[0].split(' ')[0];
 const rehearsals=upcoming.filter(e=>/rehearsal|practice/i.test((e.title||'')+' '+(e.category||e.type||'')));
 const eventImage=e=>e?.cover_url||e?.image_url||e?.banner_url||e?.poster_url||e?.image||'';
 const tile=e=>'<button type="button" class="kc-home-event" data-open-event="'+esc(e.id)+'" aria-label="Open event '+esc(e.title||'Crew event')+'"><span class="kc-home-event-art" '+(eventImage(e)?'style="background-image:url(\''+esc(eventImage(e))+'\')"' :'')+'><em>UPCOMING</em></span><span><b>'+esc(e.title||'Crew event')+'</b><small>'+esc(dt(e.starts_at||e.start_at||e.date))+' · '+esc(e.location||'Location TBA')+'</small></span></button>';
 const featured=registered[0]||upcoming[0]||null;
 const featuredMarkup=featured?'<article class="kc-home-featured"><div class="kc-home-featured-art" '+(eventImage(featured)?'style="background-image:url(\''+esc(eventImage(featured))+'\')"' :'')+'><span>'+(isRegistered(featured)?'YOU’RE GOING':'NEXT CREW MOMENT')+'</span></div><div class="kc-home-featured-copy"><small>UP NEXT</small><h3>'+esc(featured.title||'Crew event')+'</h3><p>'+esc(dt(featured.starts_at||featured.start_at||featured.date))+' · '+esc(featured.location||'Location TBA')+'</p><div><button type="button" data-open-event="'+esc(featured.id)+'">View event</button><button type="button" data-view="events">All events</button></div></div></article>':'<div class="kc-home-empty"><b>No upcoming events yet.</b><br>Your next crew moment will appear here.<br><button type="button" data-view="events">Explore events →</button></div>';
 const notices=(Array.isArray(S.announcements)?S.announcements:[]).slice(0,2);
 const posts=(Array.isArray(S.socialPosts)?S.socialPosts:[]).slice(0,3);
 const activityItems=[
  ...notices.map(a=>({kind:'announcement',time:new Date(a.created_at||0).getTime()||0,data:a})),
  ...posts.map(p=>({kind:'post',time:new Date(p.created_at||0).getTime()||0,data:p}))
 ].sort((a,b)=>b.time-a.time).slice(0,4);
 const activity=activityItems.length?activityItems.map(item=>{
  const a=item.data;
  if(item.kind==='announcement')return '<article class="kc-home-activity"><span>✦</span><div><b>'+esc(a.title||'Crew announcement')+'</b><p>'+esc(a.body||'')+'</p><small>'+esc(a.author_name||'Kinetic Crew')+' · '+esc(dt(a.created_at))+'</small></div></article>';
  const author=(S.publicMembers||[]).find(m=>String(m.auth_id)===String(a.author_id));
  return '<article class="kc-home-activity"><span>◉</span><div><b>'+esc(author?.name||a.author_name||'Crew member')+' shared a moment</b><p>'+esc(a.caption||'A new post is waiting in the crew feed.')+'</p><small>'+esc(dt(a.created_at))+'</small></div><button type="button" data-view="feed">View</button></article>';
 }).join(''):'<div class="kc-home-empty">Recent crew activity will appear here.</div>';
 const people=(Array.isArray(S.publicMembers)?S.publicMembers:[]).filter(m=>String(m.auth_id)!==String(u.auth_id)).slice(0,12);
 const storyPeople=people.length?people.map((p,i)=>'<button type="button" class="kc-home-story" data-open-profile="'+esc(p.auth_id)+'"><span class="kc-home-story-ring '+(i<5?'fresh':'')+'">'+avatarMarkup(p)+'</span><b>'+esc((p.name||'Crew member').split(' ')[0])+'</b><small>'+esc(p.username?'@'+p.username:'Kinetic Crew')+'</small></button>').join(''):'<button type="button" class="kc-home-story kc-home-story-add" data-view="people"><span class="kc-home-story-ring">＋</span><b>Discover crew</b><small>Find your people</small></button>';
 return '<div class="kc-vibe-home kc-home-planned">'+
 '<header class="kc-vibe-top kc-home-top"><div class="kc-vibe-greeting"><span>KINETIC CREW</span><h1>What’s happening, '+esc(name)+'?</h1><p>Your crew. Your moments. Everything in one place.</p></div></header>'+
 '<section class="kc-home-section"><div class="kc-home-section-head"><div><small>STAY IN THE LOOP</small><h2>Announcements</h2></div><button type="button" data-view="notifications">View all ↗</button></div><div class="kc-home-announcements">'+(notices.length?notices.map(announcement).join(''):'<div class="kc-home-empty">Crew announcements will appear here.</div>')+'</div></section>'+
 '<section class="kc-home-section"><div class="kc-home-section-head"><div><small>MAKE THE NEXT MOMENT COUNT</small><h2>Upcoming events</h2></div><button type="button" data-view="events">All events ↗</button></div>'+featuredMarkup+'<div class="kc-home-event-row">'+(upcoming.filter(e=>String(e.id)!==String(featured?.id)).slice(0,4).map(tile).join(''))+'</div></section>'+
 '<section class="kc-home-section"><div class="kc-home-section-head"><div><small>SHOW UP. MOVE TOGETHER.</small><h2>Attendance summary</h2></div><button type="button" data-view="events">My events ↗</button></div><div class="kc-home-stats"><article><b>'+registered.length+'</b><span>Upcoming registrations</span></article><article><b>'+attended.length+'</b><span>Events attended</span></article><article><b>'+all.length+'</b><span>Total crew events</span></article></div></section>'+
 '<section class="kc-home-section"><div class="kc-home-section-head"><div><small>TRAIN FOR THE STAGE</small><h2>Rehearsals</h2></div><button type="button" data-view="rehearsals">View rehearsals ↗</button></div><div class="kc-home-event-row">'+(rehearsals.length?rehearsals.slice(0,4).map(tile).join(''):'<div class="kc-home-empty">New rehearsal schedules will appear here when published.</div>')+'</div></section>'+
 '<section class="kc-home-section"><div class="kc-home-section-head"><div><small>YOUR CREW, IN MOTION</small><h2>Stories & moments</h2></div><button type="button" data-view="feed">Explore feed ↗</button></div><div class="kc-home-stories">'+storyPeople+'</div></section>'+
 '<section class="kc-home-section"><div class="kc-home-section-head"><div><small>FRESH FROM THE CREW</small><h2>Recent activity</h2></div><button type="button" data-view="notifications">All activity ↗</button></div><div class="kc-home-activity-list">'+activity+'</div></section>'+
 '<section class="kc-home-bottom"><span>KINETIC CREW · YOUR PEOPLE, YOUR MOVEMENT</span><b>Make moments. Move as one.</b></section></div>';
}
function morePage(){
const u=S.user||{},coin='✦',isAdmin=admin();
const shortcut=(view,icon,label,sub)=>'<button class="kc-more-shortcut" data-view="'+view+'"><span class="kc-more-icon">'+icon+'</span><b>'+label+'</b><small>'+sub+'</small><i>›</i></button>';
return '<div class="kc-more-page"><header class="kc-more-header"><button class="kc-more-back" data-view="overview" aria-label="Back to home">‹</button><h1>More</h1><span class="kc-more-spacer"></span><button class="kc-more-profile" data-view="profile" aria-label="Open profile">'+avatarMarkup(u,'small')+'</button></header>'+
'<section class="kc-more-banner"><div class="kc-more-banner-copy"><span>KINETIC CREW · '+esc(role(u.role).toUpperCase())+'</span><h2>One crew.<br>Many moments.</h2><p>Find events, connect with members, and keep your crew moving.</p><button data-view="events">Explore events ↗</button></div><div class="kc-more-banner-mark">'+coin+'</div></section>'+
'<section class="kc-more-group"><h2>My Crew</h2><div class="kc-more-grid">'+
shortcut('events','▣','My Events','Registrations & sessions')+
shortcut('people','♧','My Connections','Find crew members')+
shortcut('feed','◉','Crew Feed','Posts & updates')+
shortcut('chat','✉','Crew Chat','Talk with your crew')+
shortcut('memories','▧','KC Memories','Shared moments')+
shortcut('rehearsals','◷','Rehearsals','Practice sessions')+
shortcut('auditions','✦','Auditions','Join the crew')+
(isAdmin?shortcut('attendance','◎','Attendance','Member check-in'): '')+
'</div></section>'+
'<section class="kc-more-group kc-more-others"><h2>Others</h2>'+
'<button class="kc-more-row" data-view="notifications"><span>♧</span><b>Notifications</b><i>›</i></button>'+
'<button class="kc-more-row" data-view="settings"><span>⚙</span><b>Settings & Help</b><i>›</i></button>'+
'<a class="kc-more-row" href="https://github.com/jamidineshkumar/kineticcrew/issues" target="_blank" rel="noopener"><span>▤</span><b>Report a Bug</b><i>↗</i></a>'+
'<button class="kc-more-row" data-view="credits"><span>✧</span><b>About Kinetic Crew</b><i>›</i></button>'+
'</section></div>';
}function eventsPage(){return welcome('Events & registrations','The next moment is waiting. Find your event and lock in.',admin()?button('＋ New event','new-event'):'')+(admin()?eventForm():'')+section('Upcoming moments','Register once. Show up ready.','<span class="pill">'+S.events.length+' EVENTS</span>')+'<div class="eventgrid">'+(S.events.map(card).join('')||empty('No events yet','A crew admin can publish the first event here.'))+'</div>';}
function updatesPage(){return welcome('Crew updates','Announcements, changes, and the latest from your people.',admin()?button('＋ New update','new-update'):'')+'<div class="twoCol"><div class="announcements">'+(S.announcements.map(announcement).join('')||empty('It is quiet in here','Updates will appear here when published.'))+'</div>'+(superadmin()?updateForm():'')+'</div>';}
function rosterRows(rows){const query=String(S.attendanceQuery||'').trim().toLowerCase(),filtered=(rows||[]).filter(m=>!query||(String(m.name||'')+' '+String(m.email||'')).toLowerCase().includes(query));return filtered.length?filtered.map(m=>{const status=m.status||(m.attended?'present':'pending'),label=status==='not_attending'?'Not attending':status==='present'?'Present':status==='absent'?'Absent':'Pending';return '<div class="rosterrow attendance-rosterrow"><div class="avatar">'+esc(initials(m.name))+'</div><div class="rosterperson"><b>'+esc(m.name)+'</b><small>'+esc(m.email)+'</small><span class="status '+esc(status)+'">'+label+'</span></div><div class="attendance-status-actions">'+[['present','Present'],['absent','Absent'],['not_attending','Not attending'],['pending','Reset']].map(([v,t])=>'<button type="button" class="attendance-status-btn '+(status===v?'selected':'')+'" data-attendance-status="'+v+'" data-member-id="'+esc(m.member_id||'')+'" '+(!m.member_id||S.roster?.finalized?'disabled':'')+'>'+t+'</button>').join('')+'</div></div>';}).join(''):empty(query?'No matching members':'No registrations yet',query?'Try another name or email.':'Members who register will appear here.');}
function attendancePage(){if(!admin())return empty('Admin access required','Attendance verification is available to admins and super admins.');const finalized=!!S.roster?.finalized;const audit=(S.attendanceAudit||[]).slice(0,12);return welcome('Attendance desk','Set each registered member to Present, Absent or Not attending. Finalized events are locked.')+'<div class="attendancegrid"><form id="verifyForm" class="surface verifyform">'+formTitle('▦','Attendance verification','Choose the event, then scan the member QR or enter their six-digit OTP.')+'<label class="field">Event<select name="eventId" required><option value="">Select an event…</option>'+S.events.map(e=>'<option value="'+esc(e.id)+'" '+(String(S.rosterEvent)===String(e.id)?'selected':'')+'>'+esc(e.title)+'</option>').join('')+'</select></label><label class="field">Member email (for OTP verification)<input name="memberEmail" type="email" placeholder="member@example.com" required></label><label class="field">Six-digit event OTP<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="Enter OTP" required></label><button type="submit" class="primary full" '+(finalized?'disabled':'')+'>Verify OTP & mark present</button><div class="or-divider"><span>OR</span></div><button type="button" class="outline full" id="openQrScanner" '+(finalized?'disabled':'')+'>▦ Scan event QR — instant check-in</button><div id="qrScanner" class="qr-scanner" hidden><video id="qrVideo" autoplay playsinline></video><button type="button" class="outline full" id="closeQrScanner">Close scanner</button></div><p class="hint">QR and OTP are alternative check-in methods. Both verify event registration on the server.</p></form><div class="surface"><div class="rosterhead"><div><h3>Event roster</h3><p>Present, absent and not attending.</p></div><select id="rosterSelect" class="select"><option value="">Choose event</option>'+S.events.map(e=>'<option value="'+esc(e.id)+'" '+(String(S.rosterEvent)===String(e.id)?'selected':'')+'>'+esc(e.title)+'</option>').join('')+'</select></div><label class="field attendance-search">Find a member<input id="attendanceSearch" type="search" value="'+esc(S.attendanceQuery||'')+'" placeholder="Search name or email…" autocomplete="off"></label><div id="rosterBody">'+(S.roster?rosterRows(S.roster.roster):empty('Roster is waiting','Select an event to see registrations.'))+'</div>'+(S.roster?'<div class="attendance-actions"><button class="outline" id="exportAttendance">Export Excel CSV</button><button class="primary" id="finalizeAttendance" '+(finalized?'disabled':'')+'>'+(finalized?'Attendance locked':'Finalize & lock attendance')+'</button>'+(finalized&&superadmin()?'<button class="outline" id="reopenAttendance">Reopen attendance</button>':'')+'</div>'+(finalized?'<p class="hint">This event is locked. Only the Super Admin can reopen it. All changes are recorded in the audit history.</p>':'<p class="hint">Admins can edit statuses until attendance is finalized. Finalization marks remaining Pending members absent.</p>')+'<section class="attendance-audit"><h3>Recent audit history</h3>'+(audit.length?audit.map(a=>'<div class="attendance-audit-row"><span><b>'+esc(a.member_name)+'</b><small>'+esc(a.actor_name)+' · '+esc(a.action.replace('_',' '))+'</small></span><span>'+esc((a.previous_status||'—')+' → '+a.new_status)+'<small>'+esc(dt(a.changed_at))+'</small></span></div>').join(''):'<p class="hint">No changes recorded yet.</p>')+'</section>':'')+'</div></div>';}function peoplePage(){
 const people=S.publicMembers||[],query=String(S.peopleQuery||'').trim().toLowerCase();
 const filtered=people.filter(m=>(String(m.name||'')+' '+String(m.username||'')+' '+String(m.role||'')+' '+String(m.bio||'')).toLowerCase().includes(query));
 return welcome('Crew members','Find members and view their crew profiles.')+
 '<section class="profile-discovery-bar"><label class="profile-search"><span>⌕</span><input id="peopleSearch" type="search" value="'+esc(S.peopleQuery||'')+'" placeholder="Search name, username or role…" autocomplete="off"></label><span class="profile-search-count" id="peopleSearchCount">'+filtered.length+' of '+people.length+' profiles</span></section>'+
 '<div class="profile-directory" id="profileDirectoryGrid">'+(filtered.length?filtered.map(m=>'<article class="surface crew-profile-tile kc-member-directory-card" data-profile-search="'+esc((m.name||'')+' '+(m.username||'')+' '+(m.role||'')+' '+(m.bio||''))+'"><button class="crew-profile-open" data-open-profile="'+esc(m.auth_id)+'">'+avatarMarkup(m)+'<span><b>'+esc(m.name)+'</b><small>@'+esc(m.username||'crew-member')+'</small></span></button><p>'+esc(m.bio||'Kinetic Crew member')+'</p><div class="kc-member-directory-footer"><span class="role-pill '+esc(m.role)+'">'+esc(role(m.role))+'</span><button class="outline" data-open-profile="'+esc(m.auth_id)+'">View profile →</button></div></article>').join(''):empty(query?'No matching profiles':'No crew profiles yet',query?'Try another name or username.':'Crew members will appear here once they have signed in.'))+'</div>';
}
function safeSocialUrl(raw){try{const url=new URL(String(raw||''));return url.protocol==='https:'?url.href:'';}catch{return '';}}
function socialEmbed(url){
 try{
  const u=new URL(url);let id='';
  if(u.hostname==='youtu.be')id=u.pathname.split('/').filter(Boolean)[0]||'';
  else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)){
   id=u.searchParams.get('v')||'';
   if(!id){const parts=u.pathname.split('/').filter(Boolean),marker=parts.findIndex(p=>p==='shorts'||p==='embed');if(marker>=0)id=parts[marker+1]||'';}
  }
  if(id&&/^[a-zA-Z0-9_-]{6,20}$/.test(id))return '<div class="social-embed"><iframe src="https://www.youtube-nocookie.com/embed/'+esc(id)+'" title="Shared crew video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
 }catch{}
 return '';
}
async function loadSocialFeed(){
 const [posts,likes,comments]=await Promise.all([
  client.from('crew_social_posts').select('*').order('created_at',{ascending:false}).limit(100),
  client.from('crew_social_likes').select('post_id,user_id'),
  client.from('crew_social_comments').select('*').order('created_at',{ascending:true}).limit(1000)
 ]);
 for(const result of [posts,likes,comments])if(result.error)throw result.error;
 S.socialPosts=posts.data||[];S.socialLikes=likes.data||[];S.socialComments=comments.data||[];
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
 (url?socialEmbed(url)+'<a class="social-link-preview" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer"><span class="social-link-icon">↗</span><span><small>SHARED LINK</small><b>'+esc(host)+'</b><em>Open original post or page</em></span><span class="social-link-arrow">↗</span></a>':'<div class="social-invalid-link">This shared link is unavailable.</div>')+
 '<div class="social-post-stats"><span>'+likes.length+' '+(likes.length===1?'like':'likes')+'</span><span>'+comments.length+' '+(comments.length===1?'comment':'comments')+'</span></div>'+
 '<div class="social-post-actions"><button type="button" class="'+(liked?'social-action liked':'social-action')+'" data-social-like="'+esc(post.id)+'" data-liked="'+(liked?'true':'false')+'">'+(liked?'♥ Liked':'♡ Like')+'</button><button type="button" class="social-action" data-social-comments-toggle="'+esc(post.id)+'">▢ Comment</button><button type="button" class="social-action" data-social-share="'+esc(post.id)+'">↗ Share</button></div>'+
 '<section class="social-comments" data-social-comments="'+esc(post.id)+'" hidden><div class="social-comments-list">'+(commentMarkup||'<p class="social-no-comments">Start the conversation.</p>')+'</div><form class="social-comment-form" data-social-comment-form="'+esc(post.id)+'"><input name="body" maxlength="800" required placeholder="Write a comment…"><button type="submit" aria-label="Send comment">➤</button></form></section></article>';
}
function socialFeedPage(){
 const posts=S.socialPosts||[],people=(S.publicMembers||[]).filter(m=>String(m.auth_id)!==String(S.user?.auth_id)).slice(0,18);
 const stories='<section class="kc-feed-stories"><div class="kc-feed-stories-head"><b>Stories</b><span>CREW MOMENTS</span></div><div class="kc-feed-story-rail"><button class="kc-feed-story own" data-view="profile"><span class="kc-story-ring"><span class="kc-story-avatar">'+avatarMarkup(S.user)+'</span><i>+</i></span><small>Your story</small></button>'+people.map((p,i)=>'<button class="kc-feed-story" data-open-profile="'+esc(p.auth_id)+'"><span class="kc-story-ring '+(i<5?'fresh':'')+'"><span class="kc-story-avatar">'+avatarMarkup(p)+'</span></span><small>'+esc((p.name||'Crew').split(' ')[0])+'</small></button>').join('')+'</div></section>';
 return '<div class="kc-feed-page"><header class="kc-feed-top"><div><span class="kc-feed-kicker">KINETIC CREW / COMMUNITY</span><h1>Crew Feed</h1></div><button class="kc-feed-inbox" data-view="notifications" aria-label="Notifications">♧<i></i></button></header>'+
 '<div class="kc-feed-tabs"><span class="active">Feed</span><span>Following</span><span>Reels</span></div>'+stories+
 '<form id="socialPostForm" class="surface social-share-composer kc-feed-composer"><div class="kc-feed-compose-avatar">'+avatarMarkup(S.user)+'</div><div class="kc-feed-compose-main"><label class="field"><textarea name="caption" rows="2" maxlength="1200" placeholder="Share a moment with your crew…" aria-label="Caption"></textarea></label><div class="kc-feed-link-field"><span>↗</span><input name="link_url" type="url" inputmode="url" placeholder="Paste a reel, video or post link" required></div><div class="social-composer-foot"><small>Share a link for everyone in the crew.</small><button type="submit" class="primary">Post ↗</button></div></div></form>'+
 '<div class="kc-feed-section-head"><b>For the crew</b><span>'+posts.length+' POSTS</span></div><div class="social-feed-list">'+(posts.map(socialPostCard).join('')||empty('Your crew feed starts here','Share the first reel, performance or moment with everyone.'))+'</div></div>';
}

const featureLabels={rehearsals:'Rehearsals',leave:'Leave requests',memories:'KC Memories',polls:'Polls & voting',chat:'Crew chat'};
const featureMeta={
 rehearsals:['Plan a practice session','Create rehearsals, assign a choreographer and share the venue.','Session title','Practice details','Create session'],
 leave:['Request time away','Send a leave request to the crew admins.','Leave request','Reason and dates','Submit request'],
 memories:['KC Memories','Share the photo album and video links from crew moments.','Memory title','Caption and media link','Share memory'],
 auditions:['Audition portal','Publish auditions or submit your audition details and video link.','Audition / application','Dance style, contact and audition video link','Submit'],
 polls:['Crew polls','Vote on songs, themes and crew decisions.','Poll question','Add options separated by commas','Publish poll'],
 chat:['Crew chat','A shared space for quick crew conversations.','Message title','Write your message','Send message'],
 achievements:['Achievements','Recognize crew milestones and standout contributions.','Achievement title','Describe the achievement and recipient','Award achievement']
};
const featureKeys=Object.keys(featureLabels);
function featureForm(key){
 const meta=featureMeta[key],isPoll=key==='polls',isLeave=key==='leave',isExpense=key==='expenses',isAudition=key==='auditions',isMemory=key==='memories',isChat=key==='chat',isRehearsal=key==='rehearsals',isAchievement=key==='achievements';
 return '<form class="surface feature-form" data-feature-form="'+key+'">'+formTitle('✦',meta[0],meta[1])+(isChat?'<input type="hidden" name="title" value="Crew message">':'<label class="field">'+meta[2]+'<input name="title" maxlength="160" required placeholder="'+meta[2]+'"></label>')+'<label class="field">'+meta[3]+'<textarea name="body" rows="3" maxlength="5000" '+(isChat?'required':'')+' placeholder="'+(isPoll?'e.g. Song A, Song B, Song C':isExpense?'e.g. ₹1200 · costumes · event name':isMemory?'Add a caption and paste a shareable media URL':isAudition?'Dance style, applicant details and video URL':isLeave?'Dates and reason':isChat?'Message the crew…':'Add useful details…')+'"></textarea></label>'+
 (isPoll?'<p class="hint">Separate each option with a comma. Members can change their vote until the poll closes.</p>':'')+
 
 (isLeave?'<label class="field">From<input name="from_date" type="date" required></label><label class="field">To<input name="to_date" type="date" required></label>':'')+
 (isRehearsal?'<label class="field">Date & time<input name="session_at" type="datetime-local" required></label><label class="field">Location<input name="location" maxlength="160" placeholder="Practice room / studio"></label>':'')+
 
 (isAudition?'<label class="field">Dance style<input name="style" maxlength="80" placeholder="Hip-hop / freestyle / classical"></label><label class="field">Audition video URL<input name="media_url" type="url" placeholder="https://…"></label>':'')+
 (isMemory?'<label class="field">Photo / video URL<input name="media_url" type="url" placeholder="Paste a shareable link"></label>':'')+
 '<button class="primary full">'+meta[4]+' →</button></form>';
}
function featureCard(key,item){
 const data=item.data||{},status=item.status||'open';
 let extra='';
 if(key==='polls'){
   const opts=String(item.body||'').split(',').map(x=>x.trim()).filter(Boolean);
   extra='<div class="poll-options">'+opts.map(o=>'<button class="outline poll-vote" data-vote-id="'+esc(item.id)+'" data-choice="'+esc(o)+'">'+esc(o)+'</button>').join('')+'</div><button class="textlink" data-poll-results="'+esc(item.id)+'">View results</button>';
 }
 if(key==='leave'||key==='auditions'){
   extra='<div class="feature-status">Status: <b>'+esc(status.toUpperCase())+'</b></div>';
   if(admin()&&status==='pending')extra+='<div class="feature-actions"><button class="outline" data-moderate="'+esc(item.id)+'" data-status="approved" data-feature="'+key+'">Approve</button><button class="outline" data-moderate="'+esc(item.id)+'" data-status="rejected" data-feature="'+key+'">Reject</button></div>';
   if(admin()&&key==='auditions'&&status==='open')extra+='<div class="feature-actions"><button class="outline" data-moderate="'+esc(item.id)+'" data-status="selected" data-feature="'+key+'">Select</button><button class="outline" data-moderate="'+esc(item.id)+'" data-status="rejected" data-feature="'+key+'">Not selected</button></div>';
 }
 
 if(data.media_url){const media=String(data.media_url),safe=esc(media);if(/\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i.test(media))extra+='<a class="feature-media-link" href="'+safe+'" target="_blank" rel="noopener"><img class="feature-media-preview" src="'+safe+'" alt="'+esc(item.title)+'" loading="lazy" decoding="async" onerror="this.closest(\'a\').classList.add(\'media-unavailable\');this.remove();"><span>Open image ↗</span></a>';else if(/\.(mp4|webm|ogg)(\?.*)?$/i.test(media))extra+='<video class="feature-video-preview" src="'+safe+'" controls preload="metadata" playsinline></video>';else extra+='<p><a class="feature-link" href="'+safe+'" target="_blank" rel="noopener">Open shared media ↗</a></p>';}
 if(data.from_date)extra+='<p class="feature-meta">'+esc(data.from_date)+' → '+esc(data.to_date||data.from_date)+'</p>';
 if(key==='rehearsals'&&data.session_at)extra+='<p class="feature-meta">◷ '+esc(dt(data.session_at))+' · '+esc(data.location||'Location TBA')+'</p>';
 
 return '<article class="surface feature-card"><div class="feature-card-top"><span class="pill">'+esc(status)+'</span><small>'+esc(dt(item.created_at))+'</small></div><h3>'+esc(item.title)+'</h3><p>'+esc(item.body||'')+'</p>'+extra+'<div class="feature-card-foot"><span>By '+esc(item.author_name||'Crew member')+'</span>'+(admin()||item.author_id===S.user.auth_id?'<button class="textlink" data-feature-delete="'+esc(item.id)+'" data-feature="'+key+'">Delete</button>':'')+'</div></article>';
}
function featurePage(key){
 const items=(S.featureItems[key]||[]).slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const canCreate=key==='polls'||key==='memories'||key==='leave'||admin();
 const title=featureLabels[key]||'Crew feature';
 const descriptions={polls:'Your voice matters. Vote on the next crew decision.',memories:'Relive performances, rehearsals and the moments in between.',leave:'Send a leave request to the crew admins.',rehearsals:'Practice plans and rehearsal details.',auditions:'Audition announcements and submissions.'};
 return welcome(title,descriptions[key]||'Everything happening across Kinetic Crew.')+(canCreate?featureForm(key):'')+'<div class="feature-feed">'+(items.map(item=>featureCard(key,item)).join('')||empty('Nothing here yet','New '+title.toLowerCase()+' will appear here.'))+'</div>';
}
function chatPage(){
 const items=(S.featureItems.chat||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
 const messages=items.map(item=>'<article class="wa-message '+(item.author_id===S.user.auth_id?'mine':'theirs')+'"><small>'+esc(item.author_name||'Crew member')+'</small><p>'+esc(item.body||item.title)+'</p><time>'+esc(new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</time></article>').join('');
 return welcome('Crew chat','The crew group chat — quick messages, shared energy, one conversation.')+'<section class="wa-chat-shell"><header class="wa-chat-head"><div class="wa-chat-mark">KC</div><div><b>Kinetic Crew</b><small>'+items.length+' messages · Crew group</small></div><span class="wa-online"><i></i> LIVE</span></header><div class="wa-chat-messages" id="waMessages">'+(messages||'<div class="wa-empty">✳<b>Start the conversation</b><small>Your crew messages will appear here.</small></div>')+'</div><form class="wa-chat-compose" data-feature-form="chat"><input type="hidden" name="title" value="Crew message"><textarea name="body" rows="1" maxlength="5000" required placeholder="Message the crew…"></textarea><button class="wa-send" type="submit" aria-label="Send message">➤</button></form></section>';
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
  '<header class="kc-fun-hub-head"><div><span class="kc-fun-kicker">KINETIC CREW / PLAY TOGETHER</span><h1>Fun Zone<span class="kc-fun-spark">✦</span></h1><p>Your crew’s space to laugh, compete and connect.</p></div><button type="button" class="kc-fun-profile" data-view="profile">'+avatarMarkup(S.user,'small')+'</button></header>'+
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
function crewManagementPage(){if(!admin())return empty('Crew management is restricted','Only crew admins can manage members and access.');const rows=(S.members||[]).map(m=>'<article class="crew-manage-row"><div class="crew-manage-person">'+avatarMarkup(m)+'<span><b>'+esc(m.name)+'</b><small>'+esc(m.email)+'</small></span></div><span class="roletag '+esc(m.role)+'">'+esc(role(m.role))+'</span>'+(superadmin()&&m.auth_id!==S.user.auth_id?'<select class="select role-select" data-id="'+esc(m.auth_id)+'"><option value="member" '+(m.role==='member'?'selected':'')+'>Member</option><option value="admin" '+(m.role==='admin'?'selected':'')+'>Admin</option></select>':'')+'</article>').join('');return welcome('Crew management','Manage the people and permissions behind Kinetic Crew.')+'<div class="crew-manage-summary"><div><b>'+S.members.length+'</b><small>CREW ACCOUNTS</small></div><div><b>'+S.members.filter(m=>m.role!=='member').length+'</b><small>ADMINS</small></div><div><b>'+S.members.filter(m=>m.role==='member').length+'</b><small>MEMBERS</small></div></div><section class="surface crew-manage-list"><div class="directoryhead"><div><h3>Members & access</h3><p>Manage crew roles from one place.</p></div></div>'+(rows||empty('No members yet','New crew accounts will appear here.'))+'</section><button class="outline" data-view="attendance">Open attendance desk ↗</button>';}
function chatMessagesMarkup(items){const rows=(items||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));return rows.length?rows.map(m=>{const own=String(m.author_id)===String(S.user.auth_id);return '<article class="wa-message '+(own?'own':'')+'"><small>'+esc(own?'You':m.author_name||'Crew member')+'</small><p>'+esc(m.body||m.title)+'</p><time>'+esc(dt(m.created_at))+'</time></article>';}).join(''):'<div class="wa-empty"><b>Start the crew conversation</b><small>Messages from your crew will appear here.</small></div>';}
function whatsAppChatPage(){const items=S.featureItems.chat||[];return welcome('Crew Chat','One crew conversation. Share plans, quick updates and moments.')+'<section class="wa-shell"><aside class="wa-rail"><div class="wa-rail-head"><b>KC MESSAGES</b><span>● ONLINE</span></div><div class="wa-room active"><span class="wa-room-avatar">KC</span><span><b>Main Crew</b><small>Everyone in Kinetic Crew</small></span></div></aside><div class="wa-conversation"><header class="wa-chat-head"><span class="wa-room-avatar">KC</span><span><b>Main Crew</b><small>Kinetic Crew group conversation · '+items.length+' messages</small></span></header><div class="wa-messages" id="waMessages">'+chatMessagesMarkup(items)+'</div><form class="wa-composer" data-feature-form="chat"><input type="hidden" name="title" value="Crew message"><textarea name="body" rows="1" maxlength="5000" required placeholder="Message the crew…"></textarea><button type="submit" aria-label="Send message">➤</button></form></div></section>';}
function paint(){
document.body.classList.toggle('kc-more-open',S.view==='more');
const communityItems=[['feed','◈','Crew Feed'],['chat','✉','Crew chat'],['polls','◉','Polls & voting'],['memories','▧','KC Memories'],['leave','↗','Leave requests'],['rehearsals','◷','Rehearsals'],['updates','↗','Crew updates'],['people','♙','Discover crew'],['fun-zone','✦','Fun Zone']];
const groups=[
 ['overview',superadmin()?'SUPER ADMIN':admin()?'ADMIN SPACE':'MEMBER SPACE',superadmin()?'Full platform control':admin()?'Crew operations':'Your crew at a glance',[['overview','⌂','Overview']]],
 ['events','EVENTS','Performances & sessions',[['events','▦','Events'],['calendar','▦','Calendar']]],
 ['chat',admin()?'CREW COMMUNITY':'CREW SPACE',admin()?'Member community and activity':'Talk, vote and share',communityItems],
 ['notifications','NOTIFICATIONS','Updates & alerts',[['notifications','♧','Notifications']]],
 ...(admin()?[['management',superadmin()?'SUPER ADMIN CONTROLS':'ADMIN TOOLS',superadmin()?'Roles and platform settings':'Member administration',[['crew-management','♙',superadmin()?'Roles & members':'Crew members'],['attendance','◎','Attendance'],]]]:[]),
 ['settings','MY ACCOUNT','Your preferences',[['profile','◉','My profile'],['settings','⚙','App settings'],['credits','✧','Credits']]]
]
$('#nav').innerHTML=groups.map(([id,label,sub,items])=>{
const expanded=S.navOpen===id;
return '<section class="nav-group '+(expanded?'expanded':'')+'" data-nav-group-panel="'+id+'"><button type="button" class="nav-group-toggle '+(expanded?'expanded':'')+'" data-nav-group="'+id+'" aria-expanded="'+expanded+'"><span class="nav-group-symbol">'+({overview:'⌂',events:'▦',chat:'✉',notifications:'♧',management:'♙',settings:'⚙'}[id])+'</span><span class="nav-group-label"><b>'+label+'</b><small>'+sub+'</small></span><span class="nav-group-chevron">⌄</span></button><div class="nav-group-items" '+(expanded?'':'hidden')+'>'+items.map(n=>'<button class="navitem '+(S.view===n[0]?'active':'')+'" data-view="'+n[0]+'"><span class="nicon">'+n[1]+'</span><span>'+n[2]+'</span>'+(n[0]==='notifications'&&unread()?'<span class="count">'+unread()+'</span>':'')+'</button>').join('')+'</div></section>';
}).join('');
const crumb=$('#crumb');if(crumb)crumb.textContent=({overview:'Overview',more:'More',events:'Events',chat:'Crew chat',feed:'Crew Feed',memes:'Meme Zone','fun-zone-games':'Mini Games',notifications:'Notifications',people:'Discover crew','fun-zone':'Fun Zone',credits:'Credits','public-profile':'Crew profile','crew-management':'Crew management',attendance:'Attendance',profile:'My profile',settings:'App settings',calendar:'Calendar',rehearsals:'Rehearsals',auditions:'Auditions',leaderboard:'Leaderboard'}[S.view]||'Crew management');
const fn={overview:home,more:morePage,events:eventsPage,'event-detail':eventDetailPage,chat:whatsAppChatPage,feed:socialFeedPage,memes:memeZonePage,'fun-zone-games':miniGamesPage,notifications:notificationsPage,updates:updatesPage,profile:profilePage,'app-settings':settingsPage,people:peoplePage,'public-profile':publicProfilePage,'crew-management':crewManagementPage,attendance:attendancePage,settings:settingsPage,rehearsals:()=>featurePage('rehearsals'),calendar:calendarPage,polls:()=>featurePage('polls'),memories:()=>featurePage('memories'),leave:()=>featurePage('leave'),'fun-zone':funZonePage,credits:creditsPage}[S.view]||home;
$('#app').classList.remove('kc-page-enter');
$('#app').innerHTML=(S.error?'<div class="alert"><span>'+esc(S.error)+'</span><button data-clear>×</button></div>':'')+(S.offline?'<div class="offline-strip">OFFLINE · LAST SAVED DATA</div>':'')+fn();
$('#app').classList.add('kc-page-enter');
}
function settingsPage(){
 const prefs=notificationPrefs(),settings=S.appSettings||{},version=window.KC_APP_VERSION||'1.2.2',latest=settings.latest_version||version;
 const updateAvailable=latest!==version;
 return welcome('App settings','Your Kinetic Crew app, account and device preferences.')+
 '<div class="settings-grid">'+
 '<section class="surface settings-card"><span class="settings-kicker">ACCOUNT</span><h3>Your crew identity</h3><p>Manage your profile, username, photo and banner.</p><button class="primary" data-view="profile">Edit profile →</button></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">APP VERSION</span><h3>Kinetic Crew <b>v'+esc(version)+'</b></h3><p>Developer: '+esc(settings.developer||'Kinetic Crew Development Team')+'</p><p class="settings-update-state">App updates install automatically in the background. No action is needed.</p></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">APPEARANCE</span><h3>Make it yours</h3><p>Choose the theme used across your crew workspace.</p><div class="settings-choice"><button type="button" class="outline" data-set-theme="dark">☾ Dark</button><button type="button" class="outline" data-set-theme="light">☀ Light</button></div></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">NOTIFICATIONS</span><h3>Stay in the loop</h3><label class="settings-toggle"><span><b>In-app sound</b><small>Play a sound for crew activity.</small></span><input id="settingsSound" type="checkbox" '+(prefs.sound?'checked':'')+'></label><label class="settings-toggle"><span><b>Push notifications</b><small>Receive alerts when Kinetic Crew is not open.</small></span><button type="button" class="outline" id="enablePush">'+(prefs.push?'Enabled ✓':'Enable')+'</button></label><button class="outline" data-view="notifications">Open notification inbox</button></section>'+
 '<section class="surface settings-card"><span class="settings-kicker">INTRO EXPERIENCE</span><h3>The Kinetic opening</h3><p>Play the crew introduction again on this device.</p><button class="outline" id="replayIntro">Replay crew intro</button>'+(admin()?'<label class="field settings-upload">Admin soundtrack<input id="introAudioUpload" type="file" accept="audio/*"></label><small>Upload a licensed soundtrack for the crew introduction.</small>':'')+'</section>'+
 '<section class="surface settings-card"><span class="settings-kicker">DEVICE</span><h3>App maintenance</h3><p>Clear temporary cached files without signing you out.</p><button class="outline" id="clearAppCache">Clear app cache</button><button class="outline" data-view="notifications">Notification settings</button></section>'+
 '<section class="surface settings-card settings-danger"><span class="settings-kicker">SESSION</span><h3>Sign out</h3><p>Sign out of this device. Your crew account remains active.</p><button class="outline" id="settingsSignOut">Sign out ↗</button></section></div>';
}
async function go(v){if(v==='auditions'){window.open('https://kinetic-crew-audition.base44.app/','_blank','noopener');return;}S.view=v;S.error='';S.navOpen=({overview:'overview',events:'events','event-detail':'events',chat:'chat',notifications:'notifications',people:'chat',feed:'chat','public-profile':'chat','crew-management':'management',attendance:'management',profile:'settings',settings:superadmin()?'management':'settings',rehearsals:'chat',calendar:'events',polls:'chat',memories:'chat',leave:'chat',auditions:'chat',more:'overview'}[v]||'overview');if(S.chatPoll){clearInterval(S.chatPoll);S.chatPoll=null;}if(v==='crew-management'&&admin()){try{S.members=await api('members');}catch(e){S.error=e.message||'Could not load crew members.';}}if(v==='people'||v==='feed'||v==='fun-zone'){try{const {data,error}=await rpc('crew_profile_directory',{});if(error)throw error;S.publicMembers=Array.isArray(data)?data:[];}catch(e){S.publicMembers=[];S.error=e.message||'Could not load crew profiles.';}}if(v==='feed'||v==='fun-zone'||v==='memes'){try{await loadSocialFeed();}catch(e){S.error=e.message||'Could not load the crew feed.';}}if(v==='profile'||v==='public-profile'||v==='settings'){try{const {data,error}=await rpc('crew_profile_social',{p_auth_id:v==='public-profile'?S.selectedProfileId:S.user.auth_id});if(error)throw error;S.profileSocial=data||null;if(v!=='public-profile'&&S.profileSocial?.profile)S.user={...S.user,...S.profileSocial.profile};}catch(e){S.profileSocial=null;S.error=e.message||'Could not load profile details.';}}if(v==='profile'){try{const {data,error}=await client.from('crew_profile_documents').select('*').eq('auth_id',S.user.auth_id);if(error)throw error;S.profileDocuments=data||[];}catch(e){S.profileDocuments=[];S.error=e.message||'Could not load profile documents.';}}setMobileMenu(false);if(featureKeys.includes(v)){try{S.featureItems[v]=await featureApi('list',v,{});}catch(e){S.error=e.message||'Could not load this feature.';}}if(v==='leaderboard'){try{S.leaderboard=await featureApi('leaderboard',null,{});}catch(e){S.error=e.message||'Could not load leaderboard.';}}paint();if(v==='chat'){S.chatPoll=setInterval(async()=>{if(S.view!=='chat'||S.chatBusy)return;S.chatBusy=true;try{const rows=await featureApi('list','chat',{});const previous=S.featureItems.chat||[],previousIds=new Set(previous.map(m=>String(m.id)));const incoming=rows.filter(m=>!previousIds.has(String(m.id)));if(incoming.length){const latest=incoming[incoming.length-1];if(String(latest.author_id)!==String(S.user.auth_id)){window.dispatchEvent(new CustomEvent('kc:notification',{detail:{title:latest.author_name||'Crew chat',body:latest.body||'Sent you a new message.',target:'chat'}}));if(document.hidden&&'Notification'in window&&Notification.permission==='granted')new Notification('Kinetic Crew · Crew chat',{body:(latest.author_name||'A crew member')+': '+(latest.body||'New message'),icon:window.kcPath('kinetic-crew-logo.jpg')});}}if(rows.length!==(S.featureItems.chat||[]).length||incoming.length){S.featureItems.chat=rows;const box=$('#waMessages');if(box){const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;box.innerHTML=chatMessagesMarkup(rows);if(atBottom)box.scrollTop=box.scrollHeight;}}}catch{}finally{S.chatBusy=false;}},5000);}window.scrollTo({top:0,behavior:'auto'});savePageState();}
async function exportAttendance(){if(!S.roster?.roster?.length){notice('No attendance rows to export.');return;}const rows=[['Member name','Email','Attendance status','Registered at'],...S.roster.roster.map(m=>[m.name,m.email,m.status||(m.attended?'present':'pending'),m.registered_at||''])];if(window.XLSX){const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Attendance');XLSX.writeFile(wb,'kinetic-crew-attendance-'+S.rosterEvent+'.xlsx');notice('Excel attendance workbook downloaded.');return;}const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='kinetic-crew-attendance-'+S.rosterEvent+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);notice('Attendance CSV downloaded. Open it in Excel.');}
function celebrateSave(){if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;const canvas=document.createElement('canvas');canvas.className='kc-save-confetti';canvas.setAttribute('aria-hidden','true');Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',pointerEvents:'none',zIndex:'25000'});document.body.appendChild(canvas);const ctx=canvas.getContext('2d');const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.floor(innerWidth*ratio);canvas.height=Math.floor(innerHeight*ratio);ctx.scale(ratio,ratio);const palette=['#f08cac','#ffd166','#7bdcb5','#86b7ff','#c7a5ff','#ffffff'];const particles=Array.from({length:96},()=>({x:innerWidth/2+(Math.random()-.5)*120,y:Math.max(80,innerHeight*.27)+(Math.random()-.5)*80,vx:(Math.random()-.5)*9,vy:-Math.random()*10-3,g:.22+Math.random()*.12,rot:Math.random()*6.28,vr:(Math.random()-.5)*.24,size:4+Math.random()*6,color:palette[Math.floor(Math.random()*palette.length)],life:85+Math.random()*30}));let frame=0;function draw(){ctx.clearRect(0,0,innerWidth,innerHeight);for(const p of particles){if(p.life<=0)continue;p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.vx*=.992;p.rot+=p.vr;p.life--;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.globalAlpha=Math.min(1,p.life/24);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.62);ctx.restore();}frame++;if(frame<125)requestAnimationFrame(draw);else canvas.remove();}requestAnimationFrame(draw);setTimeout(()=>canvas.remove(),2600);}
window.kcCelebrateSave=celebrateSave;
async function action(fn){try{S.error='';await fn();}catch(e){S.error=e.message||'Something went wrong.';}paint();}
function showEventQr(eventId,title){const payload='KC_EVENT_ATTENDANCE:'+eventId+':'+S.user.email;$('#modalRoot').innerHTML='<div class="modalback" id="eventQrBackdrop"><div class="modal" role="dialog" aria-modal="true"><button class="iconbutton modalclose" id="closeEventQr">×</button><div class="modalemblem">▦</div><div class="eyebrow" style="justify-content:center">EVENT ATTENDANCE PASS</div><h2>'+esc(title)+'</h2><p>This QR is unique to this event and your registered account. Show it to an admin or super admin scanner.</p><div id="eventQrImage" class="member-qr"></div><p class="modalhint">No OTP needed when scanned</p><button class="primary full" id="doneEventQr">Done ✓</button></div></div>';if(window.QRCode)new QRCode($('#eventQrImage'),{text:payload,width:220,height:220,colorDark:'#282641',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});$('#closeEventQr').onclick=$('#doneEventQr').onclick=()=>$('#modalRoot').innerHTML='';$('#eventQrBackdrop').onclick=e=>{if(e.target.id==='eventQrBackdrop')$('#modalRoot').innerHTML='';};}
function showOtp(code,expires,title){$('#modalRoot').innerHTML='<div class="modalback" id="otpBackdrop"><div class="modal" role="dialog" aria-modal="true"><button class="iconbutton modalclose" id="closeOtp">×</button><div class="modalemblem">◎</div><div class="eyebrow" style="justify-content:center">ATTENDANCE PASS / '+esc(title)+'</div><h2>Your code is ready.</h2><p>Show this six-digit code to an authorized crew admin.</p><div class="code">'+code.split('').map(d=>'<span>'+d+'</span>').join('')+'</div><div class="modalhint">◷ Expires '+esc(new Date(expires).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</div><p>✦ Single-use · Keep your code private</p><button class="primary full" id="doneOtp">Got it ✓</button></div></div>';$('#closeOtp').onclick=()=>$('#modalRoot').innerHTML='';$('#doneOtp').onclick=()=>$('#modalRoot').innerHTML='';$('#otpBackdrop').onclick=e=>{if(e.target.id==='otpBackdrop')$('#modalRoot').innerHTML='';};}
document.addEventListener('click',async e=>{const shareProfile=e.target.closest('[data-share-profile]');if(shareProfile){const data={title:(S.user?.name||'Kinetic Crew')+' · Kinetic Crew',text:'Connect with '+(S.user?.name||'me')+' on Kinetic Crew · @'+(S.user?.username||'crew-member')};if(navigator.share){try{await navigator.share(data);}catch(err){if(err.name!=='AbortError')notice('Could not share profile.');}}else{try{await navigator.clipboard.writeText(data.text);notice('Profile details copied.');}catch{notice('Sharing is unavailable in this browser.');}}return;}const funCreate=e.target.closest('[data-fun-create]');if(funCreate){await go('feed');requestAnimationFrame(()=>document.querySelector('#socialPostForm textarea')?.focus());return;}const docSelect=e.target.closest('[data-doc-select]');if(docSelect){$('#doc-'+docSelect.dataset.docSelect)?.click();return;}const docView=e.target.closest('[data-doc-view]');if(docView){const row=(S.profileDocuments||[]).find(x=>x.document_type===docView.dataset.docView);if(!row)return;const signed=await client.storage.from('crew-profile-documents').createSignedUrl(row.storage_path,60);if(signed.error){notice(signed.error.message||'Could not open document.');return;}window.open(signed.data.signedUrl,'_blank','noopener');return;}const shareEvent=e.target.closest('[data-share-event]');if(shareEvent){const item=S.events.find(x=>String(x.id)===String(shareEvent.dataset.shareEvent));if(!item)return;const shareData={title:item.title,text:'Join me at '+item.title+(item.location?' · '+item.location:''),url:location.origin+window.kcPath('')};if(navigator.share){try{await navigator.share(shareData);}catch(error){if(error.name!=='AbortError')notice('Could not open sharing.');}}else{try{await navigator.clipboard.writeText(shareData.text+' '+shareData.url);notice('Event invite copied.');}catch{notice('Sharing is not available in this browser.');}}return;}const nestButton=e.target.closest('[data-nest-toggle]');if(nestButton){const panel=nestButton.closest('[data-nav-nest]'),items=panel.querySelector('.nav-nest-items'),open=nestButton.getAttribute('aria-expanded')==='true';document.querySelectorAll('[data-nav-nest]').forEach(p=>{p.classList.remove('expanded');p.querySelector('[data-nest-toggle]')?.setAttribute('aria-expanded','false');p.querySelector('.nav-nest-items')?.setAttribute('hidden','');});if(!open){panel.classList.add('expanded');nestButton.setAttribute('aria-expanded','true');items?.removeAttribute('hidden');}return;}const themeChoice=e.target.closest('[data-set-theme]');if(themeChoice){const toggle=document.querySelector('[data-theme-toggle]');if(toggle&&document.documentElement.dataset.theme!==themeChoice.dataset.setTheme)toggle.click();notice('Appearance updated.');return;}const groupButton=e.target.closest('[data-nav-group]');if(groupButton){const key=groupButton.dataset.navGroup;S.navOpen=S.navOpen===key?'':key;paint();return;}const funStart=e.target.closest('[data-fun-start]');if(funStart){S.funRound={state:'waiting',best:S.funRound?.best??null,last:null};paint();const delay=1200+Math.random()*2600;clearTimeout(S.funTimer);S.funTimer=setTimeout(()=>{if((S.view==='fun-zone-games'||S.view==='fun-zone')&&S.funRound?.state==='waiting'){S.funRound={...S.funRound,state:'go',startedAt:Date.now()};paint();}},delay);return;}const funHit=e.target.closest('[data-fun-hit]');if(funHit){if(S.funRound?.state==='waiting'){clearTimeout(S.funTimer);S.funRound={...S.funRound,state:'early'};paint();return;}if(S.funRound?.state==='go'){const ms=Date.now()-S.funRound.startedAt;S.funRound={state:'done',last:ms,best:S.funRound.best==null?ms:Math.min(S.funRound.best,ms)};paint();return;}return;}if(e.target.closest('[data-fun-reset]')){clearTimeout(S.funTimer);S.funRound={state:'ready',best:null,last:null};paint();return;}if(e.target.closest('[data-dance-prompt]')){const prompts=['Freestyle for 30 seconds without stopping.','Create a 4-count move and teach it to someone.','Dance to the next song you hear.','Try a move using only footwork.','Recreate a signature move from your last performance.','Make a 2-person mirror routine.','Do a clean 8-count in slow motion.'];const p=prompts[Math.floor(Math.random()*prompts.length)];const el=$('#dancePrompt');if(el)el.textContent=p;return;}const like=e.target.closest('[data-social-like]');if(like){await action(async()=>{const postId=like.dataset.socialLike;if(like.dataset.liked==='true'){const {error}=await client.from('crew_social_likes').delete().eq('post_id',postId).eq('user_id',S.user.auth_id);if(error)throw error;}else{const {error}=await client.from('crew_social_likes').insert({post_id:postId,user_id:S.user.auth_id});if(error)throw error;}await loadSocialFeed();});return;}const commentToggle=e.target.closest('[data-social-comments-toggle]');if(commentToggle){const panel=document.querySelector('[data-social-comments="'+commentToggle.dataset.socialCommentsToggle+'"]');if(panel)panel.hidden=!panel.hidden;return;}const share=e.target.closest('[data-social-share]');if(share){const post=S.socialPosts.find(p=>String(p.id)===String(share.dataset.socialShare));if(post){try{if(navigator.share)await navigator.share({title:'Kinetic Crew',text:'Shared by the crew',url:post.link_url});else{await navigator.clipboard.writeText(post.link_url);notice('Link copied.');}}catch(err){if(err?.name!=='AbortError')notice('Could not share this link from the browser.');}}return;}const socialDelete=e.target.closest('[data-social-delete]');if(socialDelete){if(!confirm('Delete this crew post?'))return;await action(async()=>{const {error}=await client.from('crew_social_posts').delete().eq('id',socialDelete.dataset.socialDelete);if(error)throw error;await loadSocialFeed();notice('Post deleted.');});return;}const vote=e.target.closest('[data-vote-id]');if(vote){await action(async()=>{const res=await featureApi('vote','polls',{id:vote.dataset.voteId,choice:vote.dataset.choice});notice(res.message);S.featureItems.polls=await featureApi('list','polls',{});});return;}const results=e.target.closest('[data-poll-results]');if(results){await action(async()=>{const rows=await featureApi('vote-results','polls',{id:results.dataset.pollResults});notice(rows.map(x=>x.choice+': '+x.votes).join(' · ')||'No votes yet');});return;}const mod=e.target.closest('[data-moderate]');if(mod){await action(async()=>{const res=await featureApi('moderate',mod.dataset.feature,{id:mod.dataset.moderate,status:mod.dataset.status});notice(res.message);S.featureItems[mod.dataset.feature]=await featureApi('list',mod.dataset.feature,{});});return;}const delFeature=e.target.closest('[data-feature-delete]');if(delFeature){if(!confirm('Delete this item?'))return;await action(async()=>{const res=await featureApi('delete',delFeature.dataset.feature,{id:delFeature.dataset.featureDelete});notice(res.message);S.featureItems[delFeature.dataset.feature]=await featureApi('list',delFeature.dataset.feature,{});});return;}const follow=e.target.closest('[data-follow]');if(follow){await action(async()=>{const {data,error}=await rpc('crew_follow_profile',{p_target_auth_id:follow.dataset.follow,p_follow:follow.dataset.following!=='true'});if(error)throw Error(error.message||'Could not update follow.');const profileResult=await rpc('crew_profile_social',{p_auth_id:follow.dataset.follow});if(profileResult.error)throw profileResult.error;S.profileSocial=profileResult.data;const directoryResult=await rpc('crew_profile_directory',{});if(!directoryResult.error)S.publicMembers=Array.isArray(directoryResult.data)?directoryResult.data:[];notice(follow.dataset.following==='true'?'Unfollowed crew member.':'Following crew member.');});return;}const profileEdit=e.target.closest('[data-profile-edit]');if(profileEdit){const editor=$('#profileEditor');if(editor){editor.open=true;editor.scrollIntoView({behavior:'smooth',block:'start'});}return;}const profileOpen=e.target.closest('[data-open-profile]');if(profileOpen){S.selectedProfileId=profileOpen.dataset.openProfile;go('public-profile');return;}const openEvent=e.target.closest('[data-open-event]');if(openEvent){S.selectedEvent=openEvent.dataset.openEvent;go('event-detail');return;}const v=e.target.closest('[data-view]');if(v){const target=v.dataset.view;const route=target==='new-event'?'events':target==='new-update'?'updates':target==='achievement-form'?'achievements':target;go(route).then(()=>{const anchor=target==='new-event'?'#eventForm':target==='new-update'?'#updateForm':target==='achievement-form'?'#achievementFormHost':null;if(anchor)$(anchor)?.scrollIntoView({behavior:'smooth',block:'center'});});return;}const r=e.target.closest('[data-register]');if(r){await action(async()=>{let d=await api('register','POST',{eventId:r.dataset.register});notice(d.message);await refresh();});return;}const eq=e.target.closest('[data-event-qr]');if(eq){const event=S.events.find(x=>String(x.id)===String(eq.dataset.eventQr));if(event)showEventQr(event.id,event.title);return;}const o=e.target.closest('[data-otp]');if(o){await action(async()=>{let e0=S.events.find(x=>String(x.id)===String(o.dataset.otp));let d=await api('otp','POST',{eventId:o.dataset.otp});showOtp(d.code,d.expiresAt,e0?.title||'Crew event');notice(d.message);});return;}const s=e.target.closest('[data-scroll]');if(s){$('#'+s.dataset.scroll)?.scrollIntoView({behavior:'smooth'});return;}if(e.target.closest('[data-clear]')){S.error='';paint();return;}if(e.target.closest('#openQrScanner')){startQr();return;}if(e.target.closest('#closeQrScanner')){stopQr();$('#qrScanner').hidden=true;return;}if(e.target.closest('#finalizeAttendance')){if(!S.rosterEvent||!confirm('Finalize this event attendance? All remaining pending members will be marked absent. This locks the roster.'))return;await action(async()=>{const r=await api('finalize-attendance','POST',{eventId:S.rosterEvent});S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>x.data||[]);notice(r.message);});return;}const attendanceStatus=e.target.closest('[data-attendance-status]');if(attendanceStatus){if(!S.rosterEvent||!attendanceStatus.dataset.memberId)return;await action(async()=>{const {data,error}=await rpc('crew_set_attendance_status',{p_event_id:S.rosterEvent,p_member_id:attendanceStatus.dataset.memberId,p_status:attendanceStatus.dataset.attendanceStatus});if(error)throw error;S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});notice(data?.message||'Attendance updated.');});return;}if(e.target.closest('#reopenAttendance')){if(!superadmin()||!S.rosterEvent||!confirm('Reopen attendance for this event? Admins will be able to edit statuses again.'))return;await action(async()=>{const {data,error}=await rpc('crew_reopen_attendance',{p_event_id:S.rosterEvent});if(error)throw error;S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});notice(data?.message||'Attendance reopened.');});return;}if(e.target.closest('#exportAttendance')){exportAttendance();return;}const del=e.target.closest('[data-delete-event]');if(del){if(!confirm('Delete this event and all its registrations and attendance records? This cannot be undone.'))return;await action(async()=>{const r=await api('delete-event','DELETE',{eventId:del.dataset.deleteEvent});if(S.rosterEvent===del.dataset.deleteEvent){S.roster=null;S.rosterEvent='';}notice(r.message);await refresh();});return;}if(e.target.closest('#logoutProfile')){await auth.signOut();location.replace(window.kcPath('login.html'));return;}const deleteUpdate=e.target.closest('[data-delete-announcement]');if(deleteUpdate){if(!superadmin()){notice('Only the Super Admin can delete crew updates.');return;}if(!confirm('Delete this crew update for everyone?'))return;await action(async()=>{const {data,error}=await rpc('crew_delete_announcement',{p_announcement_id:deleteUpdate.dataset.deleteAnnouncement});if(error)throw Error(error.message||'Could not delete update.');notice('Crew update deleted.');await refresh();});return;}const readBtn=e.target.closest('[data-read-notice]');if(readBtn){markRead(readBtn.dataset.readNotice);paint();notice('Notification marked as read.');return;}const noticeItem=e.target.closest('[data-notice-id]');if(noticeItem&&!e.target.closest('button')){markRead(noticeItem.dataset.noticeId);paint();return;}const filterBtn=e.target.closest('[data-notice-filter]');if(filterBtn){S.noticeFilter=filterBtn.dataset.noticeFilter;paint();return;}if(e.target.closest('#markAllRead')){localStorage.setItem(readKey(),JSON.stringify(S.announcements.map(a=>a.id)));paint();notice('All notifications marked as read.');return;}if(e.target.closest('#testNoticeSound')){playNoticeSound();notice('That is your Kinetic Crew alert sound.');return;}if(e.target.closest('#enablePush')){await action(async()=>{const result=await window.kcPush.enable();saveNotificationPrefs({push:true});notice(result.message||'Push alerts enabled on this device.');});return;}});
document.addEventListener('input',e=>{if(e.target.id==='attendanceSearch'){S.attendanceQuery=e.target.value;const body=$('#rosterBody');if(body)body.innerHTML=rosterRows(S.roster?.roster||[]);}});
document.addEventListener('input',e=>{if(e.target.id==='noticeSearch'){S.noticeQuery=e.target.value;const pos=e.target.selectionStart;const app=$('#app');const page=notificationsPage();const start=app.querySelector('.notice-layout');if(start){const temp=document.createElement('div');temp.innerHTML=page;const fresh=temp.querySelector('.notice-layout');start.replaceWith(fresh);const input=$('#noticeSearch');if(input){input.focus();input.setSelectionRange(pos,pos);}}}});
document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;const fallback=img.dataset.fallback;if(!fallback)return;const node=document.createElement('span');node.className=img.classList.contains('profile-photo')?'profile-photo profile-photo-placeholder':('avatar-fallback '+(img.classList.contains('small')?'small':''));node.textContent=fallback;node.setAttribute('aria-label','Profile image unavailable');img.replaceWith(node);},true);

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
 if(e.target.closest('#replayIntro')){localStorage.removeItem('kc-intro-seen:'+String(S.user.auth_id||S.user.id));showCrewIntro(true);return;}
 if(e.target.closest('#clearAppCache')){try{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('kinetic-crew-')).map(k=>caches.delete(k)));}notice('Temporary cache cleared. Reloading fresh assets…');setTimeout(()=>location.reload(),500);}catch(err){notice('Could not clear app cache.');}return;}
 if(e.target.closest('#settingsSignOut')){try{await auth.signOut();}finally{location.replace(window.kcPath('login.html'));}return;}
});
document.addEventListener('change',async e=>{if(e.target.matches('[data-doc-input]')){const file=e.target.files?.[0],type=e.target.dataset.docInput;if(!file)return;const ext=(file.name.split('.').pop()||'').toLowerCase(),mimeByExt={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},mime=mimeByExt[ext];if(!mime||file.size>10*1024*1024){notice('Choose a PDF, DOC or DOCX file under 10 MB.');e.target.value='';return;}await action(async()=>{const userId=S.user?.auth_id;if(!userId)throw Error('Please sign in again.');const old=(S.profileDocuments||[]).find(x=>x.document_type===type);const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=userId+'/'+type+'/'+Date.now()+'-'+safe;const uploaded=await client.storage.from('crew-profile-documents').upload(path,file,{upsert:false,contentType:mime,cacheControl:'3600'});if(uploaded.error)throw uploaded.error;const saved=await client.from('crew_profile_documents').upsert({auth_id:userId,document_type:type,storage_path:path,file_name:file.name,mime_type:mime,size_bytes:file.size,updated_at:new Date().toISOString()},{onConflict:'auth_id,document_type'});if(saved.error){await client.storage.from('crew-profile-documents').remove([path]);throw saved.error;}if(old?.storage_path)await client.storage.from('crew-profile-documents').remove([old.storage_path]);const rows=await client.from('crew_profile_documents').select('*').eq('auth_id',userId);if(rows.error)throw rows.error;S.profileDocuments=rows.data||[];paint();notice(type==='resume'?'Resume uploaded.':'Cover letter uploaded.');});e.target.value='';}else if(e.target.id==='profilePhotoInput'||e.target.id==='profileBannerInput'){const file=e.target.files?.[0];if(file)openImageCrop(file,e.target.id==='profileBannerInput');}else if(e.target.id==='noticeSound'){saveNotificationPrefs({sound:e.target.checked});if(e.target.checked)playNoticeSound();notice(e.target.checked?'In-app sound enabled.':'In-app sound muted.');}});
document.addEventListener('click',async e=>{const save=e.target.closest('.profile-admin-save');if(!save)return;const row=save.closest('[data-profile-row]');await action(async()=>{const {data,error}=await rpc('crew_manage_profile',{p_auth_id:row.dataset.profileRow,p_name:row.querySelector('[name=member_name]').value,p_bio:row.querySelector('[name=member_bio]').value});if(error)throw Error(error.message||'Could not update member profile.');notice('Member profile updated.');await refresh();});});
document.addEventListener('keydown',e=>{const item=e.target.closest('[data-open-event]');if(item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();S.selectedEvent=item.dataset.openEvent;go('event-detail');}}); 
document.addEventListener('submit',async e=>{let f=e.target;const featureFormEl=f.closest('[data-feature-form]');if(featureFormEl){e.preventDefault();const key=featureFormEl.dataset.feature;const d=new FormData(featureFormEl);await action(async()=>{const data={};['from_date','to_date','style','media_url'].forEach(k=>{if(d.get(k))data[k]=d.get(k)});if(key==='rehearsals'){data.session_at=new Date(d.get('session_at')).toISOString();data.location=d.get('location')||'';}if(key==='leave'&&new Date(data.from_date)>new Date(data.to_date))throw Error('End date must be on or after the start date.');const body=String(d.get('body')||'');const res=await featureApi('create',key,{title:d.get('title'),body,data});notice(res.message);S.featureItems[key]=await featureApi('list',key,{});if(key==='chat'){S.view='chat';paint();$('#waMessages')?.scrollTo({top:$('#waMessages').scrollHeight,behavior:'smooth'});}});return;}if(f.id==='socialPostForm'){e.preventDefault();const d=new FormData(f);await action(async()=>{const link=safeSocialUrl(d.get('link_url'));if(!link)throw Error('Paste a valid HTTPS link.');const {error}=await client.from('crew_social_posts').insert({author_id:S.user.auth_id,link_url:link,caption:String(d.get('caption')||'').trim()});if(error)throw error;await loadSocialFeed();notice('Shared with the crew.');});return;}if(f.matches('[data-social-comment-form]')){e.preventDefault();const d=new FormData(f),body=String(d.get('body')||'').trim(),postId=f.dataset.socialCommentForm;if(!body)return;await action(async()=>{const {error}=await client.from('crew_social_comments').insert({post_id:postId,user_id:S.user.auth_id,body});if(error)throw error;await loadSocialFeed();notice('Comment added.');});return;}if(f.id==='profileForm'){e.preventDefault();const d=new FormData(f);await action(async()=>{const username=String(d.get('username')||'').trim().toLowerCase();const availability=await rpc('crew_check_username',{p_username:username});if(availability.error)throw availability.error;if(!availability.data?.available)throw Error(availability.data?.message||'Username already taken.');const result=await api('profile','PATCH',{name:d.get('name'),bio:d.get('bio'),username,avatar_url:S.pendingAvatarUrl||S.user.avatar_url||null,banner_url:S.pendingBannerUrl||S.user.banner_url||null});S.pendingAvatarUrl=null;S.pendingBannerUrl=null;S.user={...S.user,...result,name:result.name||d.get('name'),bio:result.bio??d.get('bio')};S.view='profile';if(result._profileLimited)notice('Name saved. Apply the profile migration in Supabase to save bio and photo.');else notice('Profile updated.');await refresh();S.user={...S.user,...result};const profileResult=await rpc('crew_profile_social',{p_auth_id:S.user.auth_id});if(profileResult.error)throw profileResult.error;S.profileSocial=profileResult.data;celebrateSave();paint();});}else if(f.id==='eventForm'){e.preventDefault();let d=new FormData(f);await action(async()=>{let a=await api('events','POST',{title:d.get('title'),location:d.get('location'),description:d.get('description'),starts_at:new Date(d.get('starts_at')).toISOString(),capacity:Number(d.get('capacity'))});S.view='events';notice(a.message);try{const push=await window.kcPush.send('New crew event: '+d.get('title'),d.get('description')||('Event at '+(d.get('location')||'location TBA')),'all');console.info('Push delivery:',push);}catch(pushError){console.warn('Event saved; push delivery failed:',pushError);}await refresh();});}else if(f.id==='updateForm'){e.preventDefault();let d=new FormData(f);await action(async()=>{let a=await api('announcements','POST',{title:d.get('title'),body:d.get('body'),audience:d.get('audience')});S.view='updates';notice(a.message);try{const push=await window.kcPush.send(d.get('title'),d.get('body'),d.get('audience'));console.info('Push delivery:',push);}catch(pushError){console.warn('Announcement saved; push delivery failed:',pushError);}await refresh();});}else if(f.id==='verifyForm'){e.preventDefault();const d=new FormData(f),eventId=String(d.get('eventId')||''),memberEmail=String(d.get('memberEmail')||'').trim(),code=String(d.get('code')||'').trim();if(!eventId||!memberEmail||!/^\\d{6}$/.test(code)){notice('Enter the event, member email and six-digit OTP.');return;}await action(async()=>{const result=await api('verify','POST',{eventId,memberEmail,code});S.rosterEvent=eventId;S.roster=await api('attendance?eventId='+encodeURIComponent(eventId));notice(result.message||'OTP verified. Attendance marked present.');});}});
document.addEventListener('change',async e=>{if(e.target.matches('select[name="eventId"]')){S.rosterEvent=e.target.value;if(!S.rosterEvent){S.roster=null;paint();return;}await action(async()=>{S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});});}else if(e.target.id==='rosterSelect'){S.rosterEvent=e.target.value;if(!S.rosterEvent){S.roster=null;paint();return;}await action(async()=>{S.roster=await api('attendance?eventId='+encodeURIComponent(S.rosterEvent));S.attendanceAudit=await rpc('crew_attendance_audit',{p_event_id:S.rosterEvent}).then(x=>{if(x.error)throw x.error;return x.data||[];});paint();});}else if(e.target.matches('.profile-admin-save')){const row=e.target.closest('[data-profile-row]');await action(async()=>{const {data,error}=await rpc('crew_manage_profile',{p_auth_id:row.dataset.profileRow,p_name:row.querySelector('[name="member_name"]').value,p_bio:row.querySelector('[name="member_bio"]').value});if(error)throw Error(error.message||'Could not update member profile.');notice('Member profile updated.');await refresh();});}else if(e.target.matches('.role-select')){await action(async()=>{let d=await api('role','PATCH',{authId:e.target.dataset.id,role:e.target.value});notice(d.message);await refresh();});}});
$('#app').addEventListener('change',e=>{if(e.target.id==='profilePhotoInput'&&e.target.files?.[0]){const img=$('#profilePhotoPreview');if(img)img.src=URL.createObjectURL(e.target.files[0]);}});$('#logoutProfile')?.addEventListener('click',()=>$('#logout').click());
$('#logout').addEventListener('click',async()=>{try{await auth.signOut();}finally{S.user=null;S.events=[];S.announcements=[];S.members=[];location.replace(window.kcPath('login.html'));}});

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
$('#navShade')?.addEventListener('click',()=>setMobileMenu(false));
async function showCrewIntro(force){
 const id=String(S.user?.auth_id||S.user?.id||'guest'),key='kc-intro-seen:'+id;
 if(!force){
   try{const state=await rpc('crew_intro_should_show',{});if(state.error)throw state.error;if(state.data!==true){try{localStorage.setItem(key,'yes');}catch{}return;}}
   catch(error){try{if(localStorage.getItem(key)==='yes')return;}catch{}console.warn('One-time intro status could not be checked:',error);}
 }
 if(document.getElementById('kcIntro'))return;
 const overlay=document.createElement('section');overlay.id='kcIntro';overlay.className='kc-intro';
 overlay.innerHTML='<div class="kc-intro-grain"></div><div class="kc-intro-orbit"></div><div class="kc-intro-content"><img src="'+window.kcPath('kinetic-crew-logo.jpg')+'" alt="Kinetic Crew" class="kc-intro-logo"><span class="kc-intro-overline">A CREW IS MORE THAN A NAME</span><h1>MOVE AS ONE.<br><em>MAKE IT KINETIC.</em></h1><p>Different styles. One rhythm. One crew.</p><button type="button" id="kcIntroEnter">ENTER THE CREW ↗</button><button type="button" id="kcIntroSkip">Skip intro</button></div>';
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
  if(!session||!session.user){location.replace(window.kcPath('login.html'));return;}
  const saved=readPageState();
  if(saved&&(!saved.userId||saved.userId===(session.user.id||session.user.auth_id))){
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
  showCrewIntro(false);
  if(saved&&(!saved.userId||saved.userId===(session.user.id||session.user.auth_id)))restorePageScroll(saved);
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