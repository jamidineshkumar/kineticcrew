(()=>{'use strict';
const root=document.documentElement,key='kc-theme';
function apply(mode){const value=mode==='dark'?'dark':'light';root.dataset.theme=value;try{localStorage.setItem(key,value);}catch{}document.querySelectorAll('[data-theme-toggle]').forEach(b=>{const dark=value==='dark';b.innerHTML='<span class="theme-icon" aria-hidden="true">'+(dark?'☀':'☾')+'</span><span class="theme-label">'+(dark?'Light mode':'Dark mode')+'</span>';b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');b.setAttribute('title',dark?'Switch to light mode':'Switch to dark mode');});}
let saved='dark';try{saved=localStorage.getItem(key)||'dark';}catch{}apply(saved);
document.addEventListener('click',e=>{const b=e.target.closest('[data-theme-toggle]');if(!b)return;apply(root.dataset.theme==='dark'?'light':'dark');});

// Keep an install action on the first welcome screen. Chromium browsers can show
// the native install prompt; browsers without that prompt get clear manual steps.
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
function addInstallAction(){
 const actions=document.querySelector('.kc-welcome-actions');
 if(!actions||document.getElementById('kcInstallApp'))return;
 const button=document.createElement('button');
 button.type='button';button.id='kcInstallApp';button.className='kc-quiet-button';
 button.textContent='Install App';
 button.setAttribute('aria-label','Install Kinetic Crew app');
 button.style.cssText='width:100%;margin-top:12px;border:1px solid rgba(255,255,255,.28);';
 button.addEventListener('click',async()=>{
  if(installPrompt){
   installPrompt.prompt();
   try{await installPrompt.userChoice;}catch{}
   installPrompt=null;
   return;
  }
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const message=isIOS
   ? 'To install Kinetic Crew: tap Share, then Add to Home Screen.'
   : 'To install Kinetic Crew: open your browser menu (⋮), then choose Install app or Add to Home screen.';
  window.alert(message);
 });
 actions.insertAdjacentElement('afterend',button);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addInstallAction,{once:true});else addInstallAction();
window.addEventListener('appinstalled',()=>{const b=document.getElementById('kcInstallApp');if(b){b.textContent='App Installed';b.disabled=true;}});
})();