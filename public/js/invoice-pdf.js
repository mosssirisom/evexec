/*
 * EV Exec customer invoice: A4 sheet + PDF.
 *
 * This is the customer's copy of the official EV Exec invoice. The layout is
 * a faithful copy of the operator app's invoice (evexecoperator
 * src/app/operator/invoices/page.jsx, InvoicePreview): navy header band with
 * the badge and tagline, gold "INVOICE", Invoice-to / Date / Invoice number,
 * the gold-bordered charges table with Subtotal / Tax / navy Total rows,
 * Payment terms + Thank you, the watermark flourish and the navy contact
 * footer. The PDF is produced the same way too: the sheet is rendered at A4
 * width (794px) with html2canvas and placed on an A4 page with jsPDF.
 * Operator-only controls and internal data are not part of this sheet.
 *
 * window.EvxInvoice.download({ invoice, business }) -> builds and saves the PDF
 */
(function () {
  'use strict';

  var NAVY = '#0B132B';
  var GOLD = '#d7a23f';
  var LOGO = '/public/images/ev-exec-invoice-logo.png';
  var LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) { return '£' + (Number(n) || 0).toFixed(2); }
  // House style: DD/MM/YYYY.
  function fmtDate(d) {
    var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : (d || '');
  }

  // Same sub-lines the operator invoice prints under the first charge.
  function journeyLines(j) {
    j = j || {};
    var lines = [];
    if (j.pickup) lines.push(j.pickup);
    if (j.time || j.date) lines.push(['Pick up', j.time, fmtDate(j.date)].filter(Boolean).join(' '));
    if (j.returnDate || j.returnTime) {
      lines.push(['Return', j.dropoff, j.returnTime, fmtDate(j.returnDate)].filter(Boolean).join(' '));
    } else if (j.dropoff) {
      lines.push('Drop-off ' + j.dropoff);
    }
    if (j.flight) lines.push('Flight ' + j.flight);
    var veh = [j.vehicle, j.passengers ? j.passengers + ' pax' : null, j.luggage ? 'Luggage: ' + j.luggage : null].filter(Boolean).join('  ·  ');
    if (veh) lines.push(veh);
    return lines;
  }

  // Lucide icons used on the operator invoice.
  var ICON = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    gem: '<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6M2 9h20"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
  };
  function icon(name, size, color) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">' + ICON[name] + '</svg>';
  }

  function statusChip(status) {
    var c = status === 'Paid' ? ['#10b981', '#047857'] : status === 'Cancelled' ? ['#94a3b8', '#64748b'] : ['#d7a23f', '#92400e'];
    return '<span style="display:inline-block;margin-top:5px;border:1px solid ' + c[0] + ';color:' + c[1] + ';border-radius:999px;padding:2px 9px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">' + esc(status) + '</span>';
  }

  function paymentText(inv) {
    var method = inv.paymentMethod ? String(inv.paymentMethod) : '';
    if (inv.status === 'Paid') return 'Paid in full' + (method ? ' by ' + method.toLowerCase() : '') + '. Thank you.';
    if (inv.status === 'Cancelled') return 'This invoice has been cancelled. No payment is due.';
    var due = inv.dueDate ? 'Due by ' + fmtDate(inv.dueDate) + '.\n' : '';
    return (method ? 'Payment method: ' + method + '.\n' : '') + due + (inv.paymentTerms || '');
  }

  // Builds the sheet. A4 at 96dpi is 794 x 1123px.
  function buildSheet(inv, biz) {
    var lbl = 'font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#64748b';
    var th = 'padding:12px 14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:' + GOLD;
    var lines = journeyLines(inv.journey);
    var items = inv.lineItems && inv.lineItems.length ? inv.lineItems : [{ description: 'Private passenger transport', quantity: 1, unitPrice: inv.total }];
    var rows = items.map(function (li, i) {
      return '<tr style="vertical-align:top;' + (i ? 'border-top:1px solid ' + GOLD + '22' : '') + '">' +
        '<td style="padding:12px 14px;color:#334155"><div style="font-weight:600;color:#1e293b;font-size:14px;line-height:1.35">' + esc(li.description) + '</div>' +
        (i === 0 && lines.length ? '<div style="margin-top:5px">' + lines.map(function (l) { return '<div style="font-size:11px;color:#64748b;line-height:1.6">' + esc(l) + '</div>'; }).join('') + '</div>' : '') +
        '</td>' +
        '<td style="padding:12px 6px;text-align:center;color:#475569;font-size:14px">' + esc(li.quantity) + '</td>' +
        '<td style="padding:12px 6px;text-align:center;color:#475569;font-size:14px;white-space:nowrap">' + money(li.unitPrice) + '</td>' +
        '<td style="padding:12px 14px;text-align:center;color:#1e293b;font-weight:600;font-size:14px;white-space:nowrap">' + money((Number(li.quantity) || 0) * (Number(li.unitPrice) || 0)) + '</td></tr>';
    }).join('');
    var sumRow = function (label, value, navy) {
      return '<tr style="' + (navy ? 'background:' + NAVY : 'border-top:1px solid ' + GOLD + '66') + '">' +
        '<td></td><td colspan="2" style="padding:' + (navy ? '14px' : '10px') + ' 6px;text-align:center;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:' + (navy ? '18px' : '12px') + ';color:' + (navy ? GOLD : '#475569') + ';' + (navy ? '' : 'border-left:1px solid ' + GOLD + '66') + '">' + label + '</td>' +
        '<td style="padding:' + (navy ? '14px' : '10px') + ' 14px;text-align:center;font-weight:' + (navy ? 900 : 600) + ';font-size:' + (navy ? '18px' : '14px') + ';color:' + (navy ? GOLD : '#1e293b') + ';white-space:nowrap">' + value + '</td></tr>';
    };
    var tagline = (biz.tagline || []).map(esc).join('<br>');
    var addr = (biz.addressLines || []).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');

    var el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;min-height:1123px;background:#fff;color:#0f172a;font-family:Inter,Arial,Helvetica,sans-serif;display:flex;flex-direction:column;-webkit-print-color-adjust:exact;print-color-adjust:exact';
    el.innerHTML =
      '<div style="flex:1;display:flex;flex-direction:column">' +
        // Header band
        '<div style="position:relative;background:' + NAVY + ';padding:32px 40px 56px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
            '<div><img src="' + LOGO + '" alt="" style="height:80px;width:auto;display:block">' +
              '<div style="margin-top:4px;height:1px;width:144px;background:' + GOLD + ';opacity:.55"></div>' +
              (tagline ? '<div style="margin-top:6px;font-size:9px;font-weight:600;line-height:1.7;letter-spacing:.24em;color:' + GOLD + '">' + tagline + '</div>' : '') +
            '</div>' +
            '<div style="text-align:right"><div style="font-size:30px;font-weight:300;letter-spacing:.35em;color:' + GOLD + '">INVOICE</div>' +
              '<div style="margin:8px 0 0 auto;height:2px;width:96px;background:' + GOLD + '"></div></div>' +
          '</div>' +
          '<svg style="position:absolute;left:0;right:0;bottom:0;width:100%;height:32px" viewBox="0 0 100 10" preserveAspectRatio="none"><polygon points="0,10 100,10 100,3 55,10" fill="#ffffff"/><line x1="55" y1="10" x2="100" y2="3" stroke="' + GOLD + '" stroke-width="0.4"/></svg>' +
        '</div>' +
        // Bill to + meta
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:20px 40px 0;font-size:14px">' +
          '<div><div style="' + lbl + '">Invoice to</div>' +
            '<div style="margin-top:8px;font-size:18px;font-weight:700;color:#0f172a">' + esc(inv.customer.name) + '</div>' +
            (inv.customer.address ? inv.customer.address.split(/,\s*/).map(function (l) { return '<div style="color:#475569">' + esc(l) + '</div>'; }).join('') : '') +
            (inv.customer.email ? '<div style="margin-top:4px;color:#475569">' + esc(inv.customer.email) + '</div>' : '') +
            (inv.customer.phone ? '<div style="color:#475569">' + esc(inv.customer.phone) + '</div>' : '') +
          '</div>' +
          '<div style="border-left:1px solid ' + GOLD + '55;padding-left:24px">' +
            '<div style="display:flex;gap:12px;align-items:flex-start">' + icon('calendar', 20, GOLD) +
              '<div><div style="' + lbl + '">Date</div><div style="margin-top:2px;font-weight:500;color:#1e293b">' + esc(fmtDate(inv.issueDate)) + '</div></div></div>' +
            '<div style="margin:12px 0;height:1px;background:' + GOLD + '33"></div>' +
            '<div style="display:flex;gap:12px;align-items:flex-start">' + icon('file', 20, GOLD) +
              '<div><div style="' + lbl + '">Invoice number</div><div style="margin-top:2px;font-weight:500;color:#1e293b">' + esc(inv.number) + '</div>' +
              '<div style="margin-top:2px;font-size:12px;color:#64748b">Booking ref ' + esc(inv.booking.ref || '') + '</div>' + statusChip(inv.status) + '</div></div>' +
          '</div>' +
        '</div>' +
        // Charges table
        '<div style="padding:24px 40px 0">' +
          '<div style="border:1px solid ' + GOLD + '66;border-radius:2px;overflow:hidden">' +
            '<table style="width:100%;border-collapse:collapse;table-layout:fixed">' +
              '<colgroup><col><col style="width:48px"><col style="width:96px"><col style="width:96px"></colgroup>' +
              '<thead><tr style="background:' + NAVY + '"><th style="' + th + ';text-align:left">Description</th><th style="' + th + ';text-align:center;padding-left:4px;padding-right:4px">Qty</th><th style="' + th + ';text-align:center">Price</th><th style="' + th + ';text-align:center">Amount</th></tr></thead>' +
              '<tbody>' + rows +
                sumRow('Subtotal', money(inv.subtotal)) +
                sumRow('Tax (' + Math.round((inv.vatRate || 0) * 100) + '%)', money(inv.vatAmount)) +
                sumRow('Total', money(inv.total), true) +
              '</tbody></table></div></div>' +
        // Payment + thank you
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:32px 40px">' +
          '<div style="display:flex;gap:12px;align-items:flex-start"><span style="width:44px;height:44px;border:2px solid ' + GOLD + ';border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none">' + icon('card', 20, GOLD) + '</span>' +
            '<div><div style="font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#1e293b">Payment</div>' +
            '<div style="margin-top:4px;font-size:12px;line-height:1.6;color:#475569;white-space:pre-wrap">' + esc(paymentText(inv)) + '</div></div></div>' +
          '<div style="display:flex;gap:12px;align-items:flex-start;border-left:1px solid ' + GOLD + '33;padding-left:24px"><span style="width:44px;height:44px;border:2px solid ' + GOLD + ';border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none">' + icon('gem', 20, GOLD) + '</span>' +
            '<div><div style="font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#1e293b">Thank you</div>' +
            '<div style="margin-top:4px;font-size:12px;line-height:1.6;color:#475569">We appreciate your business and look forward to our continued partnership.</div></div></div>' +
        '</div>' +
        // Flourish + watermark
        '<div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;padding:32px">' +
          '<img src="' + LOGO + '" alt="" style="position:absolute;left:50%;top:50%;width:320px;max-width:70%;transform:translate(-50%,-50%);opacity:.06">' +
          '<div style="position:relative;text-align:center"><div style="font-size:16px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:' + NAVY + '">Thank you for choosing ' + esc(biz.name || 'EV Exec') + '</div>' +
          '<div style="margin:10px auto 0;height:1px;width:80px;background:' + GOLD + '"></div></div>' +
        '</div>' +
      '</div>' +
      // Footer band
      '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding:20px 40px;background:' + NAVY + ';font-size:11px;color:#cbd5e1">' +
        '<div style="display:flex;gap:8px;align-items:flex-start">' + icon('pin', 16, GOLD) + '<div style="line-height:1.4">' + addr + '</div></div>' +
        (biz.phone ? '<div style="display:flex;gap:8px;align-items:center">' + icon('phone', 16, GOLD) + esc(biz.phone) + '</div>' : '') +
        (biz.email ? '<div style="display:flex;gap:8px;align-items:center">' + icon('mail', 16, GOLD) + esc(biz.email) + '</div>' : '') +
        (biz.web ? '<div style="display:flex;gap:8px;align-items:center">' + icon('globe', 16, GOLD) + esc(biz.web) + '</div>' : '') +
      '</div>';
    return el;
  }

  var libsLoading = null;
  function loadLibs() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    if (libsLoading) return libsLoading;
    libsLoading = Promise.all(LIBS.map(function (src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src; s.async = true; s.onload = resolve;
        s.onerror = function () { reject(new Error('Could not load the PDF tools. Check your connection and try again.')); };
        document.head.appendChild(s);
      });
    })).catch(function (e) { libsLoading = null; throw e; });
    return libsLoading;
  }

  function waitForImages(el) {
    return Promise.all(Array.prototype.map.call(el.querySelectorAll('img'), function (img) {
      return img.complete ? null : new Promise(function (r) { img.onload = img.onerror = r; });
    }));
  }

  // Sheet -> canvas -> A4 PDF, with the operator app's page slicing.
  function buildPdf(data) {
    return loadLibs().then(function () {
      var el = buildSheet(data.invoice, data.business || {});
      document.body.appendChild(el);
      var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      return Promise.all([waitForImages(el), fontsReady]).then(function () {
        el.style.height = Math.max(1123, Math.ceil(el.getBoundingClientRect().height)) + 'px';
        return window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 900 });
      }).then(function (canvas) {
        el.remove();
        var jsPDF = window.jspdf.jsPDF;
        var pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        pdf.setProperties({ title: 'EV Exec Invoice ' + data.invoice.number, author: (data.business && data.business.name) || 'EV Exec' });
        var pageW = pdf.internal.pageSize.getWidth();
        var pageH = pdf.internal.pageSize.getHeight();
        var imgH = (canvas.height * pageW) / canvas.width;
        var img = canvas.toDataURL('image/jpeg', 0.95);
        var remaining = imgH, position = 0;
        pdf.addImage(img, 'JPEG', 0, position, pageW, imgH);
        remaining -= pageH;
        while (remaining > 1) { position -= pageH; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, position, pageW, imgH); remaining -= pageH; }
        return pdf;
      }, function (e) { el.remove(); throw e; });
    });
  }

  function fileName(number) {
    return 'EV-EXEC-Invoice-' + String(number || 'invoice').replace(/[^A-Za-z0-9_-]+/g, '-') + '.pdf';
  }

  // iPhone Safari won't reliably download a blob, so phones get the share
  // sheet (Save to Files, Mail, Print…); desktop gets a normal download.
  function download(data) {
    return buildPdf(data).then(function (pdf) {
      var name = fileName(data.invoice.number);
      var blob = pdf.output('blob');
      var file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/pdf' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: name }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          pdf.save(name);
        });
      }
      pdf.save(name);
    });
  }

  window.EvxInvoice = { download: download, buildPdf: buildPdf, buildSheet: buildSheet, fileName: fileName };
})();
