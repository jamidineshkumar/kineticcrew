(function(){
 'use strict';
 const ID='kc-admin-menu-shortcuts';
 function install(){
  const page=document.querySelector('.kc-more-reference');
  if(!page)return;
  const role=document.querySelector('#profileRole')?.textContent?.trim().toLowerCase()||'';
  if(!/admin/.test(role))return;
  if(page.querySelector('#'+ID))return;
  const group=document.createElement('section');
  group.id=ID;
  group.className='kc-more-reference-group kc-admin-menu-group';
  group.innerHTML='<h2>Crew administration</h2><div class="kc-more-reference-pills"><button type="button" class="kc-more-pill" data-view="crew-management"><span class="kc-more-pill-icon">♙</span><b>Crew Members &amp; Roles</b><span class="kc-admin-menu-arrow">↗</span></button><button type="button" class="kc-more-pill" data-view="member-requests"><span class="kc-more-pill-icon">⌛</span><b>Pending Requests</b><span class="kc-admin-menu-arrow">↗</span></button></div>';
  const first=page.querySelector('.kc-more-reference-group');
  if(first)first.insertAdjacentElement('afterend',group);else page.prepend(group);
 }
 const observer=new MutationObserver(install);
 function start(){install();observer.observe(document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('kc:admin-menu-refresh',install);
})();