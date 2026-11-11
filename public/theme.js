(()=>{'use strict';
const root=document.documentElement,key='kc-theme';
function apply(mode){const value=mode==='dark'?'dark':'light';root.dataset.theme=value;try{localStorage.setItem(key,value);}catch{}document.querySelectorAll('[data-theme-toggle]').forEach(b=>{const dark=value==='dark';b.innerHTML='<span class="theme-icon" aria-hidden="true">'+(dark?'☀':'☾')+'</span><span class="theme-label">'+(dark?'Light mode':'Dark mode')+'</span>';b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');b.setAttribute('title',dark?'Switch to light mode':'Switch to dark mode');});}
let saved='dark';try{saved=localStorage.getItem(key)||'dark';}catch{}apply(saved);
document.addEventListener('click',e=>{const choice=e.target.closest('[data-set-theme]');if(choice){apply(choice.dataset.setTheme);return;}const b=e.target.closest('[data-theme-toggle]');if(!b)return;apply(root.dataset.theme==='dark'?'light':'dark');});

// Install action sits directly below Sign In and above the audition prompt.
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
function addInstallAction(){
 const actions=document.querySelector('.kc-welcome-actions');
 if(!actions||document.getElementById('kcInstallApp'))return;
 const button=document.createElement('button');
 button.type='button';button.id='kcInstallApp';button.className='kc-quiet-button';
 button.innerHTML='<span aria-hidden="true">↓</span> Install App';
 button.setAttribute('aria-label','Install Kinetic Crew app');
 button.style.cssText='display:flex;align-items:center;justify-content:center;gap:9px;width:min(100%,220px);min-height:42px;margin:10px auto 14px;padding:10px 22px;border:1px solid #ffad70aa;border-radius:999px;background:linear-gradient(100deg,#120b08,#211109 50%,#120b08);color:#ffd2b2;font:700 12px Arial,Helvetica,sans-serif;letter-spacing:.02em;box-shadow:0 0 16px #ff9a4c20,inset 0 1px #ffffff18;';
 button.addEventListener('click',async()=>{
  if(installPrompt){installPrompt.prompt();try{await installPrompt.userChoice;}catch{}installPrompt=null;return;}
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  window.alert(isIOS?'To install Kinetic Crew: tap Share, then Add to Home Screen.':'To install Kinetic Crew: open your browser menu (⋮), then choose Install app or Add to Home screen.');
 });
 actions.insertAdjacentElement('afterend',button);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addInstallAction,{once:true});else addInstallAction();
window.addEventListener('appinstalled',()=>{const b=document.getElementById('kcInstallApp');if(b){b.textContent='App Installed';b.disabled=true;}});
})();