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
 const slides=[];
 const promo=(index)=>({kind:'promo',index});
 if(!events.length)slides.push(promo(0));
 events.forEach((e,i)=>{
  slides.push({kind:'event',event:e,index:slides.length});
  slides.push(promo(slides.length));
 });
 const slot=5,cycle=slides.length*slot,windowPct=100/slides.length;
 const keyframes=slides.map((slide,i)=>{
  const start=i*windowPct,end=(i+1)*windowPct,fade=Math.min(.8,windowPct*.035);
  const a=(start+fade).toFixed(4),b=(end-fade).toFixed(4);
  return '@keyframes kcMoreAdSlide'+i+'{0%,'+start.toFixed(4)+'%{opacity:0;visibility:hidden;transform:translate3d(20px,0,0) scale(.985)}'+a+'%,'+b+'%{opacity:1;visibility:visible;transform:translate3d(0,0,0) scale(1)}'+end.toFixed(4)+'%,100%{opacity:0;visibility:hidden;transform:translate3d(-16px,0,0) scale(1.012)}}';
 }).join('');
 const markup=slides.map((slide,i)=>{
  const common='--kc-ad-duration:'+cycle+'s;animation-name:kcMoreAdSlide'+i+';animation-duration:'+cycle+'s;animation-delay:0s;';
  if(slide.kind==='promo'){
   return '<article class="kc-more-ad-slide kc-more-ad-promo" style="'+common+'"><div class="kc-more-ad-top"><span class="kc-more-ad-kicker">THE MOVEMENT · KINETIC CREW</span><span class="kc-more-ad-count">KC / '+String(i+1).padStart(2,'0')+'</span></div><div class="kc-more-ad-bottom"><div class="kc-more-ad-copy"><span class="kc-more-ad-label">MORE THAN A CREW. A CULTURE.</span><h2>ONE CREW.<br>ONE RHYTHM.<br><em>INFINITE ENERGY.</em></h2><p>Dance. Perform. Create. Belong. Be part of something that moves together.</p><button class="kc-more-ad-cta" type="button" data-view="people">MEET THE CREW <span>→</span></button></div></div></article>';
  }
  const e=slide.event,src=image(e),past=new Date(e.starts_at).getTime()<now;
  const category=String(e.category||'CREW EVENT').toUpperCase();
  const subtitle=[date(e.starts_at),e.location||'Venue to be announced'].filter(Boolean).join(' · ');
  const style=common+(src?'--kc-more-ad-image:url("'+safe(src)+'");':'');
  return '<article class="kc-more-ad-slide" style="'+style+'"><div class="kc-more-ad-top"><span class="kc-more-ad-kicker">KINETIC CREW · '+safe(category)+'</span><span class="kc-more-ad-count">'+String(i+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0')+'</span></div><div class="kc-more-ad-bottom"><div class="kc-more-ad-copy"><span class="kc-more-ad-label">'+(past?'RECENT CREW EVENT':e.featured?'FEATURED EVENT':'UPCOMING EVENT')+'</span><h2>'+safe(e.title)+'</h2><p>'+safe(subtitle)+'</p><button class="kc-more-ad-cta" type="button" data-open-event="'+safe(e.id)+'">'+(e.registered?'View your ticket':'Explore event')+' <span>→</span></button></div></div></article>';
 }).join('');
 root.innerHTML='<style>'+keyframes+'</style><div class="kc-more-event-ads" aria-label="Kinetic Crew events and promotions"><div class="kc-more-ad-track">'+markup+'</div><div class="kc-more-ad-dots" aria-hidden="true">'+slides.map((_,i)=>'<i class="'+(i===0?'active':'')+'" style="--kc-ad-duration:'+cycle+'s"></i>').join('')+'</div><div class="kc-more-ad-progress"><i style="--kc-ad-duration:'+cycle+'s"></i></div></div>';
 root.dataset.kcAdsReady='yes';
}
function scan(){document.querySelectorAll('.kc-more-intro').forEach(node=>{if(!node.parentElement)return;render(node);if(node.dataset.kcAdsReady==='yes')node.classList.add('kc-more-event-ads-host');});}
const start=()=>{scan();new MutationObserver(scan).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();