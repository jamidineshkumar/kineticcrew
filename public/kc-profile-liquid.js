/* Profile state marker only. Navigation animation is shared with all app pages. */
(()=>{'use strict';
const app=document.getElementById('app');
if(!app)return;
const sync=()=>document.body.classList.toggle('kc-profile-view-open',!!app.querySelector('.kc-liquid-profile'));
new MutationObserver(sync).observe(app,{childList:true,subtree:true});
sync();
})();
