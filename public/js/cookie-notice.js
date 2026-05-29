(function () {
  if (localStorage.getItem('evexec_cookie_notice') === 'dismissed') return;

  var banner = document.createElement('div');
  banner.id = 'evexec-cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie notice');
  banner.innerHTML = [
    '<style>',
    '#evexec-cookie-banner{',
      'position:fixed;bottom:0;left:0;right:0;z-index:9999;',
      'background:rgba(2,8,19,.97);',
      'border-top:1px solid rgba(213,165,56,.30);',
      'padding:16px 20px;',
      'display:flex;align-items:center;justify-content:space-between;gap:16px;',
      'flex-wrap:wrap;',
      'font-family:Inter,system-ui,sans-serif;',
      'font-size:13.5px;',
      'color:rgba(255,255,255,.72);',
      'box-shadow:0 -8px 32px rgba(0,0,0,.45);',
    '}',
    '#evexec-cookie-banner p{margin:0;line-height:1.55;flex:1;min-width:200px}',
    '#evexec-cookie-banner a{color:#d5a538;text-decoration:none}',
    '#evexec-cookie-banner a:hover{text-decoration:underline}',
    '#evexec-cookie-dismiss{',
      'background:linear-gradient(135deg,#f1c56a,#d5a538 55%,#a97918);',
      'color:#06101c;',
      'border:none;cursor:pointer;',
      'padding:10px 22px;border-radius:8px;',
      'font-size:13px;font-weight:700;',
      'white-space:nowrap;flex-shrink:0;',
      'font-family:inherit;',
    '}',
    '#evexec-cookie-dismiss:hover{opacity:.88}',
    '</style>',
    '<p>',
      'This website uses only essential session storage to maintain your booking journey. ',
      'We do not use tracking or advertising cookies. ',
      'For full details, see our <a href="/privacy">Privacy Policy</a>.',
    '</p>',
    '<button id="evexec-cookie-dismiss" type="button">Got it</button>'
  ].join('');

  document.body.appendChild(banner);

  document.getElementById('evexec-cookie-dismiss').addEventListener('click', function () {
    localStorage.setItem('evexec_cookie_notice', 'dismissed');
    banner.remove();
  });
})();
