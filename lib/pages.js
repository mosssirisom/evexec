'use strict';

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function operatorPage(title, bodyHtml, success = true) {
  const accent = success ? '#22c55e' : '#ef4444';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(title)} — EV Exec</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#020813;color:#fff;font-family:Inter,system-ui,sans-serif;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:rgba(255,255,255,.065);border:1px solid rgba(255,255,255,.12);
  border-radius:16px;padding:36px 32px;max-width:520px;width:100%}
.logo{font-weight:900;letter-spacing:.06em;font-size:.95rem;margin-bottom:24px;display:block;
  color:#fff;text-decoration:none}
.logo span{color:#d5a538}
h1{color:${accent};margin:0 0 16px;font-size:1.5rem;font-weight:800}
p{color:rgba(255,255,255,.72);line-height:1.65;margin:0 0 10px}
strong{color:rgba(255,255,255,.9)}
.price{color:#d5a538;font-size:1.3rem;font-weight:900}
a{color:#d5a538;text-decoration:none}
.back{margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08);
  font-size:13px;color:rgba(255,255,255,.4)}
</style>
</head>
<body>
<div class="card">
<a class="logo" href="/">EV <span>EXEC</span></a>
<h1>${esc(title)}</h1>
${bodyHtml}
<div class="back"><a href="/">← Back to evexec.co.uk</a></div>
</div>
</body>
</html>`;
}

module.exports = { operatorPage, esc };
