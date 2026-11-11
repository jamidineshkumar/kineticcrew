/* Single approved four-tab mobile navigation: Home, Feed, Events, Crew Chat. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;

  const items = [
    { view: 'overview', icon: '⌂', label: 'Home' },
    { view: 'feed', icon: '◈', label: 'Feed' },
    { view: 'events', icon: '▦', label: 'Events' },
    { view: 'chat', icon: '✉', label: 'Crew Chat' }
  ];

  const dock = document.createElement('nav');
  dock.id = 'kcMobileDock';
  dock.className = 'kc-mobile-dock kc-vibe-dock';
  dock.setAttribute('aria-label', 'Main app navigation');
  dock.innerHTML = items.map(item =>
    '<button type="button" data-view="' + item.view + '" aria-label="' + item.label + '">' +
      '<span class="dock-icon" aria-hidden="true">' + item.icon + '</span>' +
      '<span class="dock-label">' + item.label + '</span>' +
    '</button>'
  ).join('');
  document.body.appendChild(dock);

  function activeView() {
    const active = document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
    return active ? active.dataset.view : '';
  }
  function sync() {
    const view = activeView();
    dock.querySelectorAll('button').forEach(button => {
      const selected = button.dataset.view === view;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
  dock.addEventListener('click', event => {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    document.dispatchEvent(new CustomEvent('kc:navigate', { detail: { view: button.dataset.view } }));
  });
  const nav = document.getElementById('nav');
  const app = document.getElementById('app');
  if (nav) new MutationObserver(sync).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  if (app) new MutationObserver(sync).observe(app, { childList: true, subtree: true });
  sync();
})();
