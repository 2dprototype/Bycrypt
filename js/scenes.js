/*
 * Vector graphics for the hotspot and tile puzzles.
 * Uses QVG (QR Vector Graphics) format.
 */

const DEFAULT_QVG_SOURCE = `grid 100 100
bg #0d1b2a
f #1b263b
s #00a1f5
w 2
rr 10 10 80 80 8
f #415e7b
s -
rr 15 15 32 32 4
f #e0a96d
star 31 31 10 5 5 0
f #2a475e
rr 53 15 32 32 4
f #e63946
c 69 31 10
f #223a4e
rr 15 53 32 32 4
f #06d6a0
p 31 58 41 77 21 77
f #1a3344
rr 53 53 32 32 4
f #118ab2
ring 69 69 11 5
f #0d1b2a
s #ffd166
w 2
c 50 50 14
f #ffd166
s -
star 50 50 8 4 4 45`

const DEFAULT_QVG_PAYLOAD = "J2HU8CRML1NL$JJSQDAEFN2HVV4FR1N1YS9P*ZCT.SPT834M4:5ARRAF5..F1V3BN59J2K228HLHIO.PL9H0X91EN86N5SM1.S2:ZY-H1TMTHP2K*5U86V3AF231N5TQ02X75-J-ZT1CBM9B7NYG8A-85T8SJTAM*3CBBX034QN2A16.6WF8PZTB7N.J0"

function isQvgImg(id) {
	if (!id) return false
	const s = String(id).trim()
	return s === "default_qvg" || /^qvg:/i.test(s) || (s.length > 20 && /^(?:QVG:)?[0-9A-Z\-.$*:]+$/.test(s))
}

function qvgPayloadOf(id) {
	if (!id || id === "default_qvg" || !isQvgImg(id)) return DEFAULT_QVG_PAYLOAD
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
