/* Eatco Service Worker — push notifications + PWA install support */

// PWA 설치 조건 충족용 — 캐싱 없이 네트워크 패스스루
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  const data = event.data
    ? event.data.json()
    : { title: 'Eatco', body: '새로운 알림이 있습니다.' };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/' },
      tag: 'eatco-notification',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
