/* Desktop uses the same slide-out drawer interaction as the mobile app. */
(()=>{'use strict';
 const desktop=()=>window.matchMedia('(min-width:1100px) and (min-device-width:1024px) and (hover:hover) and (pointer:fine)').matches;
 function initialize(){
  if(!desktop())return;
  const panel=document.getElementById('sidebar'),shade=document.getElementById('navShade'),toggle=document.getElementById('menuToggle');
  if(panel){panel.classList.remove('open');panel.setAttribute('aria-hidden','true');panel.style.transform='translate3d(-110%,0,0)';panel.style.visibility='hidden';panel.style.opacity='0';panel.style.pointerEvents='none';}
  if(shade){shade.classList.remove('open');shade.style.display='';}
  if(toggle){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}
  document.body.classList.remove('kc-sidebar-collapsed','kc-menu-open');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
 window.addEventListener('resize',()=>{if(!desktop())initialize();},{passive:true});
})();