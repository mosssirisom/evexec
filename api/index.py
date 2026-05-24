from http.server import BaseHTTPRequestHandler
from pathlib import Path

PATCH = r'''
<script id="evexec-pricing-swap-fix">
(function () {
  function cleanText(el) {
    return (el && el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function nearestSection(el) {
    if (!el) return null;
    return el.closest('section') || el.closest('[class*="section"]') || el.closest('[class*="pricing"]') || el.closest('[class*="routes"]') || el.parentElement;
  }

  function findSmallTextNode(phrases) {
    var nodes = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,p,span,div'));
    return nodes.find(function (el) {
      var t = cleanText(el);
      if (!t || t.length > 220) return false;
      return phrases.some(function (phrase) { return t.indexOf(phrase) !== -1; });
    });
  }

  function removeAirportRouteImages() {
    Array.from(document.querySelectorAll('img')).forEach(function (img) {
      var src = (img.getAttribute('src') || '').toLowerCase();
      var alt = (img.getAttribute('alt') || '').toLowerCase();
      var isAirportRoute =
        src.indexOf('manchester-airport') !== -1 ||
        src.indexOf('liverpool-airport') !== -1 ||
        src.indexOf('leeds-bradford-airport') !== -1 ||
        src.indexOf('birmingham-airport') !== -1 ||
        src.indexOf('newcastle-airport') !== -1 ||
        alt.indexOf('airport') !== -1 && alt.indexOf('tesla') !== -1;

      if (isAirportRoute) {
        var card = img.closest('article') || img.closest('[class*="card"]') || img.closest('[class*="route"]') || img.parentElement;
        if (card) card.remove();
      }
    });
  }

  function run() {
    var popularHeading = findSmallTextNode(['popular airport routes']);
    var pricingHeading = findSmallTextNode(['transparent fixed pricing', 'transparent pricing', 'full airport price list']);
    var popularSection = nearestSection(popularHeading);
    var pricingSection = nearestSection(pricingHeading);

    if (popularSection && pricingSection && popularSection !== pricingSection) {
      popularSection.parentNode.insertBefore(pricingSection, popularSection);
      popularSection.remove();
    } else if (popularSection && !pricingSection) {
      popularSection.remove();
    }

    removeAirportRouteImages();

    Array.from(document.querySelectorAll('a')).forEach(function (a) {
      var t = cleanText(a);
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (t.indexOf('popular airport routes') !== -1 || href.indexOf('popular-routes') !== -1) {
        a.remove();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
</script>
'''

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        root = Path(__file__).resolve().parents[1]
        candidates = [root / 'index.html', root / 'Index.html']
        html_path = next((p for p in candidates if p.exists()), None)

        if not html_path:
            self.send_response(404)
            self.send_header('content-type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'EV Exec index.html not found')
            return

        html = html_path.read_text(encoding='utf-8', errors='ignore')

        if 'evexec-pricing-swap-fix' not in html:
            if '</body>' in html:
                html = html.replace('</body>', PATCH + '\n</body>', 1)
            else:
                html += PATCH

        self.send_response(200)
        self.send_header('content-type', 'text/html; charset=utf-8')
        self.send_header('cache-control', 'no-store, max-age=0')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))
