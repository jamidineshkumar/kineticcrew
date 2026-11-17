(()=>{'use strict';
const root=document.documentElement,key='kc-theme';
const media=window.matchMedia('(prefers-color-scheme: dark)');
let mode='dark';
try{mode=localStorage.getItem(key)||'dark';}catch{}
if(!['dark','light','system'].includes(mode))mode='dark';
function effective(value){return value==='system'?(media.matches?'dark':'light'):value;}
function renderToggles(){
 const dark=root.dataset.theme==='dark';
 document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
  b.classList.add('kc-theme-switch');
  b.innerHTML='<span class="kc-theme-track" aria-hidden="true"><span class="kc-theme-orb"><span class="kc-theme-dots"></span></span></span><span class="kc-theme-state">'+(dark?'DARK':'LIGHT')+'</span>';
  b.setAttribute('role','switch');b.setAttribute('aria-checked',String(!dark));
  b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
  b.setAttribute('title',dark?'Switch to light mode':'Switch to dark mode');
 });
 document.querySelectorAll('[data-set-theme]').forEach(b=>{
  const selected=b.dataset.setTheme===mode;
  b.classList.toggle('is-selected',selected);
  b.setAttribute('aria-pressed',String(selected));
 });
}
function apply(next,persist=true){
 if(!['dark','light','system'].includes(next))return;
 mode=next;
 const value=effective(mode);
 root.dataset.theme=value;
 root.dataset.themeMode=mode;
 if(persist){try{localStorage.setItem(key,mode);}catch{}}
 renderToggles();
}
apply(mode,false);
media.addEventListener?.('change',()=>{if(mode==='system')apply('system',false);});
document.addEventListener('click',e=>{
 const choice=e.target.closest('[data-set-theme]');
 if(choice){apply(choice.dataset.setTheme);return;}
 const toggle=e.target.closest('[data-theme-toggle]');
 if(toggle)apply(root.dataset.theme==='dark'?'light':'dark');
});
function enhanceAppearance(){
 const panel=document.querySelector('.kc-settings-detail');
 if(!panel||panel.dataset.kcThemeEnhanced==='true')return;
 const choice=panel.querySelector('.settings-choice');
 if(!choice)return;
 panel.dataset.kcThemeEnhanced='true';
 const control=document.createElement('div');
 control.className='kc-appearance-dotmatrix';
 control.innerHTML='<div class="kc-appearance-dotmatrix-copy"><b>Quick theme switch</b><small>Tap the Dot Matrix control to switch between light and dark.</small></div><button type="button" data-theme-toggle aria-label="Switch colour theme"></button>';
 panel.insertBefore(control,choice);
 const system=document.createElement('button');
 system.type='button';system.className='outline';system.dataset.setTheme='system';system.textContent='◐ Follow phone settings';
 choice.appendChild(system);
 renderToggles();
}
const observer=new MutationObserver(enhanceAppearance);
observer.observe(document.documentElement,{childList:true,subtree:true});
enhanceAppearance();

// Install action sits directly below Sign In and above the audition prompt.
let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
document.addEventListener('click',async event=>{
 const trigger=event.target.closest('[data-kc-install]');
 if(!trigger)return;
 event.preventDefault();
 if(installPrompt){
  trigger.disabled=true;trigger.textContent='Opening installer…';
  try{installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice?.outcome==='accepted'){trigger.textContent='App installed';}else{trigger.disabled=false;trigger.textContent='↓ Install app';}}catch{trigger.disabled=false;trigger.textContent='↓ Install app';}
  installPrompt=null;return;
 }
 const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
 window.alert(isIOS?'To install Kinetic Crew: tap Share, then Add to Home Screen.':'To install Kinetic Crew: open your browser menu (⋮), then choose Install app or Add to Home screen.');
});
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