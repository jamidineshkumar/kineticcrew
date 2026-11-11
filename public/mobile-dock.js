/* Five-item mobile navigation matching the Kinetic Crew reference. */
(() => {
  'use strict';
  if (document.getElementById('kcMobileDock')) return;

  const items = [
    { view: 'overview', icon: '⌂', label: 'Home', kind: 'standard' },
    { view: 'events', icon: '▦', label: 'Events', kind: 'standard' },
    { view: 'feed', icon: '+', label: 'Create', kind: 'create' },
    { view: 'people', icon: '♧', label: 'Crew', kind: 'standard' },
    { view: 'profile', icon: '♙', label: 'Profile', kind: 'standard' }
  ];

  const dock = document.createElement('nav');
  dock.id = 'kcMobileDock';
  dock.className = 'kc-mobile-dock kc-vibe-dock';
  dock.setAttribute('aria-label', 'Main app navigation');
  dock.innerHTML = items.map(item =>
    '<button type="button" class="' + (item.kind === 'create' ? 'dock-create' : '') + '" data-view="' + item.view + '" aria-label="' + item.label + '">' +
      '<span class="dock-icon" aria-hidden="true">' + item.icon + '</span>' +
      (item.kind === 'create' ? '' : '<span class="dock-label">' + item.label + '</span>') +
    '</button>'
  ).join('');
  document.body.appendChild(dock);

  function activeView() {
    const active = document.querySelector('#nav .navitem.active[data-view],#nav [data-view].active');
    if (active) return active.dataset.view;
    return document.body.classList.contains('kc-more-open') ? 'more' : '';
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
    if (button.dataset.view === 'feed') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector('#socialPostForm textarea, #socialPostForm input:not([type=hidden])')?.focus();
      }));
    }
  });

  const nav = document.getElementById('nav');
  const app = document.getElementById('app');
  if (nav) new MutationObserver(sync).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  if (app) new MutationObserver(sync).observe(app, { childList: true, subtree: true });
  sync();
  window.addEventListener('resize', sync, { passive: true });
})();
