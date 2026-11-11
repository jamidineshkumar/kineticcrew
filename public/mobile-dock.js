/* Final Kinetic Crew dock: Home, Events, Fun Zone, Search. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;
  const items = [
    { view: 'overview', icon: '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/></svg>', label: 'Home' },
    { view: 'events', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>', label: 'Opportunities' },
    { view: 'people', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.4-6 8-6s7.2 2 8 6"/></svg>', label: 'Network' },
    { view: 'more', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M16.5 8.5a5 5 0 1 0 0 7"/></svg>', label: 'Earnings' }
  ];
  const dock=document.createElement('nav');
  dock.id='kcMobileDock';dock.className='kc-mobile-dock';
  dock.setAttribute('aria-label','Main app navigation');
  dock.innerHTML='<button type="button" class="kc-dock-home" data-view="'+items[0].view+'" aria-label="'+items[0].label+'"><span class="dock-icon" aria-hidden="true">'+items[0].icon+'</span><span class="dock-label">'+items[0].label+'</span></button><div class="kc-dock-group">'+items.slice(1).map(item=>'<button type="button" data-view="'+item.view+'" aria-label="'+item.label+'" title="'+item.label+'"><span class="dock-icon" aria-hidden="true">'+item.icon+'</span><span class="dock-label">'+item.label+'</span></button>').join('')+'</div>';
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
