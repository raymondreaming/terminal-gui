// ── No-cache service worker ─────────────────────────────
// Keeps PWA/Dock functionality but caches nothing.
// All requests go straight to the network.

// On install: nuke any old caches and activate immediately
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) => Promise.all(names.map((n) => caches.delete(n))))
	);
	self.skipWaiting();
});

// On activate: claim clients immediately
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) => Promise.all(names.map((n) => caches.delete(n))))
	);
	self.clients.claim();
});

// Pass everything straight to network — never cache, never intercept
self.addEventListener("fetch", (event) => {
	event.respondWith(fetch(event.request));
});
