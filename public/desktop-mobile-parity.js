/* Desktop parity: reuse the mobile navigation drawer interaction on desktop. */
(()=>{'use strict';
 if(window.__kcDesktopParityMenuBound)return;window.__kcDesktopParityMenuBound=true;
 document.addEventListener('click',event=>{
  if(window.innerWidth<=900)return;
  const toggle=event.target.closest('#menuToggle');if(!toggle)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  if(typeof setMobileMenu==='function')setMobileMenu(true);
 },true);
})();