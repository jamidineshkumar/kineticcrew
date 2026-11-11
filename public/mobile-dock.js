/* Reference-matched floating five-button Kinetic Crew dock. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;
  const items = [
    { view: 'overview', icon: '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/></svg>', label: 'Home' },
    { view: 'feed', icon: '<svg viewBox="0 0 24 24"><path d="m12 3 9 9-9 9-9-9z"/><path d="m12 8 4 4-4 4-4-4z"/></svg>', label: 'Feed' },
    { view: 'events', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M8 3v18M13 3v18M18 3v18M3 8h18M3 13h18M3 18h18"/></svg>', label: 'Events' },
    { view: 'chat', icon: '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>', label: 'Crew Chat' },
    { view: 'more', icon: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>', label: 'More' }
  ];
  const dock=document.createElement('nav');
  dock.id='kcMobileDock';dock.className='kc-mobile-dock kc-vibe-dock';
  dock.setAttribute('aria-label','Main app navigation');
  dock.innerHTML=items.map(item=>'<button type="button" data-view="'+item.view+'" aria-label="'+item.label+'" title="'+item.label+'"><span class="dock-icon" aria-hidden="true">'+item.icon+'</span></button>').join('');
  document.body.appendChild(dock);
  function activeView(){
    const active=document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
    if(active)return active.dataset.view;
    if(document.body.classList.contains('kc-more-open'))return 'more';
    return '';
  }
  function sync(){
    const view=activeView();
    dock.querySelectorAll('button').forEach(button=>{
      const selected=button.dataset.view===view;
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }
  dock.addEventListener('click',event=>{
    const button=event.target.closest('button[data-view]');
    if(button)document.dispatchEvent(new CustomEvent('kc:navigate',{detail:{view:button.dataset.view}}));
  });
  const nav=document.getElementById('nav'),app=document.getElementById('app');
  if(nav)new MutationObserver(sync).observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  if(app)new MutationObserver(sync).observe(app,{childList:true,subtree:true});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  sync();
})();
