from http.server import BaseHTTPRequestHandler
from pathlib import Path
import re

FULL_PRICE_LIST = r'''
<section class="section pricing-section" id="prices">
  <div class="container">
    <div class="section-header">
      <span class="section-tag">Transparent Fixed Pricing</span>
      <h2>Full Airport Price List</h2>
      <p>Fixed prices from Blackpool & the Fylde Coast. Prices include flight monitoring and airport drop-off / pickup fees.</p>
    </div>
    <div class="price-table-wrapper">
      <table class="price-table">
        <thead>
          <tr>
            <th>Airport</th>
            <th>One Way</th>
            <th>Return</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Manchester Airport</td><td>£90</td><td>£180</td></tr>
          <tr><td>Liverpool Airport</td><td>£95</td><td>£190</td></tr>
          <tr><td>Leeds Bradford Airport</td><td>£135</td><td>£270</td></tr>
          <tr><td>Birmingham Airport</td><td>£215</td><td>£430</td></tr>
          <tr><td>Newcastle Airport</td><td>£250</td><td>£500</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>
'''

STYLE_FIX = r'''
<style id="evexec-force-remove-popular-routes-style">
#evexec-force-price-list{padding:70px 0;background:inherit;color:inherit;}
#evexec-force-price-list .container{max-width:1180px;margin:0 auto;padding:0 24px;}
#evexec-force-price-list .section-tag{display:block;color:#d5a538;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px;}
#evexec-force-price-list h2{font-family:inherit;font-size:clamp(36px,7vw,72px);line-height:1.05;margin:0 0 14px;color:inherit;}
#evexec-force-price-list p{color:rgba(255,255,255,.75);font-size:18px;margin:0 0 28px;}
#evexec-force-price-list table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.04);border:1px solid rgba(213,165,56,.45);border-radius:18px;overflow:hidden;display:table;}
#evexec-force-price-list th,#evexec-force-price-list td{padding:18px 16px;border-bottom:1px solid rgba(255,255,255,.12);text-align:left;}
#evexec-force-price-list th{color:#d5a538;font-weight:800;}
#evexec-force-price-list td:nth-child(2),#evexec-force-price-list td:nth-child(3){font-weight:800;color:#fff;}
@media(max-width:700px){#evexec-force-price-list{padding:46px 0;}#evexec-force-price-list th,#evexec-force-price-list td{padding:13px 10px;font-size:14px;}}
</style>
'''

SCRIPT = r'''
<script id="evexec-force-remove-popular-routes">
(function(){
  function t(el){return (el&&el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();}
  function sectionOf(el){
    if(!el)return null;
    var cur=el;
    for(var i=0;cur&&i<12;i++,cur=cur.parentElement){
      var txt=t(cur);
      if(txt.indexOf('popular airport routes')!==-1 && txt.indexOf('blackpool to manchester airport')!==-1)return cur;
      if(cur.tagName&&cur.tagName.toLowerCase()==='section'&&txt.indexOf('popular airport routes')!==-1)return cur;
    }
    return null;
  }
  function run(){
    if(document.getElementById('evexec-force-price-list'))return;
    var headings=Array.from(document.querySelectorAll('h1,h2,h3,h4,div,span,p'));
    var popular=headings.find(function(el){var x=t(el);return x==='popular airport routes'||x.indexOf('popular airport routes')!==-1&&x.length<160;});
    var popularSection=sectionOf(popular);
    var priceHtml=`<section id="evexec-force-price-list"><div class="container"><div class="section-header"><span class="section-tag">Transparent Fixed Pricing</span><h2>Full Airport Price List</h2><p>Fixed prices from Blackpool & the Fylde Coast. Prices include flight monitoring and airport drop-off / pickup fees.</p></div><div class="price-table-wrapper"><table><thead><tr><th>Airport</th><th>One Way</th><th>Return</th></tr></thead><tbody><tr><td>Manchester Airport</td><td>£90</td><td>£180</td></tr><tr><td>Liverpool Airport</td><td>£95</td><td>£190</td></tr><tr><td>Leeds Bradford Airport</td><td>£135</td><td>£270</td></tr><tr><td>Birmingham Airport</td><td>£215</td><td>£430</td></tr><tr><td>Newcastle Airport</td><td>£250</td><td>£500</td></tr></tbody></table></div></div></section>`;
    if(popularSection){popularSection.insertAdjacentHTML('beforebegin',priceHtml);popularSection.remove();}
    Array.from(document.querySelectorAll('article,[class*="card"],[class*="route"]')).forEach(function(el){var x=t(el);if(x.indexOf('blackpool to manchester airport')!==-1||x.indexOf('blackpool to liverpool airport')!==-1||x.indexOf('blackpool to leeds bradford airport')!==-1||x.indexOf('blackpool to birmingham airport')!==-1||x.indexOf('blackpool to newcastle airport')!==-1)el.remove();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
</script>
'''


def patch_html(html: str) -> str:
    html = re.sub(r'<script id="evexec-[^"]*popular[^"]*".*?</script>', '', html, flags=re.I | re.S)
    html = re.sub(r'<style id="evexec-force-remove-popular-routes-style".*?</style>', '', html, flags=re.I | re.S)
    html = re.sub(r'<section id="evexec-force-price-list".*?</section>', '', html, flags=re.I | re.S)
    injection = STYLE_FIX + SCRIPT
    if '</body>' in html:
        return html.replace('</body>', injection + '\n</body>', 1)
    return html + injection


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        root = Path(__file__).resolve().parents[1]
        html_path = root / 'index.html'
        if not html_path.exists():
            html_path = root / 'Index.html'

        if not html_path.exists():
            self.send_response(404)
            self.send_header('content-type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'EV Exec index.html not found')
            return

        html = html_path.read_text(encoding='utf-8', errors='ignore')
        html = patch_html(html)
        self.send_response(200)
        self.send_header('content-type', 'text/html; charset=utf-8')
        self.send_header('cache-control', 'no-store, max-age=0')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))
