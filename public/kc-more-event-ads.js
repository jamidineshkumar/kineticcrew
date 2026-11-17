(()=>{'use strict';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mountedRoots=new Set(),DURATION=5000;
const date=v=>{const d=new Date(v);return Number.isNaN(+d)?'Date to be announced':d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})};
const updated=e=>!!(e?.created_at&&e?.updated_at&&new Date(e.updated_at).getTime()-new Date(e.created_at).getTime()>5000);
function render(root){
 if(!root)return;
 const api=window.KC_SEARCH_API,snapshot=api&&typeof api.snapshot==='function'?api.snapshot():{};
 const now=Date.now();
 // Use the same upcoming event dataset as the Events page. Do not mix announcements,
 // brand interstitials or past events into the featured-events banner.
 const events=(snapshot.events||[]).filter(e=>e&&e.id&&e.title&&new Date(e.starts_at).getTime()>=now)
  .sort((a,b)=>Number(!!b.featured)-Number(!!a.featured)||new Date(a.starts_at)-new Date(b.starts_at)).slice(0,5);
 const signature=JSON.stringify(events.map(e=>[e.id,e.title,e.starts_at,e.location,e.updated_at,e.registered,e.featured,e.event_status]));
 if(root.dataset.kcAdsReady==='yes'&&root.dataset.kcAdsSignature===signature)return;
 if(root._kcBrandTimer)clearInterval(root._kcBrandTimer);
 const slides=events.length?events:[null];
 const renderSlide=(e,i)=>{
  if(!e)return '<article class="kc-brand-intro-slide is-active" data-slide="0"><small>UPCOMING CREW EVENTS</small><h2 class="kc-brand-content-title">Your next crew moment is coming.</h2><p>No upcoming events are scheduled right now. Check Events for the latest updates.</p><button type="button" class="kc-brand-intro-cta" data-view="events">VIEW EVENTS <span>→</span></button></article>';
  const status=e.event_status&&e.event_status!=='scheduled'?'<span class="kc-event-updated-chip">'+safe(String(e.event_status).toUpperCase())+'</span>':updated(e)?'<span class="kc-event-updated-chip">UPDATED</span>':'';
  return '<article class="kc-brand-intro-slide'+(i===0?' is-active':'')+'" data-slide="'+i+'">'+status+'<small>UPCOMING EVENT · '+safe(String(e.category||'KINETIC CREW').toUpperCase())+'</small><h2 class="kc-brand-content-title">'+safe(e.title)+'</h2><p>'+safe(date(e.starts_at))+' · '+safe(e.location||'Venue to be announced')+'</p><button type="button" class="kc-brand-intro-cta" data-open-event="'+safe(e.id)+'">'+(e.registered?'VIEW YOUR TICKET':'VIEW EVENT')+' <span>→</span></button></article>';
 };
 root.innerHTML='<div class="kc-more-brand-intro" role="region" aria-label="Upcoming Kinetic Crew events"><div class="kc-brand-intro-glow"></div><div class="kc-brand-intro-top"><span>UPCOMING CREW EVENTS</span><b>KC / LIVE</b></div><div class="kc-brand-intro-stage">'+slides.map(renderSlide).join('')+'</div><div class="kc-brand-intro-bottom"><span class="kc-brand-slide-count">01 / '+String(slides.length).padStart(2,'0')+'</span><div class="kc-brand-intro-progress"><i></i></div><span>5 SEC / SLIDE</span></div><span class="kc-brand-intro-watermark" aria-hidden="true">KC</span></div>';
 const nodes=[...root.querySelectorAll('.kc-brand-intro-slide')],bar=root.querySelector('.kc-brand-intro-progress i'),count=root.querySelector('.kc-brand-slide-count');let active=0;
 const show=i=>{active=(i+nodes.length)%nodes.length;nodes.forEach((n,k)=>{n.classList.toggle('is-active',k===active);n.setAttribute('aria-hidden',k===active?'false':'true');});if(count)count.textContent=String(active+1).padStart(2,'0')+' / '+String(nodes.length).padStart(2,'0');if(bar){bar.style.animation='none';void bar.offsetWidth;bar.style.animation='kcBrandIntroProgress 5s linear forwards';}};
 show(0);
 if(nodes.length>1)root._kcBrandTimer=setInterval(()=>show(active+1),DURATION);
 root.dataset.kcAdsReady='yes';root.dataset.kcAdsSignature=signature;mountedRoots.add(root);
}
function scan(){
 mountedRoots.forEach(root=>{if(!root.isConnected){if(root._kcBrandTimer)clearInterval(root._kcBrandTimer);root._kcBrandTimer=null;mountedRoots.delete(root);}});
 document.querySelectorAll('.kc-more-intro').forEach(root=>{if(!root.parentElement)return;render(root);if(root.dataset.kcAdsReady==='yes')root.classList.add('kc-more-event-ads-host');});
}
const start=()=>{scan();new MutationObserver(scan).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();