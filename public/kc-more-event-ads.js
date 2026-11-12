(()=>{'use strict';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mountedRoots=new Set(),DURATION=4000;
const date=v=>{const d=new Date(v);return Number.isNaN(+d)?'Date to be announced':d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})};
function render(root){
 if(!root||root.dataset.kcAdsReady==='yes')return;
 const api=window.KC_SEARCH_API,snapshot=api&&typeof api.snapshot==='function'?api.snapshot():{};
 const events=(snapshot.events||[]).filter(e=>e&&e.id&&e.title).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 const announcements=(snapshot.announcements||[]).filter(a=>a&&a.title).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const now=Date.now(),upcoming=events.filter(e=>new Date(e.starts_at).getTime()>=now),recent=events.filter(e=>new Date(e.starts_at).getTime()<now).reverse();
 const slides=[
  {type:'brand',eyebrow:'',title:'KINETIC <em>CREW</em>',sub:'',tag:''},
  ...announcements.slice(0,4).map(a=>({type:'update',item:a})),
  ...upcoming.slice(0,5).map(e=>({type:'event',item:e})),
  {type:'brand',eyebrow:'CREW IDENTITY',title:'ONE CREW.<br>ONE <em>RHYTHM.</em>',sub:'',tag:'FOUNDED BY DINUVOX'},
  ...recent.slice(0,3).map(e=>({type:'event',item:e,past:true}))
 ];
 if(slides.length===2)slides.push({type:'community'});
 // User-requested carousel order: exchange slide 2 and slide 3.
 if(slides.length>=3)[slides[1],slides[2]]=[slides[2],slides[1]];
 const renderSlide=(s,i)=>{
  const n=String(i+1).padStart(2,'0'),total=String(slides.length).padStart(2,'0');
  if(s.type==='brand')return '<article class="kc-brand-intro-slide is-active" data-slide="'+i+'">'+(s.eyebrow?'<small>'+safe(s.eyebrow)+'</small>':'')+'<h2>'+s.title+'</h2>'+(s.sub?'<p>'+safe(s.sub)+'</p>':'')+(s.tag?'<strong>'+safe(s.tag)+'</strong>':'')+'</article>';
  if(s.type==='update'){const a=s.item;return '<article class="kc-brand-intro-slide" data-slide="'+i+'"><small>CREW UPDATE · '+safe(date(a.created_at))+'</small><h2 class="kc-brand-content-title">'+safe(a.title)+'</h2><p>'+safe(a.body||'A new update from your crew.')+'</p><button type="button" class="kc-brand-intro-cta" data-view="updates">READ CREW UPDATE <span>→</span></button></article>';}
  if(s.type==='event'){const e=s.item,wasUpdated=e.created_at&&e.updated_at&&new Date(e.updated_at).getTime()-new Date(e.created_at).getTime()>5000;return '<article class="kc-brand-intro-slide" data-slide="'+i+'"><small>'+(wasUpdated?'EVENT UPDATED':s.past?'FROM OUR CREW ARCHIVE':'UPCOMING CREW EVENT')+' · '+safe(String(e.category||'EVENT').toUpperCase())+'</small><h2 class="kc-brand-content-title">'+safe(e.title)+'</h2><p>'+safe(date(e.starts_at))+' · '+safe(e.location||'Venue to be announced')+'</p><button type="button" class="kc-brand-intro-cta" data-open-event="'+safe(e.id)+'">'+(e.registered?'VIEW YOUR TICKET':'EXPLORE EVENT')+' <span>→</span></button></article>';}
  return '<article class="kc-brand-intro-slide" data-slide="'+i+'"><small>THE KINETIC CREW COMMUNITY</small><h2 class="kc-brand-content-title">YOUR NEXT<br><em>CHAPTER.</em></h2><p>Discover events, crew stories and the latest announcements.</p><button type="button" class="kc-brand-intro-cta" data-view="events">EXPLORE THE CREW <span>→</span></button></article>';
 };
 root.innerHTML='<div class="kc-more-brand-intro" role="region" aria-label="Kinetic Crew, events and latest updates"><div class="kc-brand-intro-glow"></div><div class="kc-brand-intro-top"><span>THE KINETIC CREW EXPERIENCE</span><b>KC / LIVE</b></div><div class="kc-brand-intro-stage">'+slides.map(renderSlide).join('')+'</div><div class="kc-brand-intro-bottom"><span class="kc-brand-slide-count">01 / '+String(slides.length).padStart(2,'0')+'</span><div class="kc-brand-intro-progress"><i></i></div><span>4 SEC / SLIDE</span></div><span class="kc-brand-intro-watermark" aria-hidden="true">KC</span></div>';
 const nodes=[...root.querySelectorAll('.kc-brand-intro-slide')],bar=root.querySelector('.kc-brand-intro-progress i'),count=root.querySelector('.kc-brand-slide-count');let active=0;
 const show=i=>{active=(i+nodes.length)%nodes.length;nodes.forEach((n,k)=>{n.classList.toggle('is-active',k===active);n.setAttribute('aria-hidden',k===active?'false':'true');});if(count)count.textContent=String(active+1).padStart(2,'0')+' / '+String(nodes.length).padStart(2,'0');if(bar){bar.style.animation='none';void bar.offsetWidth;bar.style.animation='kcBrandIntroProgress 4s linear forwards';}};
 show(0);if(root._kcBrandTimer)clearInterval(root._kcBrandTimer);root._kcBrandTimer=setInterval(()=>show(active+1),DURATION);
 root.dataset.kcAdsReady='yes';mountedRoots.add(root);
}
function scan(){
 mountedRoots.forEach(root=>{if(!root.isConnected){if(root._kcBrandTimer)clearInterval(root._kcBrandTimer);root._kcBrandTimer=null;mountedRoots.delete(root);}});
 document.querySelectorAll('.kc-more-intro').forEach(root=>{if(!root.parentElement)return;render(root);if(root.dataset.kcAdsReady==='yes')root.classList.add('kc-more-event-ads-host');});
}
const start=()=>{scan();new MutationObserver(scan).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();