// EV Exec site chrome behaviour: header background on scroll, dropdown menus
// and the full-screen mobile menu. Shared by every customer-facing page.
(function () {
  'use strict';
  var header = document.getElementById('siteHeader');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 24); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Dropdowns: click to toggle (keyboard and touch), hover on desktop pointers.
  var dds = [].slice.call(document.querySelectorAll('.evx-has-dd'));
  function closeAll(except) {
    dds.forEach(function (li) {
      if (li === except) return;
      li.classList.remove('open');
      var b = li.querySelector('button');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  dds.forEach(function (li) {
    var btn = li.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      // A click straight after hover-open keeps it open instead of toggling shut.
      var open = !li.classList.contains('open') || (finePointer && Date.now() - (li._hoverAt || 0) < 600);
      closeAll(li);
      li.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    if (finePointer) {
      var t;
      li.addEventListener('mouseenter', function () { clearTimeout(t); if (!li.classList.contains('open')) li._hoverAt = Date.now(); closeAll(li); li.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); });
      li.addEventListener('mouseleave', function () { t = setTimeout(function () { li.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }, 160); });
    }
  });
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.evx-has-dd')) closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  // Mobile menu (same behaviour as the original homepage menu)
  var toggle = document.getElementById('menuToggle');
  var close = document.getElementById('menuClose');
  var menu = document.getElementById('mobileMenu');
  function openMenu() {
    menu.style.display = 'flex';
    void menu.offsetWidth; // reflow so the transition runs on iOS Safari
    menu.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (toggle) { toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Close menu'); }
  }
  function closeMenu() {
    menu.classList.remove('open');
    setTimeout(function () { menu.style.display = ''; }, 300);
    document.body.style.overflow = '';
    if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); }
  }
  if (toggle && menu) toggle.addEventListener('click', function () { menu.classList.contains('open') ? closeMenu() : openMenu(); });
  if (close && menu) close.addEventListener('click', closeMenu);
  if (menu) [].forEach.call(menu.querySelectorAll('a'), function (a) { a.addEventListener('click', closeMenu); });

  // CTA banner photos load just before they scroll into view.
  var lazyBgs = document.querySelectorAll('.evx-lazy-bg');
  if (lazyBgs.length) {
    if ('IntersectionObserver' in window) {
      var bgIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-loaded'); bgIo.unobserve(e.target); } });
      }, { rootMargin: '400px 0px' });
      [].forEach.call(lazyBgs, function (el) { bgIo.observe(el); });
    } else {
      [].forEach.call(lazyBgs, function (el) { el.classList.add('is-loaded'); });
    }
  }

  // Sticky Book / Quote bar (phones): out of the way while the page's own
  // Book / Quote buttons or a booking form are on screen.
  var cta = document.getElementById('evxMobileCta');
  var zones = document.querySelectorAll('[data-evx-cta-zone]');
  if (cta && zones.length && 'IntersectionObserver' in window) {
    var seen = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      cta.classList.toggle('is-away', seen.size > 0);
    });
    [].forEach.call(zones, function (z) { io.observe(z); });
  }
})();
