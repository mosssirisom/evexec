(function(){
  'use strict';

  var lastPayloadKey = 'evexec_last_booking_payload';
  var lastBookingKey = 'evexec_last_booking_id';
  var submitting = false;

  function stableStringify(obj){
    if(!obj || typeof obj !== 'object') return String(obj || '');
    var keys = Object.keys(obj).sort();
    var out = {};
    keys.forEach(function(k){
      if(k === 'created_at' || k === 'updated_at') return;
      out[k] = obj[k];
    });
    return JSON.stringify(out);
  }

  function restoreBookingButton(bookingId){
    var btn = document.getElementById('bwViewBookingBtn');
    if(btn && bookingId) btn.href = '/booking?id=' + encodeURIComponent(bookingId);
  }

  function markRecentlySubmitted(payload, bookingId){
    try {
      sessionStorage.setItem(lastPayloadKey, stableStringify(payload));
      if(bookingId) sessionStorage.setItem(lastBookingKey, bookingId);
      sessionStorage.setItem('evexec_submitted', Date.now().toString());
    } catch(_) {}
  }

  function getRecentDuplicate(payload){
    try {
      var ts = Number(sessionStorage.getItem('evexec_submitted') || 0);
      var last = sessionStorage.getItem(lastPayloadKey) || '';
      var id = sessionStorage.getItem(lastBookingKey) || '';
      if(!ts || !last || !id) return null;
      if(Date.now() - ts > 120000) return null;
      return last === stableStringify(payload) ? id : null;
    } catch(_) { return null; }
  }

  var originalFetch = window.fetch;
  if(!originalFetch || originalFetch.__evexecHardened) return;

  function hardenedFetch(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    if(url.indexOf('/api/booking/create') !== -1 && method === 'POST'){
      try {
        var payload = init && init.body ? JSON.parse(init.body) : null;
        var duplicateId = getRecentDuplicate(payload);
        if(duplicateId){
          restoreBookingButton(duplicateId);
          return Promise.resolve(new Response(JSON.stringify({ success:true, bookingId: duplicateId, duplicate:true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        if(submitting){
          return Promise.resolve(new Response(JSON.stringify({ error:'Your booking is already being submitted. Please wait a moment.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        submitting = true;
        return originalFetch.apply(this, arguments).then(function(res){
          if(res && res.ok){
            res.clone().json().then(function(data){
              if(data && data.success && data.bookingId) markRecentlySubmitted(payload, data.bookingId);
            }).catch(function(){});
          }
          return res;
        }).finally(function(){ submitting = false; });
      } catch(_) {
        submitting = false;
      }
    }

    return originalFetch.apply(this, arguments);
  }

  hardenedFetch.__evexecHardened = true;
  window.fetch = hardenedFetch;
})();
