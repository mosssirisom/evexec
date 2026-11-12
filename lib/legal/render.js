'use strict';

// Shared helpers for the legal templates: building a section's blocks and
// rendering them in the same markup the terms and privacy pages use.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Blocks. Text passed to p() and li() is HTML written by the template; every
// business-supplied value in it must go through esc() first.
const p = (html) => ({ t: 'p', html });
const ul = (items) => ({ t: 'ul', items });
const table = (head, rows) => ({ t: 'table', head, rows });
const section = (title, ...blocks) => ({ title, blocks });

function renderBlock(b) {
  if (b.t === 'p') return `  <p>${b.html}</p>`;
  if (b.t === 'ul') return `  <ul style="margin-top:12px">\n${b.items.map((i) => `    <li>${i}</li>`).join('\n')}\n  </ul>`;
  if (b.t === 'table') {
    const head = `<tr>${b.head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr>`;
    const rows = b.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    return `  <div class="policy-table-wrap"><table class="policy-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }
  return '';
}

// Numbered content cards, one per section: "1", the heading, then the blocks.
function renderSections(sections, ids = {}) {
  return sections.map((s, i) => `<div class="content-card"${ids[i + 1] ? ` id="${ids[i + 1]}"` : ''}>
  <p class="section-label">${i + 1}</p>
  <h2>${s.title}</h2>
${s.blocks.map(renderBlock).join('\n')}
</div>`).join('\n\n');
}

// Plain text of a section list, for tests and for a printable copy.
function sectionsText(sections) {
  const strip = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&middot;/g, '·');
  return sections.map((s, i) => [`${i + 1}`, strip(s.title)].concat(s.blocks.flatMap((b) =>
    b.t === 'p' ? [strip(b.html)] : b.t === 'ul' ? b.items.map(strip) : b.t === 'table' ? [b.head.map(strip).join(''), ...b.rows.map((r) => r.map(strip).join(''))] : [])).join('\n')).join('\n');
}

module.exports = { esc, p, ul, table, section, renderSections, sectionsText };
