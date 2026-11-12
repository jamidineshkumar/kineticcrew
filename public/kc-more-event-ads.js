(()=>{'use strict';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(root){
 if(!root||root.dataset.kcAdsReady==='yes')return;
 const slides=[
  {eyebrow:'THE MOVEMENT STARTS HERE',title:'KINETIC<br><em>CREW.</em>',sub:'A creative community powered by dance, performance and people.',tag:'DANCE  ·  CREATE  ·  PERFORM'},
  {eyebrow:'MORE THAN A CREW. A CULTURE.',title:'ONE CREW.<br>ONE <em>RHYTHM.</em>',sub:'We bring talent together, build confidence and turn shared passion into unforgettable moments.',tag:'BUILT TO MOVE TOGETHER'}
 ];
 root.innerHTML='<div class="kc-more-brand-intro" role="region" aria-label="Kinetic Crew introduction"><div class="kc-brand-intro-glow"></div><div class="kc-brand-intro-top"><span>THE KINETIC CREW EXPERIENCE</span><b>KC&nbsp; / &nbsp;01</b></div><div class="kc-brand-intro-stage">'+slides.map((s,i)=>'<article class="kc-brand-intro-slide'+(i===0?' is-active':'')+'" aria-hidden="'+(i===0?'false':'true')+'"><small>'+safe(s.eyebrow)+'</small><h2>'+s.title+'</h2><p>'+safe(s.sub)+'</p><strong>'+safe(s.tag)+'</strong></article>').join('')+'</div><div class="kc-brand-intro-bottom"><span>01</span><div class="kc-brand-intro-progress"><i></i></div><span>02</span></div><span class="kc-brand-intro-watermark" aria-hidden="true">KC</span></div>';
 const nodes=[...root.querySelectorAll('.kc-brand-intro-slide')],bar=root.querySelector('.kc-brand-intro-progress i');let active=0;
 const show=i=>{active=i%nodes.length;nodes.forEach((n,k)=>{n.classList.toggle('is-active',k===active);n.setAttribute('aria-hidden',k===active?'false':'true');});if(bar){bar.style.animation='none';void bar.offsetWidth;bar.style.animation='kcBrandIntroProgress 8s linear forwards';}};
 show(0);if(root._kcBrandTimer)clearInterval(root._kcBrandTimer);root._kcBrandTimer=setInterval(()=>show(active+1),4000);
 root.dataset.kcAdsReady='yes';
}
function scan(){
 document.querySelectorAll('.kc-more-brand-intro').forEach(n=>{if(!n.isConnected&&n._kcBrandTimer){clearInterval(n._kcBrandTimer);n._kcBrandTimer=null;}});
 document.querySelectorAll('.kc-more-intro').forEach(root=>{if(!root.parentElement)return;render(root);if(root.dataset.kcAdsReady==='yes')root.classList.add('kc-more-event-ads-host');});
}
const start=()=>{scan();new MutationObserver(scan).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();