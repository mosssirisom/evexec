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

// An operator's own text -> sections. Everything is escaped; the only markup
// that can appear is what this function builds. "## Heading" starts a numbered
// section, "- item" lines make a list, blank lines separate paragraphs.
function textToSections(text, firstTitle) {
  const sections = [];
  let cur = null;
  let para = [];
  let list = [];
  const ensure = (title) => { if (!cur) { cur = section(title || firstTitle || 'Terms'); sections.push(cur); } return cur; };
  const flushPara = () => { if (para.length) { ensure().blocks.push(p(esc(para.join(' ')))); para = []; } };
  const flushList = () => { if (list.length) { ensure().blocks.push(ul(list)); list = []; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const h = /^#{1,3}\s+(.+)$/.exec(line);
    if (h) { flushPara(); flushList(); cur = section(esc(h[1].trim())); sections.push(cur); continue; }
    const li = /^[-*•]\s+(.+)$/.exec(line);
    if (li) { flushPara(); list.push(esc(li[1].trim())); continue; }
    if (!line) { flushPara(); flushList(); continue; }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return sections;
}

module.exports = { textToSections, esc, p, ul, table, section, renderSections, sectionsText };
