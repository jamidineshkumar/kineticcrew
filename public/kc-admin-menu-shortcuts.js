(function(){
 'use strict';
 // Admin shortcuts are already rendered in the main More menu. Do not inject
 // a second Crew administration section; only clean up any legacy duplicate.
 function clean(){
  const page=document.querySelector('.kc-more-reference');
  if(!page)return;
  page.querySelectorAll('#kc-admin-menu-shortcuts,.kc-admin-shortcuts').forEach(node=>node.remove());
  const groups=[...page.querySelectorAll('.kc-more-reference-group')].filter(node=>node.querySelector(':scope > h2')?.textContent.trim()==='Crew administration');
  if(groups.length>1){
   const keep=groups.find(node=>node.querySelector('[data-audition-admin]'))||groups[0];
   groups.forEach(node=>{if(node!==keep)node.remove();});
  }
 }
 const observer=new MutationObserver(clean);
 function start(){clean();observer.observe(document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('kc:admin-menu-refresh',clean);
})();