/* Kinetic Crew — exact four-destination reference dock. */
(()=>{
 'use strict';
 if(document.getElementById('kcMobileDock'))return;
 const svg=(path)=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
 const home=document.createElement('button');
 home.type='button';home.className='kc-dock-home active';home.dataset.view='overview';home.setAttribute('aria-label','Home');home.setAttribute('aria-current','page');
 home.innerHTML='<span class="dock-icon">'+svg('<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/>')+'</span><span class="dock-label">Home</span>';
 const group=document.createElement('div');group.className='kc-dock-group';
 const items=[
  {view:'events',label:'Events',path:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>'},
  {view:'feed',label:'Gram',path:'<defs><linearGradient id="kcDockKGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff806b"/><stop offset=".52" stop-color="#d66bff"/><stop offset="1" stop-color="#7c8cff"/></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 7v10M16 7l-8 5 8 5" stroke="url(#kcDockKGradient)" stroke-width="2.4"/>'},
  {search:true,label:'Search',path:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>'}
 ];
 group.innerHTML=items.map(item=>'<button type="button" class="kc-dock-group-item" '+(item.search?'data-search-open':'data-view="'+item.view+'"')+' aria-label="'+item.label+'" title="'+item.label+'"><span class="dock-icon">'+svg(item.path)+'</span><span class="dock-label">'+item.label+'</span></button>').join('');
 const dock=document.createElement('nav');dock.id='kcMobileDock';dock.className='kc-mobile-dock';dock.setAttribute('aria-label','Main app navigation');dock.append(home,group);document.body.appendChild(dock);
 function activeView(){
  const active=document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
  if(active)return active.dataset.view;
  if(document.body.classList.contains('kc-more-open'))return 'more';
  return document.body.classList.contains('kc-home-screen')?'overview':'';
 }
 function sync(){
  const view=activeView();
  home.classList.toggle('active',view==='overview');
  if(view==='overview')home.setAttribute('aria-current','page');else home.removeAttribute('aria-current');
  group.querySelectorAll('[data-view]').forEach(button=>{
   const selected=button.dataset.view===view;button.classList.toggle('active',selected);
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