/* Fast, non-blocking page entrance. The old full-screen particle canvas has been removed. */
(()=>{'use strict';
const app=document.getElementById('app');
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';
overlay.setAttribute('aria-hidden','true');
overlay.innerHTML='<div class="kc-transition-center"><img src="kinetic-crew-logo.svg" alt=""><span>KINETIC CREW</span></div>';
document.body.appendChild(overlay);
let closed=false;
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const dismiss=()=>{
 if(closed)return;closed=true;
 overlay.classList.add('is-leaving');
 document.documentElement.classList.add('kc-transition-ready');
 window.setTimeout(()=>overlay.remove(),420);
};
if(reduced){dismiss();}
else{
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const ready=()=>{if(app?.children.length||performance.now()>1800)dismiss();else window.setTimeout(ready,60);};
  window.setTimeout(ready,120);
 }));
 window.setTimeout(dismiss,1900);
}
})();
