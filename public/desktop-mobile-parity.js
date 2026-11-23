/* Desktop hamburger uses the exact same More hub as the mobile app.
   The legacy desktop-only sidebar interception and synthetic menu link are removed. */
(()=>{
 'use strict';
 const desktop=()=>window.matchMedia('(min-width: 901px)').matches;
 function keepLegacyDrawerClosed(){
  if(!desktop())return;
  const panel=document.getElementById('sidebar');
  const overlay=document.getElementById('navShade');
  if(panel){
   panel.classList.remove('open');
   panel.setAttribute('aria-hidden','true');
   panel.style.transform='translate3d(-110%,0,0)';
   panel.style.visibility='hidden';
   panel.style.opacity='0';
   panel.style.pointerEvents='none';
  }
  if(overlay){
   overlay.classList.remove('open');
   overlay.style.pointerEvents='none';
  }
  document.body.classList.remove('kc-menu-open');
 }
 keepLegacyDrawerClosed();
 window.addEventListener('resize',keepLegacyDrawerClosed,{passive:true});
})();