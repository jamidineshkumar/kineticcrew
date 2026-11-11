/* Kinetic Crew startup reveal + accessible progressive image reveal. */
(()=>{'use strict';
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';
overlay.setAttribute('role','status');
overlay.setAttribute('aria-label','Loading Kinetic Crew');
overlay.innerHTML='<div class="kc-transition-core" aria-hidden="true"></div><div class="kc-transition-label">Kinetic Crew</div>';
document.body.appendChild(overlay);
let dismissed=false;
const dismiss=()=>{
 if(dismissed)return;
 dismissed=true;
 requestAnimationFrame(()=>overlay.classList.add('is-leaving'));
 window.setTimeout(()=>overlay.remove(),700);
};
const app=document.getElementById('app');
if(app){
 const ready=()=>{
  if(app.querySelector('.kc-simple-loader')&&app.children.length===1)return false;
  return app.children.length>0;
 };
 const observer=new MutationObserver(()=>{
  if(ready()){
   observer.disconnect();
   window.setTimeout(dismiss,180);
  }
 });
 observer.observe(app,{childList:true,subtree:true});
 if(ready())window.setTimeout(dismiss,180);
}
window.addEventListener('load',()=>window.setTimeout(dismiss,900),{once:true});
window.setTimeout(dismiss,12000);
const revealImages=root=>{
 (root||document).querySelectorAll?.('img').forEach(img=>{
  if(img.complete&&img.naturalWidth){img.classList.add('kc-image-reveal');return;}
  if(!img.dataset.kcRevealBound){
   img.dataset.kcRevealBound='1';
   img.addEventListener('load',()=>img.classList.add('kc-image-reveal'),{once:true});
  }
 });
};
revealImages(document);
const root=document.getElementById('app');
if(root)new MutationObserver(()=>revealImages(root)).observe(root,{childList:true,subtree:true});
})();
