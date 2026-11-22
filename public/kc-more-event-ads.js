(()=>{'use strict';
const DURATION=6500,mounted=new WeakMap();
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>{const d=new Date(v);return Number.isNaN(+d)?'Date to be announced':d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});};
const validUrl=v=>{try{const u=new URL(String(v||''),location.href);return u.protocol==='https:'||u.origin===location.origin?u.href:'';}catch{return '';}};
function mergeSlides(events,ads,settings={}){
 const now=Date.now(),eventSlides=(settings.show_upcoming_events===false?[]:(events||[])).filter(e=>e&&e.id&&e.title&&e.starts_at&&new Date(e.starts_at).getTime()>=now&&e.event_status!=='cancelled').sort((a,b)=>Number(!!b.featured)-Number(!!a.featured)||new Date(a.starts_at)-new Date(b.starts_at)).map(e=>({kind:'event',id:'event-'+e.id,title:e.title,caption:[date(e.starts_at),e.location||'Venue to be announced',e.event_status&&e.event_status!=='scheduled'?String(e.event_status).toUpperCase():''].filter(Boolean).join(' · '),media_type:'image',media_url:validUrl(e.cover_url||e.image_url||e.banner_url||e.poster_url||e.image),label:'UPCOMING EVENT'}));
 const promoSlides=(settings.show_promotions===false?[]:(ads||[])).filter(a=>a&&a.media_url&&a.is_active!==false).map(a=>({...a,kind:'promotion',media_url:validUrl(a.media_url)})).filter(a=>a.media_url);
 const result=[];let ei=0,pi=0;while(ei<eventSlides.length||pi<promoSlides.length){if(ei<eventSlides.length)result.push(eventSlides[ei++]);if(pi<promoSlides.length)result.push(promoSlides[pi++]);}return result;
}
function render(root){
 if(!root)return;
 const api=window.KC_SEARCH_API,snapshot=api&&typeof api.snapshot==='function'?api.snapshot():{};
 const slides=mergeSlides(snapshot.events||[],root._kcMoreAds||[],root._kcMoreAdsSettings||{});
 const signature=JSON.stringify(slides.map(s=>[s.id,s.title,s.caption,s.media_type,s.media_url]));
 if(root.dataset.kcAdsReady==='yes'&&root.dataset.kcAdsSignature===signature)return;
 const old=mounted.get(root);if(old?.timer)clearTimeout(old.timer);
 if(!slides.length){root.innerHTML='';root.hidden=true;root.dataset.kcAdsReady='yes';root.dataset.kcAdsSignature=signature;return;}root.hidden=false;
 root.innerHTML='<section class="kc-more-ads-banner" aria-label="Kinetic Crew events and promotions"><div class="kc-more-ads-glow"></div><div class="kc-more-ads-track">'+slides.map((s,i)=>{
  const media=s.media_type==='video'?'<video class="kc-more-ads-media" muted playsinline webkit-playsinline preload="'+(i===0?'auto':'metadata')+'" src="'+safe(s.media_url)+'"></video><div class="kc-more-ads-video-action"><button type="button" data-video-play="'+i+'">▶ Tap to play video</button></div>':(s.media_url?'<img class="kc-more-ads-media" src="'+safe(s.media_url)+'" alt="" loading="'+(i===0?'eager':'lazy')+'">':'');
  return '<article class="kc-more-ads-slide'+(i===0?' is-active':'')+'" data-slide="'+i+'" aria-hidden="'+(i===0?'false':'true')+'">'+media+'<div class="kc-more-ads-shade"></div>'+(s.kind==='campaign'?'<span class="kc-more-ads-sponsored">SPONSORED</span>':'')+(s.title?'<div class="kc-more-ads-copy"><h2>'+safe(s.title)+'</h2>'+(s.kind==='campaign'&&s.caption?'<p>'+safe(s.caption)+'</p>':'')+(s.kind==='campaign'&&validUrl(s.destination_url)?'<a href="'+safe(validUrl(s.destination_url))+'" target="_blank" rel="noopener noreferrer" data-ad-click="'+safe(s.id)+'">Learn more ↗</a>':'')+'</div>':'')+'</article>';
 }).join('')+'</div>'+(slides.length>1?'<div class="kc-more-ads-dots">'+slides.map((s,i)=>'<button type="button" data-slide-to="'+i+'" class="'+(i===0?'active':'')+'" aria-label="Show slide '+(i+1)+'"></button>').join('')+'</div>':'')+'</section>';
 const nodes=[...root.querySelectorAll('.kc-more-ads-slide')],dots=[...root.querySelectorAll('[data-slide-to]')],bar=root.querySelector('.kc-more-ads-progress i'),count=root.querySelector('.kc-more-ads-count');let active=0,timer=null;
 const MAX_VIDEO_MS=18000;const tryPlay=video=>{video.muted=true;video.defaultMuted=true;video.playsInline=true;video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('autoplay','');const slide=video.closest('.kc-more-ads-slide'),action=slide?.querySelector('.kc-more-ads-video-action');const attempt=video.play();if(attempt?.then)attempt.then(()=>{slide?.classList.remove('video-needs-tap');if(action)action.hidden=true;}).catch(()=>{slide?.classList.add('video-needs-tap');if(action)action.hidden=false;});};
 const show=i=>{clearTimeout(timer);active=(i+nodes.length)%nodes.length;nodes.forEach((n,k)=>{n.classList.toggle('is-active',k===active);n.setAttribute('aria-hidden',k===active?'false':'true');const v=n.querySelector('video');if(v){if(k===active){try{v.currentTime=0;}catch{}tryPlay(v);}else{v.pause();try{v.currentTime=0;}catch{}}}});dots.forEach((d,k)=>d.classList.toggle('active',k===active));if(count)count.textContent=String(active+1).padStart(2,'0')+' / '+String(nodes.length).padStart(2,'0');if(bar){bar.style.animation='none';void bar.offsetWidth;bar.style.animation=nodes[active]?.querySelector('video')?'none':'kcMoreAdsProgress '+(DURATION/1000)+'s linear forwards';}const activeVideo=nodes[active]?.querySelector('video');timer=setTimeout(()=>{if(activeVideo&&nodes.length===1){try{activeVideo.currentTime=0;}catch{}tryPlay(activeVideo);}else show(active+1);},activeVideo?MAX_VIDEO_MS:DURATION);};
 nodes.forEach((n,k)=>{const v=n.querySelector('video');if(v){v.addEventListener('ended',()=>{if(k===active)show(active+1);});v.addEventListener('error',()=>{n.classList.add('media-error');const action=n.querySelector('.kc-more-ads-video-action'),button=action?.querySelector('button');if(action)action.hidden=false;if(button){button.textContent='Video unavailable';button.disabled=true;}if(k===active)timer=setTimeout(()=>show(active+1),DURATION);});}const img=n.querySelector('img');if(img)img.addEventListener('error',()=>n.classList.add('media-error'));});
 dots.forEach(d=>d.addEventListener('click',()=>show(Number(d.dataset.slideTo))));
 root.onclick=e=>{const click=e.target.closest('[data-ad-click]');if(click){window.kcSupabase?.rpc('crew_ads_track',{p_id:click.dataset.adClick,p_kind:'click'});return;}const button=e.target.closest('[data-video-play]');if(!button)return;const index=Number(button.dataset.videoPlay),video=nodes[index]?.querySelector('video');if(!video)return;video.muted=true;video.play().then(()=>{nodes[index].classList.remove('video-needs-tap');button.parentElement.hidden=true;}).catch(()=>{button.textContent='Tap again to play';});};
 let x=0,y=0;const stage=root.querySelector('.kc-more-ads-track');stage?.addEventListener('touchstart',e=>{const t=e.changedTouches?.[0];x=t?.clientX||0;y=t?.clientY||0;},{passive:true});stage?.addEventListener('touchend',e=>{const t=e.changedTouches?.[0],dx=(t?.clientX||0)-x,dy=(t?.clientY||0)-y;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy))show(active+(dx<0?1:-1));},{passive:true});
 show(0);mounted.set(root,{timer});root.dataset.kcAdsReady='yes';root.dataset.kcAdsSignature=signature;
}
async function loadPromotions(root){const client=window.kcSupabase;if(!client||!client.rpc){root._kcMoreAds=[];render(root);return;}try{const [{data,error},campaigns]=await Promise.all([client.rpc('crew_more_ads_public_get'),client.rpc('crew_ads_public_get',{p_placement:'more'})]);if(error)throw error;if(data?.ok!==true)throw Error(data?.message||'Promotional slides could not be loaded.');root._kcMoreAds=Array.isArray(data.items)?data.items:[];const paid=campaigns.data?.enabled===true?(campaigns.data.items||[]):[];root._kcMoreAds.push(...paid.map(a=>({...a,kind:'campaign',label:'SPONSORED'})));root._kcMoreAdsSettings={show_upcoming_events:data.show_upcoming_events!==false,show_promotions:data.show_promotions!==false};paid.forEach(a=>client.rpc('crew_ads_track',{p_id:a.id,p_kind:'impression'}));}catch(error){console.warn('More-page promotions unavailable:',error);root._kcMoreAds=[];root._kcMoreAdsSettings={show_promotions:false};}render(root);}
function scan(){document.querySelectorAll('.kc-more-intro').forEach(root=>{if(!root.parentElement)return;if(root.dataset.kcAdsBound!=='yes'){root.dataset.kcAdsBound='yes';root.classList.add('kc-more-event-ads-host');loadPromotions(root);}else render(root);});}

async function loadHomeAd(slot){
 const client=window.kcSupabase;
 if(!client?.rpc){slot.hidden=true;slot.dataset.loaded='yes';return;}
 try{
  const {data,error}=await client.rpc('crew_ads_public_get',{p_placement:'home'});
  if(error)throw error;
  const items=Array.isArray(data?.items)?data.items:[];
  if(data?.enabled!==true||!items.length){slot.hidden=true;slot.dataset.loaded='yes';return;}
  let active=0;const eligible=items.filter(a=>a.ad_format==='native'||a.ad_format==='banner');if(!eligible.length){slot.hidden=true;slot.dataset.loaded='yes';return;}const ad=eligible[active],url=validUrl(ad.media_url);
  if(!url){slot.hidden=true;slot.dataset.loaded='yes';return;}
  const media=ad.media_type==='video'
   ?'<video class="kc-app-ad-media" src="'+safe(url)+'" muted autoplay loop playsinline webkit-playsinline preload="metadata"></video>'
   :'<img class="kc-app-ad-media" src="'+safe(url)+'" alt="" loading="lazy">';
  const href=validUrl(ad.destination_url);slot.innerHTML='<article class="kc-app-ad-card" data-campaign="'+safe(ad.id)+'"><span class="kc-app-ad-sponsored">SPONSORED</span>'+media+'<div class="kc-app-ad-shade"></div><div class="kc-app-ad-copy"><small>SPONSORED · '+(ad.ad_format==='banner'?'BANNER':'PROMOTION')+'</small><b>'+safe(ad.title||'A Kinetic Crew update')+'</b>'+(ad.caption?'<p>'+safe(ad.caption)+'</p>':'')+(href?'<a class="kc-app-ad-cta" href="'+safe(href)+'" target="_blank" rel="noopener noreferrer">Learn more ↗</a>':'')+'</div></article>';try{client.rpc('crew_ads_track',{p_id:ad.id,p_kind:'impression'});}catch{}
  slot.hidden=false;slot.dataset.loaded='yes';
  const video=slot.querySelector('video');if(video){video.muted=true;video.defaultMuted=true;video.play().catch(()=>{});}
  const image=slot.querySelector('img');if(image)image.addEventListener('error',()=>{slot.hidden=true;});slot.onclick=e=>{const link=e.target.closest('a');if(link){const id=slot.querySelector('[data-campaign]')?.dataset.campaign;if(id)client.rpc('crew_ads_track',{p_id:id,p_kind:'click'});}};
 }catch(error){console.warn('Home ads unavailable:',error);slot.hidden=true;slot.dataset.loaded='yes';}
}
function scanHomeAds(){
 document.querySelectorAll('.kc-exact-home').forEach(home=>{
  const latest=home.querySelector('.kc-home-latest-section');if(!latest)return;
  let slot=home.querySelector('.kc-app-ad-slot');
  if(!slot){slot=document.createElement('section');slot.className='kc-app-ad-slot';slot.setAttribute('aria-label','Sponsored crew promotion');latest.insertAdjacentElement('afterend',slot);}
  if(slot.dataset.loaded!=='yes'&&slot.dataset.loaded!=='loading'){slot.dataset.loaded='loading';loadHomeAd(slot);}
 });
}

function start(){scan();scanHomeAds();const target=document.getElementById('app')||document.body;new MutationObserver(()=>{scan();scanHomeAds();}).observe(target,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('kc:more-ads-refresh',()=>document.querySelectorAll('.kc-more-intro').forEach(root=>{root.dataset.kcAdsReady='no';loadPromotions(root);}));
window.addEventListener('kc:app-ads-refresh',()=>document.querySelectorAll('.kc-app-ad-slot').forEach(slot=>{slot.dataset.loaded='loading';slot.hidden=false;loadHomeAd(slot);}));
})();