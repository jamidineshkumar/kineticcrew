/* Kinetic Crew startup reveal + accessible progressive image reveal. */
(()=>{'use strict';
const app=document.getElementById('app');
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';
overlay.setAttribute('role','status');
overlay.setAttribute('aria-label','Kinetic Crew is starting');
overlay.innerHTML='<div class="kc-transition-core" aria-hidden="true"></div><div class="kc-transition-label">Kinetic Crew</div>';
document.body.appendChild(overlay);
let dismissed=false;
const dismiss=()=>{
 if(dismissed)return;
 dismissed=true;
 requestAnimationFrame(()=>overlay.classList.add('is-leaving'));
 window.setTimeout(()=>overlay.remove(),700);
};
const showStartupError=()=>{
 if(!app||app.children.length)return;
 app.innerHTML='<div class="load-error" role="alert"><div class="emptyicon">!</div><h2>Kinetic Crew could not start</h2><p>The app did not finish initializing. Check your connection and try again.</p><div class="load-actions"><button class="primary" type="button" onclick="location.reload()">Reload app</button></div></div>';
};
if(app){
 const ready=()=>app.children.length>0;
 const observer=new MutationObserver(()=>{
  if(ready()){
   observer.disconnect();
   window.setTimeout(dismiss,180);
  }
 });
 observer.observe(app,{childList:true,subtree:true});
 if(ready())window.setTimeout(dismiss,180);
 // Keep the branded transition visible while authentication and dashboard data initialize.
 // The app's own 18-second startup guard normally renders a recoverable error first.
 window.setTimeout(()=>{
  if(!ready())showStartupError();
  if(ready())dismiss();
 },22000);
}
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
if(app)new MutationObserver(()=>revealImages(app)).observe(app,{childList:true,subtree:true});
})();