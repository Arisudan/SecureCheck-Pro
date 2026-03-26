const CACHE_NAME = 'securecheck-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './scanner.worker.js',
    './manifest.json',
    './cookie-policy.html',
    './terms-of-service.html',
    './privacy-policy.html',
    'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Syne:wght@400..800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Core App Files: Cache First
    if (ASSETS.includes(url.pathname) || ASSETS.includes(`./${url.pathname}`)) {
        event.respondWith(
            caches.match(event.request).then(res => res || fetch(event.request))
        );
        return;
    }

    // External CDNs: Stale While Revalidate
    if (url.origin.includes('cdnjs') || url.origin.includes('googleapis')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                    return response || fetchPromise;
                });
            })
        );
        return;
    }

    // Others: Network First
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
