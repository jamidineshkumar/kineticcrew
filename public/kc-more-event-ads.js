(()=>{'use strict';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{const d=new Date(v);return Number.isNaN(+d)?'Date to be announced':d.toLocaleDateString([],{month:'short',day:'numeric'})};
const image=e=>{for(const v of [e.cover_url,e.image_url,e.banner_url,e.poster_url,e.image]){try{const u=new URL(String(v||''));if(u.protocol==='https:')return u.href}catch{}}return ''};
function render(root){
 if(!root||root.dataset.kcAdsReady==='yes')return;
 const api=window.KC_SEARCH_API;if(!api||typeof api.snapshot!=='function')return;
 const all=(api.snapshot().events||[]).filter(e=>e&&e.id&&e.title);
 const now=Date.now();
 const upcoming=all.filter(e=>new Date(e.starts_at).getTime()>=now).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const recent=all.filter(e=>new Date(e.starts_at).getTime()<now).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at));
 const events=[...upcoming,...recent].slice(0,6);
 if(!events.length){root.innerHTML='<div class="kc-more-event-ads"><div class="kc-more-ad-slide is-active" style="animation:none;opacity:1;visibility:visible"><div class="kc-more-ad-top"><span class="kc-more-ad-kicker">KINETIC CREW · EVENT SPOTLIGHT</span></div><div class="kc-more-ad-copy"><span class="kc-more-ad-label">STAY IN THE LOOP</span><h2>Your next crew moment starts here.</h2><p>New events and auditions will appear in this showcase.</p><button class="kc-more-ad-cta" type="button" data-view="events">Explore events <span>→</span></button></div></div></div>';root.dataset.kcAdsReady='yes';return;}
 const duration=5,cycle=events.length*duration;
 const slides=events.map((e,i)=>{
  const src=image(e),past=new Date(e.starts_at).getTime()<now;
  const category=String(e.category||'CREW EVENT').toUpperCase();
  const subtitle=[date(e.starts_at),e.location||'Venue to be announced'].filter(Boolean).join(' · ');
  const style='--kc-ad-duration:'+cycle+'s;--kc-ad-delay:'+(i*duration)+'s;'+(src?'--kc-more-ad-image:url("'+safe(src)+'");':'');
  return '<article class="kc-more-ad-slide" style="'+style+'"><div class="kc-more-ad-top"><span class="kc-more-ad-kicker">KINETIC CREW · '+safe(category)+'</span><span class="kc-more-ad-count">'+String(i+1).padStart(2,'0')+' / '+String(events.length).padStart(2,'0')+'</span></div><div class="kc-more-ad-bottom"><div class="kc-more-ad-copy"><span class="kc-more-ad-label">'+(past?'RECENT CREW EVENT':e.featured?'FEATURED EVENT':'UPCOMING EVENT')+'</span><h2>'+safe(e.title)+'</h2><p>'+safe(subtitle)+'</p><button class="kc-more-ad-cta" type="button" data-open-event="'+safe(e.id)+'">'+(e.registered?'View your ticket':'Explore event')+' <span>→</span></button></div></div></article>';
 }).join('');
 root.innerHTML='<div class="kc-more-event-ads" aria-label="Featured Kinetic Crew events"><div class="kc-more-ad-track">'+slides+'</div><div class="kc-more-ad-dots" aria-hidden="true">'+events.map((_,i)=>'<i class="'+(i===0?'active':'')+'" style="--kc-ad-duration:'+cycle+'s;--kc-ad-delay:'+(i*duration)+'s"></i>').join('')+'</div><div class="kc-more-ad-progress"><i style="--kc-ad-duration:'+cycle+'s"></i></div></div>';
 root.dataset.kcAdsReady='yes';
}
function scan(){document.querySelectorAll('.kc-more-intro').forEach(node=>{const wrap=node.parentElement;if(!wrap)return;render(node);if(node.dataset.kcAdsReady==='yes')node.classList.add('kc-more-event-ads-host');});}
const start=()=>{scan();new MutationObserver(scan).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();