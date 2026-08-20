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
      // Android Chrome 은 SVG 알림 아이콘을 거부한다 (아이콘 없이 뜨거나 드롭됨).
      // 소비기한 알림이 이 앱의 존재 이유라 여기서 조용히 실패하면 안 된다.
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
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
