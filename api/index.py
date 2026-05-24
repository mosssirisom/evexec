from http.server import BaseHTTPRequestHandler
from pathlib import Path
import re

PATCH = r'''
<script id="evexec-pricing-swap-fix-v2">
(function () {
  function cleanText(el) {
    return (el && el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function meaningfulContainer(el) {
    if (!el) return null;
    var candidates = [];
    var cur = el;
    for (var i = 0; cur && i < 8; i++, cur = cur.parentElement) {
      var t = cleanText(cur);
      var classes = (cur.className || '').toString().toLowerCase();
      if (cur.tagName && cur.tagName.toLowerCase() === 'section') candidates.push(cur);
      if (classes.indexOf('section') !== -1 || classes.indexOf('pricing') !== -1 || classes.indexOf('routes') !== -1 || classes.indexOf('airport') !== -1) candidates.push(cur);
      if (t.indexOf('popular airport routes') !== -1 && t.length < 5000) candidates.push(cur);
      if (t.indexOf('transparent fixed pricing') !== -1 && t.length < 5000) candidates.push(cur);
      if (t.indexOf('full airport price list') !== -1 && t.length < 5000) candidates.push(cur);
    }
    return candidates[candidates.length - 1] || el.closest('section') || el.parentElement;
  }

  function findHeadingContaining(phrases) {
    var selectors = 'h1,h2,h3,h4,h5,p,span,div';
    var nodes = Array.from(document.querySelectorAll(selectors));
    return nodes.find(function (el) {
      var t = cleanText(el);
      if (!t || t.length > 260) return false;
      return phrases.some(function (phrase) { return t.indexOf(phrase) !== -1; });
    });
  }

  function removeAirportRouteCards() {
    var airportWords = ['manchester airport','liverpool airport','leeds bradford airport','birmingham airport','newcastle airport'];
    Array.from(document.querySelectorAll('article, [class*="card"], [class*="route"]')).forEach(function (card) {
      var t = cleanText(card);
      var hasAirport = airportWords.some(function (word) { return t.indexOf(word) !== -1; });
      var hasPrice = t.indexOf('one way') !== -1 || t.indexOf('return') !== -1 || t.indexOf('from') !== -1;
      var hasImage = card.querySelector('img');
      if (hasAirport && (hasImage || hasPrice)) {
        card.remove();
      }
    });
  }

  function run() {
    var popularHeading = findHeadingContaining(['popular airport routes']);
    var pricingHeading = findHeadingContaining(['transparent fixed pricing', 'transparent pricing', 'full airport price list']);
    var popularBlock = meaningfulContainer(popularHeading);
    var pricingBlock = meaningfulContainer(pricingHeading);

    if (popularBlock && pricingBlock && popularBlock !== pricingBlock) {
      popularBlock.parentNode.insertBefore(pricingBlock, popularBlock);
      popularBlock.remove();
    } else if (popularBlock) {
      popularBlock.remove();
    }

    removeAirportRouteCards();

    Array.from(document.querySelectorAll('*')).forEach(function (el) {
      var t = cleanText(el);
      if (t === 'popular airport routes') {
        var block = meaningfulContainer(el);
        if (block) block.remove();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
</script>
'''


def server_side_patch(html: str) -> str:
    # Remove previous injected versions so the live page always gets the newest patch.
    html = re.sub(
        r'<!-- EVEXEC_PRICING_SWAP_FIX_START -->.*?<!-- EVEXEC_PRICING_SWAP_FIX_END -->',
        '',
        html,
        flags=re.S | re.I,
    )
    html = re.sub(
        r'<script id="evexec-pricing-swap-fix[^"]*">.*?</script>',
        '',
        html,
        flags=re.S | re.I,
    )

    if '</body>' in html:
        return html.replace('</body>', PATCH + '\n</body>', 1)
    return html + PATCH


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
        html = server_side_patch(html)

        self.send_response(200)
        self.send_header('content-type', 'text/html; charset=utf-8')
        self.send_header('cache-control', 'no-store, max-age=0')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))
