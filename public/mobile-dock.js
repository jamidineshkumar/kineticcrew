/* Native-feeling mobile navigation dock for the Kinetic Crew PWA. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;
  const items = [
    {view:'overview',icon:'⌂',label:'Home'},
    {view:'events',icon:'▦',label:'Events'},
    {view:'feed',icon:'◉',label:'Crew Feed'},
    {view:'profile',icon:'♙',label:'Profile'}
  ];
  const dock = document.createElement('nav');
  dock.id = 'kcMobileDock';
  dock.className = 'kc-mobile-dock';
  dock.setAttribute('aria-label','Main app navigation');
  dock.innerHTML = items.map(item =>
    '<button type="button" data-view="'+item.view+'" aria-label="'+item.label+'" class="'+(item.view==='overview'?'active':'')+'"><span class="dock-icon" aria-hidden="true">'+item.icon+'</span><span>'+item.label+'</span></button>'
  ).join('');
  document.body.appendChild(dock);
  const sync = () => {
    const active = document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
    const current = active?.dataset.view || (document.querySelector('#crumb')?.textContent.trim().toLowerCase()==='overview'?'overview':'');
    dock.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.view===current;
      button.classList.toggle('active',selected);
      if(selected) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
  };
  const nav = document.getElementById('nav');
  if(nav) new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  const app = document.getElementById('app');
  if(app) new MutationObserver(sync).observe(app,{childList:true,subtree:true});
  document.addEventListener('click',event => {
    const button=event.target.closest('#kcMobileDock [data-view]');
    if(!button)return;
    dock.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===button));
  });
  sync();
})();
