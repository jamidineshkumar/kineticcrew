/* Kinetic Crew transitions: never hold the app behind a full-screen animation.
   Remove legacy particle/splash layers left by older cached releases and let the
   actual app view animate in after its content is ready. */
(()=>{'use strict';
 const app=document.getElementById('app');
 const legacy=[
  '.kc-transition-overlay','.kc-transition-canvas','#kcTransition','#kc-transition',
  '#kcTransitionCanvas','#kc-transition-canvas','.kc-particle-transition',
  '.kc-transition-particles','.kc-dot-wave-transition','.kc-wave-transition',
  '.kc-transition-stage','.kc-transition-background','#kcTransitionRoot',
  'canvas[id*="transition" i]','canvas[class*="transition" i]',
  'canvas[id*="particle" i]','canvas[class*="particle" i]',
  'svg[id*="transition" i]','div[id*="transition" i]'
 ];
 const clearLegacy=()=>{
  document.querySelectorAll(legacy.join(',')).forEach(node=>node.remove());
  document.querySelectorAll('body *').forEach(node=>{
   if(node===app||node.closest('#app')||node.matches('.kc-entry-splash,.kc-intro'))return;
   const token=((node.id||'')+' '+(typeof node.className==='string'?node.className:'')).toLowerCase();
   if(!/(transition|particle|dot.?wave|splash.?loader|loading.?screen)/.test(token))return;
   const style=getComputedStyle(node),rect=node.getBoundingClientRect();
   if(style.position==='fixed'&&rect.width>=innerWidth*.9&&rect.height>=innerHeight*.9)node.remove();
  });
  document.documentElement.classList.add('kc-transition-ready');
  document.body?.classList.remove('kc-transitioning','is-transitioning','kc-page-transitioning');
 };
 let entered=false;
 const enter=()=>{
  clearLegacy();
  if(!app||entered||!app.children.length)return;
  entered=true;
  app.classList.remove('kc-app-start-enter');
  void app.offsetWidth;
  app.classList.add('kc-app-start-enter');
  app.addEventListener('animationend',event=>{
   if(event.target===app)app.classList.remove('kc-app-start-enter');
  },{once:true});
 };
 clearLegacy();
 if(app){
  const observer=new MutationObserver(()=>{if(app.children.length)requestAnimationFrame(enter);});
  observer.observe(app,{childList:true});
 }
 document.addEventListener('DOMContentLoaded',enter,{once:true});
 window.addEventListener('pageshow',()=>{clearLegacy();enter();});
 window.addEventListener('load',enter,{once:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){clearLegacy();enter();}});
 window.setTimeout(()=>{clearLegacy();enter();},2400);
})();
