(()=>{'use strict';
const DURATION=6500, mounted=new WeakMap();
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{const d=new Date(v);return Number.isNaN(+d)?'Date to be announced':d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});};
const validUrl=v=>{try{const u=new URL(String(v||''),location.href);return u.protocol==='https:'||u.origin===location.origin?u.href:'';}catch{return '';}};
function mergeSlides(events,ads){
 const now=Date.now(),eventSlides=(events||[]).filter(e=>e&&e.id&&e.title&&e.starts_at&&new Date(e.starts_at).getTime()>=now&&e.event_status!=='cancelled')
 .sort((a,b)=>Number(!!b.featured)-Number(!!a.featured)||new Date(a.starts_at)-new Date(b.starts_at))
 .map(e=>({kind:'event',id:'event-'+e.id,title:e.title,caption:[date(e.starts_at),e.location||'Venue to be announced',e.event_status&&e.event_status!=='scheduled'?String(e.event_status).toUpperCase():''].filter(Boolean).join(' · '),media_type:'image',media_url:validUrl(e.cover_url||e.poster_url),label:'UPCOMING EVENT'}));
 const promoSlides=(ads||[]).filter(a=>a&&a.media_url).map(a=>({...a,kind:'promotion',label:'KINETIC CREW · PROMOTION',media_url:validUrl(a.media_url)})).filter(a=>a.media_url);
 const result=[];let ei=0,pi=0;
 while(ei<eventSlides.length||pi<promoSlides.length){
  if(ei<eventSlides.length)result.push(eventSlides[ei++]);
  if(pi<promoSlides.length)result.push(promoSlides[pi++]);
 }
 return result;
}
function render(root){
 if(!root)return;
 const api=window.KC_SEARCH_API,snapshot=api&&typeof api.snapshot==='function'?api.snapshot():{};
 const slides=mergeSlides(snapshot.events||[],root._kcMoreAds||[]);
 const signature=JSON.stringify(slides.map(s=>[s.id,s.title,s.caption,s.media_type,s.media_url]));
 if(root.dataset.kcAdsReady==='yes'&&root.dataset.kcAdsSignature===signature)return;
 const old=mounted.get(root);if(old)clearInterval(old.timer);
 if(!slides.length){
  root.innerHTML='<div class="kc-more-ads-empty"><span>KC / LIVE</span><b>One crew. One rhythm.</b><p>Upcoming events and crew promotions will appear here.</p></div>';
  root.dataset.kcAdsReady='yes';root.dataset.kcAdsSignature=signature;return;
 }
 root.innerHTML='<section class="kc-more-ads-banner" aria-label="Kinetic Crew events and promotions"><div class="kc-more-ads-glow"></div><div class="kc-more-ads-track">'+slides.map((s,i)=>{
  const media=s.media_type==='video'?'<video class="kc-more-ads-media" muted playsinline loop preload="metadata"'+(i===0?' autoplay':'')+' src="'+safe(s.media_url)+'"></video>':(s.media_url?'<img class="kc-more-ads-media" src="'+safe(s.media_url)+'" alt="" loading="'+(i===0?'eager':'lazy')+'">':'');
  return '<article class="kc-more-ads-slide'+(i===0?' is-active':'')+'" data-slide="'+i+'" aria-hidden="'+(i===0?'false':'true')+'">'+media+'<div class="kc-more-ads-shade"></div><div class="kc-more-ads-copy"><small>'+safe(s.label)+'</small><h2>'+safe(s.title||'Kinetic Crew')+'</h2>'+(s.caption?'<p>'+safe(s.caption)+'</p>':'')+'</div></article>';
 }).join('')+'</div><div class="kc-more-ads-controls"><span class="kc-more-ads-count">01 / '+String(slides.length).padStart(2,'0')+'</span><div class="kc-more-ads-dots">'+slides.map((s,i)=>'<button type="button" data-slide-to="'+i+'" class="'+(i===0?'active':'')+'" aria-label="Show slide '+(i+1)+'"></button>').join('')+'</div><span class="kc-more-ads-brand">KINETIC CREW</span></div><div class="kc-more-ads-progress"><i></i></div></section>';
 const nodes=[...root.querySelectorAll('.kc-more-ads-slide')],dots=[...root.querySelectorAll('[data-slide-to]')],bar=root.querySelector('.kc-more-ads-progress i'),count=root.querySelector('.kc-more-ads-count');let active=0,timer=null;
 const show=i=>{active=(i+nodes.length)%nodes.length;nodes.forEach((n,k)=>{n.classList.toggle('is-active',k===active);n.setAttribute('aria-hidden',k===active?'false':'true');const v=n.querySelector('video');if(v){if(k===active){v.play().catch(()=>{});}else{v.pause();v.currentTime=0;}}});dots.forEach((d,k)=>d.classList.toggle('active',k===active));if(count)count.textContent=String(active+1).padStart(2,'0')+' / '+String(nodes.length).padStart(2,'0');if(bar){bar.style.animation='none';void bar.offsetWidth;bar.style.animation='kcMoreAdsProgress '+(DURATION/1000)+'s linear forwards';}};
 const restart=()=>{clearInterval(timer);timer=nodes.length>1?setInterval(()=>show(active+1),DURATION):null;};
 dots.forEach(d=>d.addEventListener('click',()=>{show(Number(d.dataset.slideTo));restart();}));
 let x=0,y=0;const stage=root.querySelector('.kc-more-ads-track');
 stage?.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];x=t?.clientX||0;y=t?.clientY||0;},{passive:true});
 stage?.addEventListener('touchend',e=>{const t=e.changedTouches?.[0],dx=(t?.clientX||0)-x,dy=(t?.clientY||0)-y;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)){show(active+(dx<0?1:-1));restart();}},{passive:true});
 show(0);restart();mounted.set(root,{timer});
 root.dataset.kcAdsReady='yes';root.dataset.kcAdsSignature=signature;
}
async function loadPromotions(root){
 const client=window.kcSupabase;if(!client||!client.rpc){root._kcMoreAds=[];render(root);return;}
 try{const {data,error}=await client.rpc('crew_more_ads_public_get');if(error)throw error;root._kcMoreAds=Array.isArray(data?.items)?data.items:[];}
 catch(error){console.warn('More-page promotions unavailable:',error);root._kcMoreAds=[];}
 render(root);
}
function scan(){
 document.querySelectorAll('.kc-more-intro').forEach(root=>{
  if(!root.parentElement)return;
  if(root.dataset.kcAdsBound!=='yes'){root.dataset.kcAdsBound='yes';root.classList.add('kc-more-event-ads-host');loadPromotions(root);}
  else render(root);
 });
}
function start(){scan();const target=document.getElementById('app')||document.body;new MutationObserver(scan).observe(target,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('kc:more-ads-refresh',()=>document.querySelectorAll('.kc-more-intro').forEach(loadPromotions));
})();