/* Service worker: lets the whole app (creator and unlock page) work offline after the first visit. */
const CACHE = "bycrypt-v2"
const ASSETS = [
	"/", "/index.html", "/css/main.css", "/manifest.webmanifest", "/res/favicon.ico",
	"/lib/jquery.min.js", "/lib/clipboard.min.js", "/lib/crypto-js.min.js", "/lib/pako.min.js", "/lib/router.js", "/lib/FileSaver.min.js",
	"/lib/qrcode.min.js", "/lib/svg-inject.min.js", "/lib/patternlock/patternlock.js", "/lib/patternlock/patternlock.css",
	"/js/config.js", "/js/func.js", "/js/make.js", "/js/codes.js", "/js/crypto2.js", "/js/scan.js", "/js/icons.js", "/js/scenes.js",
	"/js/qrdraw.js", "/js/keys.js", "/js/Home.js", "/js/Decrypter.js", "/js/New.js", "/js/Batch.js", "/js/Inspect.js", "/js/main.js"
]
self.addEventListener("install", e => {
	e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()))
})
self.addEventListener("activate", e => {
	e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener("fetch", e => {
	const req = e.request
	if (req.method !== "GET") return
	const url = new URL(req.url)
	if (req.mode === "navigate") {      // every page is the single-page app; prefer fresh, fall back to the cached shell
		e.respondWith(fetch(req).catch(() => caches.match("/index.html")))
		return
	}
	if (url.origin !== location.origin && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) return
	e.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(hit => {
		const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); return r }).catch(() => hit)
		return hit || net
	})))
})
