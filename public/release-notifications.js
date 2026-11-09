(()=>{'use strict';
const client=()=>window.kcSupabase, $=s=>document.querySelector(s), PREF='kc-notification-prefs-v1';
let lastFeed=null,checking=false,observer=null;
const defaults={sound:'kinetic',volume:0.55,vibrate:true};
function prefs(){try{return {...defaults,...JSON.parse(localStorage.getItem(PREF)||'{}')}}catch{return {...defaults}}}
function savePrefs(p){localStorage.setItem(PREF,JSON.stringify(p));}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function tone(kind=prefs().sound,vol=prefs().volume){
 if(kind==='none'||!vol)return;
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  const ctx=new C(),master=ctx.createGain();master.gain.value=Math.max(0,Math.min(1,vol))*0.16;master.connect(ctx.destination);
  const notes=kind==='chime'?[659,880,1047]:kind==='pulse'?[440,660,440]:kind==='pop'?[740]:[587,784];
  notes.forEach((hz,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+i*(kind==='pulse'?.12:.095);osc.type=kind==='pop'?'triangle':'sine';osc.frequency.setValueAtTime(hz,start);gain.gain.setValueAtTime(.001,start);gain.gain.exponentialRampToValueAtTime(.8,start+.018);gain.gain.exponentialRampToValueAtTime(.001,start+.16);osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+.18);});
  setTimeout(()=>ctx.close().catch(()=>{}),1000);
 }catch(e){console.warn('Notification sound unavailable',e);}
}
function play(){const p=prefs();tone(p.sound,p.volume);if(p.vibrate&&navigator.vibrate)navigator.vibrate([70,35,70]);}
function releaseCard(r){const features=Array.isArray(r.features)?r.features:[],fixes=Array.isArray(r.fixes)?r.fixes:[];return '<article class="kc-release-card"><div class="kc-release-top"><span class="kc-release-version">VERSION '+esc(r.version)+'</span><time>'+esc(new Date(r.published_at).toLocaleDateString())+'</time></div><h3>'+esc(r.title)+'</h3><p>'+esc(r.summary)+'</p>'+(features.length?'<div class="kc-release-list"><b>WHAT’S NEW</b><ul>'+features.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')+(fixes.length?'<div class="kc-release-list"><b>FIXES & IMPROVEMENTS</b><ul>'+fixes.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')+'<small>Published by '+esc(r.published_by_name||'Kinetic Crew Super Admin')+'</small></article>';}
function showPopup(releases){
 const root=$('#modalRoot');if(!root||!releases.length)return;
 root.innerHTML='<div class="kc-release-backdrop" role="presentation"><section class="kc-release-modal" role="dialog" aria-modal="true" aria-labelledby="kcReleaseHeading"><div class="kc-release-mark">✳</div><div class="kc-release-kicker">KINETIC CREW / PRODUCT UPDATE</div><h2 id="kcReleaseHeading">Something new just landed.</h2><p class="kc-release-intro">The Super Admin has published an update for the whole crew.</p><div class="kc-release-scroll">'+releases.map(releaseCard).join('')+'</div><button class="primary full" id="kcReleaseGotIt">Explore the update ✓</button><small class="kc-release-foot">This update is saved in Notifications so you can read it again.</small></section></div>';
 play();
 $('#kcReleaseGotIt')?.addEventListener('click',async()=>{const ids=releases.map(r=>r.notification_id).filter(Boolean);try{for(const id of ids){const {error}=await client().rpc('crew_release_mark_read',{p_notification_id:id});if(error)throw error;}}catch(e){console.warn('Could not mark update read',e);}root.innerHTML='';await check(true);});
}
async function feed(){
 const {data,error}=await client().rpc('crew_release_feed');if(error)throw error;
 return data||{releases:[],unread_ids:[]};
}
async function check(force=false){
 if(checking||!client()?.auth)return;checking=true;
 try{
  const {data:session}=await client().auth.getSession();if(!session?.session?.user)return;
  const f=await feed();lastFeed=f;
  const unreadIds=new Set(f.unread_ids||[]),unread=(f.releases||[]).filter(r=>unreadIds.has(r.notification_id));
  const latest=unread.filter(r=>!window.__kcReleasePopupShown?.includes(r.notification_id));
  if(latest.length){window.__kcReleasePopupShown=[...(window.__kcReleasePopupShown||[]),...latest.map(r=>r.notification_id)];showPopup(latest);}
  renderHistory();
 }catch(e){console.warn('Release feed unavailable. Apply 202611090008_app_releases.sql.',e);}
 finally{checking=false;}
}
function renderHistory(){
 const app=$('#app');if(!app||!app.querySelector('.notification-list'))return;
 const f=lastFeed||{releases:[]};let host=$('#kcReleaseHistory');
 if(!host){host=document.createElement('section');host.id='kcReleaseHistory';host.className='kc-release-history';const list=app.querySelector('.notification-list');list?.before(host);}
 if(host)host.innerHTML='<div class="kc-release-heading"><div><span class="eyebrow">VERSION HISTORY</span><h2>App updates</h2><p>Every new feature and fix, in one place.</p></div></div>'+(f.releases?.length?f.releases.map(releaseCard).join(''):'<div class="kc-release-empty">No app releases have been published yet.</div>');
}
function renderSettings(){
 const app=$('#app');if(!app||!app.querySelector('.notification-list'))return;
 let host=$('#kcNotificationSettings');if(host)return;
 host=document.createElement('section');host.id='kcNotificationSettings';host.className='kc-notification-settings surface';
 const p=prefs();
 host.innerHTML='<div class="kc-settings-title"><div><span class="eyebrow">PERSONAL PREFERENCES</span><h2>Notification settings</h2><p>Choose how Kinetic Crew gets your attention.</p></div></div><div class="kc-notif-controls"><label class="field">In-app notification sound<select id="kcSound"><option value="kinetic">Kinetic signature</option><option value="chime">Soft chime</option><option value="pulse">Double pulse</option><option value="pop">Minimal pop</option><option value="none">Silent</option></select></label><label class="field">Sound volume <input id="kcVolume" type="range" min="0" max="1" step=".05" value="'+p.volume+'"></label><label class="kc-switch"><input id="kcVibrate" type="checkbox" '+(p.vibrate?'checked':'')+'> <span><b>Vibration</b><small>Vibrate on supported phones when a new release arrives.</small></span></label><div class="kc-notif-actions"><button class="outline" id="kcTestSound">Preview sound</button><button class="primary" id="kcSaveNotif">Save preferences</button></div><p class="kc-notif-note">Custom tones play for in-app alerts while the app is open. When the app is closed, notification sound is controlled by your device and browser notification settings.</p></div>';
 app.querySelector('.push-settings')?.after(host);
 $('#kcSound').value=p.sound;
}
function attach(){
 const app=$('#app');if(!app)return;
 if(app.querySelector('.notification-list')){renderSettings();renderHistory();}
}
document.addEventListener('click',e=>{
 if(e.target.closest('#kcTestSound')){const p=prefs();tone($('#kcSound')?.value||p.sound,Number($('#kcVolume')?.value??p.volume));if(p.vibrate&&navigator.vibrate)navigator.vibrate([60,35,60]);}
 if(e.target.closest('#kcSaveNotif')){const p={sound:$('#kcSound')?.value||'kinetic',volume:Number($('#kcVolume')?.value??.55),vibrate:!!$('#kcVibrate')?.checked};savePrefs(p);const b=$('#kcSaveNotif');if(b){b.textContent='Saved ✓';setTimeout(()=>b.textContent='Save preferences',1400);}}
});
async function init(){
 if(!client())return;
 observer=new MutationObserver(attach);observer.observe(document.body,{childList:true,subtree:true});
 await check();setInterval(()=>check(),30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check(true)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.kcNotificationSound={preview:tone,play,preferences:prefs};
})();