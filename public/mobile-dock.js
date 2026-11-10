/* Native-style five-tab navigation for the Kinetic Crew mobile app. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;
  const items=[
    {view:'overview',icon:'⌂',label:'Home'},
    {view:'events',icon:'▦',label:'Events'},
    {view:'chat',icon:'◎',label:'Crew'},
    {view:'memories',icon:'▧',label:'Memories'},
    {view:'profile',icon:'♙',label:'Profile'}
  ];
  const dock=document.createElement('nav');
  dock.id='kcMobileDock';dock.className='kc-mobile-dock';dock.setAttribute('aria-label','Main app navigation');
  dock.innerHTML=items.map(x=>'<button type="button" data-view="'+x.view+'" aria-label="'+x.label+'"><span class="dock-icon" aria-hidden="true">'+x.icon+'</span><span>'+x.label+'</span></button>').join('');
  document.body.appendChild(dock);
  const aliases={'public-profile':'people','event-detail':'events'};
  function activeView(){
    const active=document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
    if(active)return aliases[active.dataset.view]||active.dataset.view;
    const crumb=document.getElementById('crumb')?.textContent.trim().toLowerCase();
    return crumb==='overview'?'overview':'';
  }
  function sync(){
    const view=activeView();
    dock.querySelectorAll('button').forEach(b=>{
      const selected=b.dataset.view===view;
      b.classList.toggle('active',selected);
      if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }
  dock.addEventListener('click',event=>{
    const button=event.target.closest('button[data-view]');
    if(!button)return;
    const target=document.querySelector('#nav [data-view="'+button.dataset.view+'"]');
    if(target){target.click();return;}
    // Fall back to the app's own navigation handler when a tab is not in the current nav group.
    document.dispatchEvent(new CustomEvent('kc:navigate',{detail:{view:button.dataset.view}}));
  });
  const nav=document.getElementById('nav'),app=document.getElementById('app');
  if(nav)new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  if(app)new MutationObserver(sync).observe(app,{childList:true,subtree:true});
  sync();
})();