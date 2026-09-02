// Rentmaikar push notification service worker.
// Scope: web push messaging only. Not an app-shell / offline cache worker.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { title: 'Rentmaikar', body: event.data && event.data.text() }; }
  const title = payload.title || 'Rentmaikar';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-icon-192.png',
    badge: payload.badge || '/favicon.png',
    data: {
      url: payload.url || '/',
      deepLink: payload.deepLink || null,
      rentalId: payload.rentalId || null,
      paymentId: payload.paymentId || null,
    },
    tag: payload.tag || 'rentmaikar-payment',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const webUrl = data.url || '/';
  const deepLink = data.deepLink;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Try focus existing window on same origin
    for (const client of allClients) {
      if ('focus' in client) {
        client.postMessage({ type: 'rentmaikar-deep-link', deepLink, url: webUrl, rentalId: data.rentalId, paymentId: data.paymentId });
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(webUrl); } catch (_) {} }
        return;
      }
    }
    // No window open — try native deep link first, then web fallback.
    if (deepLink) {
      try { await self.clients.openWindow(deepLink); return; } catch (_) {}
    }
    await self.clients.openWindow(webUrl);
  })());
});
