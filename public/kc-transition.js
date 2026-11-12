/* Kinetic Crew brief startup transition. Always dismisses; never blocks the app. */
(()=>{'use strict';
const app=document.getElementById('app');
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';
overlay.setAttribute('aria-hidden','true');
overlay.innerHTML='<div class="kc-transition-core"></div><div class="kc-transition-label">KINETIC CREW</div>';
document.body.appendChild(overlay);
let closed=false;
const dismiss=()=>{
 if(closed)return;
 closed=true;
 overlay.classList.add('is-leaving');
 window.setTimeout(()=>overlay.remove(),520);
};
const observer=app?new MutationObserver(()=>{if(app.children.length){observer.disconnect();window.setTimeout(dismiss,320);}}):null;
if(observer)observer.observe(app,{childList:true,subtree:true});
if(app?.children.length)window.setTimeout(dismiss,320);
/* Hard ceiling prevents a stuck transition if app initialization or DOM observation fails. */
window.setTimeout(dismiss,2600);
const revealImages=root=>{
 (root||document).querySelectorAll?.('img').forEach(img=>{
  if(img.complete&&img.naturalWidth){img.classList.add('kc-image-reveal');return;}
  if(!img.dataset.kcRevealBound){img.dataset.kcRevealBound='1';img.addEventListener('load',()=>img.classList.add('kc-image-reveal'),{once:true});}
 });
};
revealImages(document);
if(app)new MutationObserver(()=>revealImages(app)).observe(app,{childList:true,subtree:true});
})();