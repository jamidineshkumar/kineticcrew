/* Desktop navigation initialization.
   Keep the existing mobile drawer appearance; on desktop it becomes the
   persistent workspace sidebar. The hamburger collapses/expands it. */
(()=>{
 'use strict';
 const desktop=()=>window.matchMedia('(min-width: 640px) and (hover: hover) and (pointer: fine)').matches;
 function initialize(){
  if(!desktop())return;
  const panel=document.getElementById('sidebar');
  const shade=document.getElementById('navShade');
  const toggle=document.getElementById('menuToggle');
  if(panel){
   panel.classList.add('open');
   panel.setAttribute('aria-hidden','false');
   panel.style.transform='';
   panel.style.visibility='';
   panel.style.opacity='';
   panel.style.pointerEvents='';
  }
  if(shade){shade.classList.remove('open');shade.style.display='none';}
  if(toggle){toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Collapse navigation');}
  document.body.classList.remove('kc-sidebar-collapsed','kc-menu-open');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
 else initialize();
 window.addEventListener('resize',()=>{if(desktop())initialize();},{passive:true});
})();
