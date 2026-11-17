(()=>{'use strict';
const root=document.documentElement,key='kc-theme';
const themeStyle=document.createElement('style');
themeStyle.textContent=`.kc-appearance-dotmatrix{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:16px 0 18px;padding:14px 16px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,var(--panel2),var(--panel));}.kc-appearance-dotmatrix-copy{display:grid;gap:5px;min-width:0}.kc-appearance-dotmatrix-copy b{font-size:13px;color:var(--text)}.kc-appearance-dotmatrix-copy small{font-size:11px;line-height:1.45;color:var(--muted)}.kc-appearance-dotmatrix button[data-theme-toggle]{flex:0 0 150px}.kc-appearance-dotmatrix+.settings-choice button.is-selected{border-color:var(--accent)!important;background:var(--accent-soft)!important;color:var(--accent)!important;box-shadow:inset 0 0 0 1px var(--accent)!important}.kc-theme-dots{display:grid!important;place-items:center!important;width:32px!important;height:32px!important;border-radius:50%!important;background:none!important;background-image:none!important;animation:kcThemeSymbolFloat 3.2s ease-in-out infinite!important;filter:drop-shadow(0 0 5px currentColor)!important;color:#f5efff!important}.kc-theme-dots svg{display:block!important;width:29px!important;height:29px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;transition:transform .55s cubic-bezier(.2,.8,.2,1),color .45s ease!important}.kc-theme-dots:has(circle){color:#ffb84d!important;filter:drop-shadow(0 0 5px #ffb84d)!important;animation:kcThemeSunSpin 14s linear infinite!important}.kc-theme-dots:has(path){color:#eee8ff!important;filter:drop-shadow(0 0 6px #bda5ff)!important}@keyframes kcThemeSymbolFloat{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-2px) rotate(5deg)}}@keyframes kcThemeSunSpin{to{transform:rotate(360deg)}}@media(max-width:560px){.kc-appearance-dotmatrix{align-items:flex-start;padding:12px;gap:8px}.kc-appearance-dotmatrix-copy{padding-top:8px}.kc-appearance-dotmatrix button[data-theme-toggle]{flex-basis:138px;transform:scale(.9);transform-origin:right center;margin-right:-7px}}@media(prefers-reduced-motion:reduce){.kc-theme-dots,.kc-theme-dots svg{animation:none!important;transition:none!important}}`;
document.head.appendChild(themeStyle);
const media=window.matchMedia('(prefers-color-scheme: dark)');
let mode='dark';
try{mode=localStorage.getItem(key)||'dark';}catch{}
if(!['dark','light','system'].includes(mode))mode='dark';
function effective(value){return value==='system'?(media.matches?'dark':'light'):value;}
function renderToggles(){
 const dark=root.dataset.theme==='dark';
 document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
  b.classList.add('kc-theme-switch');
  b.innerHTML='<span class="kc-theme-track" aria-hidden="true"><span class="kc-theme-orb"><span class="kc-theme-dots"><svg viewBox="0 0 32 32" focusable="false">'+(dark?'<path d="M24.5 19.2A11.8 11.8 0 0 1 12.8 7.5 12 12 0 1 0 24.5 19.2Z"/>':'<circle cx="16" cy="16" r="5.2"/><path d="M16 2.8v3.1M16 26.1v3.1M2.8 16h3.1M26.1 16h3.1M6.7 6.7l2.2 2.2m14.2 14.2 2.2 2.2m0-18.6-2.2 2.2M8.9 23.1l-2.2 2.2"/>')+'</svg></span></span></span><span class="kc-theme-state">'+(dark?'DARK':'LIGHT')+'</span>';
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