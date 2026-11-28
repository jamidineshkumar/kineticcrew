/* Kinetic Crew — exact four-destination reference dock. */
(()=>{
 'use strict';
 if(document.getElementById('kcMobileDock'))return;
 const svg=(path)=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
 const home=document.createElement('button');
 home.type='button';home.className='kc-dock-home active';home.dataset.view='overview';home.setAttribute('aria-label','Home');home.setAttribute('aria-current','page');
 home.innerHTML='<span class="dock-icon">'+svg('<path d="m2.5 10.5 9.5-8 9.5 8"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6.5h6V21"/>')+'</span><span class="dock-label">Home</span>';
 const group=document.createElement('div');group.className='kc-dock-group';
 const items=[
  {view:'events',label:'Events',path:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v5M16 2v5M3 10h18"/><path d="m19 15 .9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" fill="currentColor" stroke="currentColor" stroke-width=".8"/>'},
  {view:'feed',label:'Gram',path:'<defs><linearGradient id="kcDockKGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a75"/><stop offset=".48" stop-color="#d66bff"/><stop offset="1" stop-color="#7c8cff"/></linearGradient></defs><path d="M8 4v16M19 4 8 12l11 8" stroke="url(#kcDockKGradient)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'},
  {search:true,label:'Search',path:'<circle cx="10.5" cy="10.5" r="7.1"/><path d="m16 16 5.2 5.2" stroke-width="3.2"/>'}
 ];
 group.innerHTML=items.map(item=>'<button type="button" class="kc-dock-group-item" '+(item.search?'data-search-open':'data-view="'+item.view+'"')+' aria-label="'+item.label+'" title="'+item.label+'"><span class="dock-icon">'+svg(item.path)+'</span><span class="dock-label">'+item.label+'</span></button>').join('');
 const gramButton=group.querySelector('[data-view="feed"]');
 if(gramButton){
  gramButton.dataset.gramDock='true';
  const unread=document.createElement('span');unread.className='kc-dock-unread';unread.dataset.gramUnread='';unread.hidden=true;unread.setAttribute('aria-label','Unread Kinetic Gram messages');gramButton.appendChild(unread);
 }
 window.kcSetGramUnreadCount=count=>{
  const badge=document.querySelector('[data-gram-unread]'),value=Math.max(0,Number(count)||0);
  if(!badge)return;
  badge.hidden=value===0;badge.textContent=value>99?'99+':String(value);
  badge.setAttribute('aria-label',value+' unread Kinetic Gram messages');
 };
 window.kcSetGramUnreadCount(window.kcGramUnreadCount||0);

 const dock=document.createElement('nav');dock.id='kcMobileDock';dock.className='kc-mobile-dock';dock.setAttribute('aria-label','Main app navigation');dock.append(home,group);document.body.appendChild(dock);
 function activeView(){
  const active=document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
  if(active)return active.dataset.view;
  if(document.body.dataset.kcView)return document.body.dataset.kcView;
  if(document.body.classList.contains('kc-more-open'))return 'more';
  return document.body.classList.contains('kc-home-screen')?'overview':'';
 }
 function sync(){
  const view=activeView();
  home.classList.toggle('active',view==='overview');
  if(view==='overview')home.setAttribute('aria-current','page');else home.removeAttribute('aria-current');
  group.querySelectorAll('[data-view]').forEach(button=>{
   const selected=button.dataset.view===view||(button.dataset.view==='feed'&&view==='gram-chat');button.classList.toggle('active',selected);
   if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
 }
 dock.addEventListener('click',event=>{
  const search=event.target.closest('[data-search-open]');
  if(search){document.dispatchEvent(new CustomEvent('kc:search-open'));return;}
  const button=event.target.closest('button[data-view]');
  if(button)document.dispatchEvent(new CustomEvent('kc:navigate',{detail:{view:button.dataset.view}}));
 });
 const nav=document.getElementById('nav'),app=document.getElementById('app');
 if(nav)new MutationObserver(sync).observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 if(app)new MutationObserver(sync).observe(app,{childList:true,subtree:true});
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 sync();
})();