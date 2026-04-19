// Service Worker for FAJO ERP Push Notifications

self.addEventListener('push', (event) => {
    if (!event.data) return

    const data = event.data.json()
    const options = {
        body: data.message || data.body || 'New notification',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/',
        },
        actions: [],
        tag: data.tag || 'default',
        renotify: true,
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'FAJO ERP', options)
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification.data?.url || '/'
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing window if open
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus()
                }
            }
            // Otherwise open new window
            return clients.openWindow(url)
        })
    )
})

// Basic cache for offline fallback
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
