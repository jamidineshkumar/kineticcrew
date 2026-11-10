/* Four-tab mobile navigation for Kinetic Crew. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;

  const items = [
    { view: 'overview', icon: '⌂', label: 'Home' },
    { view: 'feed', icon: '◉', label: 'Feed' },
    { view: 'events', icon: '▦', label: 'Events' },
    { view: 'chat', icon: '▤', label: 'Crew Chat' }
  ];

  const dock = document.createElement('nav');
  dock.id = 'kcMobileDock';
  dock.className = 'kc-mobile-dock';
  dock.setAttribute('aria-label', 'Main app navigation');
  dock.innerHTML = items.map(item =>
    '<button type="button" data-view="' + item.view + '" aria-label="' + item.label + '">' +
      '<span class="dock-icon" aria-hidden="true">' + item.icon + '</span>' +
      '<span class="dock-label">' + item.label + '</span>' +
    '</button>'
  ).join('');
  const liquid = document.createElement('span');
  liquid.className = 'kc-dock-liquid';
  liquid.setAttribute('aria-hidden', 'true');
  dock.appendChild(liquid);
  document.body.appendChild(dock);

  const aliases = { 'public-profile': 'people', 'event-detail': 'events' };

  function activeView() {
    const active = document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
    if (active) return aliases[active.dataset.view] || active.dataset.view;
    const crumb = document.getElementById('crumb')?.textContent.trim().toLowerCase();
    return crumb === 'overview' ? 'overview' : '';
  }

  let settleTimer;
  function sync() {
    const view = activeView();
    const buttons = [...dock.querySelectorAll('button')];
    buttons.forEach(button => {
      const selected = button.dataset.view === view;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const active = buttons.find(button => button.dataset.view === view);
    if (!active) {
      liquid.classList.remove('is-visible');
      return;
    }
    const x = active.offsetLeft + active.offsetWidth / 2;
    const y = active.offsetTop + active.offsetHeight / 2;
    liquid.style.setProperty('--dock-x', x + 'px');
    liquid.style.setProperty('--dock-y', y + 'px');
    liquid.style.setProperty('--dock-size', Math.min(active.offsetWidth, active.offsetHeight) + 'px');
    liquid.classList.add('is-visible', 'is-moving');
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => liquid.classList.remove('is-moving'), 260);
  }

  dock.addEventListener('click', event => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    const target = document.querySelector('#nav [data-view="' + button.dataset.view + '"]');
    document.dispatchEvent(new CustomEvent('kc:navigate', { detail: { view: button.dataset.view } }));
  });

  const nav = document.getElementById('nav');
  const app = document.getElementById('app');
  if (nav) new MutationObserver(sync).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  if (app) new MutationObserver(sync).observe(app, { childList: true, subtree: true });
  sync();
  window.addEventListener('resize', sync, { passive: true });
})();