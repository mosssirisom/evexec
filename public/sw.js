/* EV Exec Service Worker — push notifications */
'use strict';

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'EV Exec', body: event.data.text() }; }

  const title = payload.title || 'EV Exec';
  const options = {
    body:    payload.body  || 'Update from EV Exec',
    icon:    '/public/favicon.svg',
    badge:   '/public/favicon.svg',
    tag:     payload.tag   || 'evexec',
    data:    payload.data  || {},
    vibrate: [200, 100, 200],
    actions: payload.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});
