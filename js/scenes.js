/*
 * Vector graphics for the hotspot and tile puzzles.
 * Uses QVG (QR Vector Graphics) format.
 */

const DEFAULT_QVG_SOURCE = `grid 200 200
f #ffe68c s #000 w 5
c 101 100 80
f #000 s #000 w 5
c 60 80 10
c 140 80 10
f #ffb8c8 s #000 w 5
c 70 110 8
c 130 110 8
f #000 s #000 w 5
d 70 140 q 30 30 60 0`

const DEFAULT_QVG_PAYLOAD = "KPE$J5X4BJC0L4ZN*$DAFH-4XETWO1891:VO391NM5$$4M-AR.08F22.KA$WK2AKC0F*I:4"

function isQvgImg(id) {
	if (!id) return false
	const s = String(id).trim()
	return s === "d" || /^qvg:/i.test(s) || (s.length > 20 && /^(?:QVG:)?[0-9A-Z\-.$*:]+$/.test(s))
}

function qvgPayloadOf(id) {
	if (!id || id === "d" || !isQvgImg(id)) return DEFAULT_QVG_PAYLOAD
	const s = String(id).trim()
	if (/^qvg:/i.test(s)) return s.slice(4).trim()
	return s
}

function mulberry32(seed) {
	let a = seed | 0
	return function () {
		a = (a + 0x6D2B79F5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function sceneSvg(id, size) {
	size = size || 480
	try {
		const pay = qvgPayloadOf(id)
		let svg = QVG.toSVG(pay)
		svg = svg.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
			let a = attrs.replace(/\bwidth="[^"]*"/gi, '').replace(/\bheight="[^"]*"/gi, '')
			return '<svg ' + a.trim() + ' width="' + size + '" height="' + size + '" preserveAspectRatio="none">'
		})
		return svg
	} catch (e) {
		console.warn("Failed to render QVG image:", e)
		try {
			return QVG.toSVG(DEFAULT_QVG_PAYLOAD)
		} catch (err) {
			return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '"><rect width="100" height="100" fill="#0d1b2a"/></svg>'
		}
	}
}

function sceneUri(id) {
	return "data:image/svg+xml;utf8," + encodeURIComponent(sceneSvg(id, 480))
}

/* Seeded Fisher-Yates permutation of 0..n-1 (the same starting arrangement on every device). */
function shuffleSeeded(n, seed) {
	const rnd = mulberry32(parseInt(seed) || 1)
	const a = []
	for (let i = 0; i < n; i++) a.push(i)
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1))
		const t = a[i]; a[i] = a[j]; a[j] = t
	}
	return a
}
