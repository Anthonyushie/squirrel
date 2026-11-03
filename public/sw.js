// Squirrel service worker: caches the app shell only (pages, JS, CSS, icons).
// API responses and audio are never cached here; audio lives in IndexedDB.
const CACHE = 'squirrel-shell-v1';
const PAGES = ['/listen', '/creator', '/settings'];
const EXTRA = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// Fetch each page and every /_next/static asset it references, so all tabs open offline
// after the first online visit.
async function precache() {
	const cache = await caches.open(CACHE);
	const assets = new Set(EXTRA);
	for (const page of PAGES) {
		const res = await fetch(page, { cache: 'no-store' });
		if (!res.ok) continue;
		const html = await res.clone().text();
		await cache.put(page, res);
		for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0]);
	}
	await Promise.all(
		[...assets].map(async (url) => {
			try {
				const res = await fetch(url);
				if (res.ok) await cache.put(url, res);
			} catch {
				// one missing asset shouldn't block install; it gets cached on first use
			}
		}),
	);
}

self.addEventListener('install', (event) => {
	event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

	// Hashed build assets never change: cache first.
	if (url.pathname.startsWith('/_next/static/') || EXTRA.includes(url.pathname)) {
		event.respondWith(
			caches.match(req).then(
				(hit) =>
					hit ??
					fetch(req).then((res) => {
						if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
						return res;
					}),
			),
		);
		return;
	}

	// Pages: network first so updates show up, cached copy when offline.
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					if (res.ok && PAGES.includes(url.pathname)) caches.open(CACHE).then((c) => c.put(url.pathname, res.clone()));
					return res;
				})
				.catch(async () => (await caches.match(url.pathname)) ?? (await caches.match('/listen')) ?? Response.error()),
		);
		return;
	}

	// Anything else same-origin (RSC payloads, fonts): network, falling back to cache.
	event.respondWith(fetch(req).catch(async () => (await caches.match(req)) ?? Response.error()));
});
