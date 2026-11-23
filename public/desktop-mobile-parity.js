/* Desktop shell behavior is owned by app.js.
   Do not force-close the drawer on resize: that used to cancel the user's
   open state and made desktop hamburger navigation appear broken. */
(()=>{
 'use strict';
 const desktop=()=>window.matchMedia('(min-width: 901px)').matches;
 function initializeDesktopDrawer(){
  if(!desktop())return;
  const panel=document.getElementById('sidebar');
  const overlay=document.getElementById('navShade');
  const toggle=document.getElementById('menuToggle');
  if(panel&&!panel.classList.contains('open')){
   panel.setAttribute('aria-hidden','true');
   panel.style.transform='translate3d(-110%,0,0)';
   panel.style.visibility='hidden';
   panel.style.opacity='0';
   panel.style.pointerEvents='none';
  }
  if(overlay&&!overlay.classList.contains('open'))overlay.style.pointerEvents='none';
  if(toggle&&!panel?.classList.contains('open')){
   toggle.setAttribute('aria-expanded','false');
   toggle.setAttribute('aria-label','Open navigation');
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeDesktopDrawer,{once:true});
 else initializeDesktopDrawer();
})();