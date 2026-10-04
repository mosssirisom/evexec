/* Cookie consent for Google Analytics (UK GDPR / PECR).
 *
 * Analytics sets cookies, so it only loads after the visitor taps Accept.
 * The choice is kept in localStorage ("evx_consent": "granted" | "denied")
 * and can be changed any time from the footer's "Cookie settings" link,
 * which calls window.evxCookieSettings(). Nothing here blocks the page:
 * if storage is unavailable the banner simply shows again next visit.
 */
(function () {
  var GA_ID = 'G-QY9XHDNSMC';
  var KEY = 'evx_consent';

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }

  var loaded = false;
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  // Remove Google Analytics cookies after a visitor withdraws consent.
  function clearAnalyticsCookies() {
    var host = location.hostname.replace(/^www\./, '');
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0 || name === '_gid') {
        ['', '; domain=' + host, '; domain=.' + host].forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + d;
        });
      }
    });
  }

  var banner = null;
  function hide() { if (banner) { banner.remove(); banner = null; } }

  function choose(v) {
    var before = read();
    write(v);
    hide();
    if (v === 'granted') loadAnalytics();
    else { clearAnalyticsCookies(); if (before === 'granted' && loaded) location.reload(); }
  }

  function show() {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'evx-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.innerHTML =
      '<p>We use Google Analytics cookies to see how our website is used. They are only set if you accept. ' +
      '<a href="/privacy#cookies">Privacy policy</a></p>' +
      '<div class="evx-consent-btns">' +
      '<button type="button" data-v="denied">Reject</button>' +
      '<button type="button" data-v="granted" class="evx-consent-ok">Accept</button></div>';
    banner.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
      if (v) choose(v);
    });
    document.body.appendChild(banner);
  }

  var css = document.createElement('style');
  css.textContent =
    '.evx-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;' +
    'background:#07111f;color:rgba(255,255,255,.85);border:1px solid rgba(213,165,56,.45);border-radius:16px;' +
    'padding:16px 18px;box-shadow:0 18px 50px rgba(0,0,0,.5);font:14px/1.5 Inter,system-ui,sans-serif}' +
    '.evx-consent p{margin:0 0 12px}.evx-consent a{color:#d5a538}' +
    '.evx-consent-btns{display:flex;gap:10px;justify-content:flex-end}' +
    '.evx-consent button{min-height:44px;padding:0 20px;border-radius:10px;font:600 14px Inter,system-ui,sans-serif;cursor:pointer;' +
    'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3)}' +
    '.evx-consent .evx-consent-ok{background:#d5a538;color:#020813;border-color:#d5a538}';
  document.head.appendChild(css);

  window.evxCookieSettings = function () { show(); };

  var state = read();
  if (state === 'granted') loadAnalytics();
  else if (state !== 'denied') {
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
})();
