/* Service worker: riceve le notifiche e apre l'app quando le tocchi. */

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = { titolo: 'Borsa', corpo: 'Nuovo aggiornamento sui mercati.' };
  try { if (event.data) d = { ...d, ...event.data.json() }; } catch { if (event.data) d.corpo = event.data.text(); }

  event.waitUntil(self.registration.showNotification(d.titolo, {
    body: d.corpo,
    icon: 'icons/icona-192.png',
    badge: 'icons/icona-192.png',
    tag: d.tipo === 'avviso' ? 'avviso' : 'bollettino',  // un avviso non si accumula sul precedente
    renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil((async () => {
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) if ('focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
