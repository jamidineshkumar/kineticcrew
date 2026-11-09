(()=>{'use strict';
const root=document.documentElement,key='kc-theme';
function apply(mode){const value=mode==='dark'?'dark':'light';root.dataset.theme=value;try{localStorage.setItem(key,value);}catch{}document.querySelectorAll('[data-theme-toggle]').forEach(b=>{const dark=value==='dark';b.innerHTML='<span class="theme-icon" aria-hidden="true">'+(dark?'☀':'☾')+'</span><span class="theme-label">'+(dark?'Light mode':'Dark mode')+'</span>';b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');b.setAttribute('title',dark?'Switch to light mode':'Switch to dark mode');});}
let saved='light';try{saved=localStorage.getItem(key)||'light';}catch{}apply(saved);
document.addEventListener('click',e=>{const b=e.target.closest('[data-theme-toggle]');if(!b)return;apply(root.dataset.theme==='dark'?'light':'dark');});
})();