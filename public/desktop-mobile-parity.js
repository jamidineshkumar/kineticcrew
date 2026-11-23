/* Kinetic Crew — desktop navigation drawer controller.
   app.js is intentionally isolated in an IIFE, so this controller must not
   depend on its private setMobileMenu() function. */
(()=>{'use strict';
 if(window.__kcDesktopParityMenuBound)return;
 window.__kcDesktopParityMenuBound=true;
 const desktop=()=>window.matchMedia('(min-width: 901px)').matches;
 const sidebar=()=>document.getElementById('sidebar');
 const shade=()=>document.getElementById('navShade');
 const toggle=()=>document.getElementById('menuToggle');
 function ensureDesktopMoreLink(){
  const nav=document.getElementById('nav');
  if(!nav)return;
  let link=nav.querySelector('[data-kc-desktop-more]');
  if(!desktop()){
   if(link)link.remove();
   return;
  }
  if(!link){
   link=document.createElement('button');
   link.type='button';
   link.className='navitem kc-desktop-more-link';
   link.dataset.view='more';
   link.dataset.kcDesktopMore='true';
   link.innerHTML='<span class="nicon" aria-hidden="true">✦</span><span>Explore all features</span>';
   const signout=nav.querySelector('[data-kc-signout],.kc-nav-signout');
   nav.insertBefore(link,signout||null);
  }
  const active=document.body.classList.contains('kc-more-open');
  link.classList.toggle('active',active);
  if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 function setOpen(open){
  const panel=sidebar(),overlay=shade(),button=toggle();
  if(!panel||!overlay)return;
  panel.classList.toggle('open',!!open);
  overlay.classList.toggle('open',!!open);
  panel.setAttribute('aria-hidden',open?'false':'true');
  panel.style.transform=open?'translate3d(0,0,0)':'translate3d(-110%,0,0)';
  panel.style.visibility=open?'visible':'hidden';
  panel.style.opacity=open?'1':'0';
  panel.style.pointerEvents=open?'auto':'none';
  overlay.style.pointerEvents=open?'auto':'none';
  if(button){button.setAttribute('aria-expanded',open?'true':'false');button.setAttribute('aria-label',open?'Close navigation':'Open navigation');}
  document.body.classList.toggle('kc-menu-open',!!open);
 }
 document.addEventListener('click',event=>{
  if(!desktop())return;
  const menuButton=event.target.closest('#menuToggle');
  if(menuButton){
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
   setOpen(!sidebar()?.classList.contains('open'));
   return;
  }
  if(event.target.closest('#navShade')||event.target.closest('#nav [data-view]')){
   if(sidebar()?.classList.contains('open'))setOpen(false);
  }
 },true);
 document.addEventListener('keydown',event=>{
  if(desktop()&&event.key==='Escape'&&sidebar()?.classList.contains('open'))setOpen(false);
 });
 window.addEventListener('resize',()=>{if(!desktop())setOpen(false);});
 const navRoot=document.getElementById('nav');
 if(navRoot)new MutationObserver(()=>ensureDesktopMoreLink()).observe(navRoot,{childList:true,subtree:true});
 new MutationObserver(()=>ensureDesktopMoreLink()).observe(document.body,{attributes:true,attributeFilter:['class']});
 ensureDesktopMoreLink();
 setOpen(false);
})();