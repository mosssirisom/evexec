(function(){
  'use strict';

  var params = new URLSearchParams(window.location.search || '');
  var bookingId = params.get('id');
  var payment = params.get('payment');

  if(!bookingId || payment !== 'success') return;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) return;

  var attempts = 0;
  var maxAttempts = 10;

  function isPaid(data){
    var paymentStatus = String((data && data.payment_status) || '').toLowerCase();
    return paymentStatus === 'paid' || paymentStatus === 'cash_on_day';
  }

  function cleanUrl(){
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch(_) {}
  }

  function poll(){
    attempts += 1;
    fetch('/api/booking/get?id=' + encodeURIComponent(bookingId), { cache: 'no-store' })
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if(isPaid(data)) {
          cleanUrl();
          window.location.reload();
          return;
        }
        if(attempts < maxAttempts) window.setTimeout(poll, 2500);
      })
      .catch(function(){
        if(attempts < maxAttempts) window.setTimeout(poll, 2500);
      });
  }

  window.setTimeout(poll, 1500);
})();
