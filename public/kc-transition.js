/* Lightweight startup hook. The old per-frame canvas vortex caused avoidable mobile GPU load. */
(()=>{'use strict';
const app=document.getElementById('app');
if(!app)return;
const ready=()=>document.documentElement.classList.add('kc-app-ready');
if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){ready();return;}
requestAnimationFrame(()=>requestAnimationFrame(ready));
})();
