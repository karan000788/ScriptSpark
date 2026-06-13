/**
 * ScriptSpark Wallpaper — Injects animated gradient background.
 * Lightweight, no user interaction needed.
 */
(function () {
  'use strict';

  function init() {
    if (document.querySelector('.wp-bg')) return;

    var bg = document.createElement('div');
    bg.className = 'wp-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML =
      '<div class="wp-orb wp-orb-1"></div>' +
      '<div class="wp-orb wp-orb-2"></div>' +
      '<div class="wp-orb wp-orb-3"></div>' +
      '<div class="wp-orb wp-orb-4"></div>' +
      '<div class="wp-grid"></div>' +
      '<div class="wp-noise"></div>';

    document.body.insertBefore(bg, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
