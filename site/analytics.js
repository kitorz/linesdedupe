/*!
 * linesdedupe.com — optional analytics loader
 *
 * Fully opt-in: nothing loads unless you put a real GA4 measurement ID
 * and/or a Microsoft Clarity project ID in analytics.config.js (or in the
 * <meta name="ld-ga4"> / <meta name="ld-clarity"> tags).
 *
 * Empty strings (the default) => this script does nothing at all.
 */
(function () {
  'use strict';

  var PLACEHOLDERS = [
    '', 'ga4', 'clarity',
    'G-XXXXXXXXXX', 'XXXXXXXXXX',
    'YOUR_GA4_ID', 'YOUR_CLARITY_ID',
    'GA4_ID', 'CLARITY_ID'
  ];

  function isEnabled(id) {
    if (typeof id !== 'string') return false;
    id = id.trim();
    if (!id) return false;
    return PLACEHOLDERS.indexOf(id.toUpperCase()) === -1 &&
           PLACEHOLDERS.indexOf(id) === -1;
  }

  function metaContent(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? (el.getAttribute('content') || '') : '';
  }

  var cfg = (typeof window.__LD_ANALYTICS__ === 'object' && window.__LD_ANALYTICS__) || {};
  var ga4 = cfg.ga4 || metaContent('ld-ga4');
  var clarity = cfg.clarity || metaContent('ld-clarity');

  /* ---------- GA4 ---------- */
  if (isEnabled(ga4)) {
    var id = ga4.trim();

    var gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(gtagScript);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);
  }

  /* ---------- Microsoft Clarity ---------- */
  if (isEnabled(clarity)) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r);
      t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', clarity.trim());
  }
})();
