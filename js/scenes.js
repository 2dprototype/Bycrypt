/*
 * Deterministic procedural pictures for the hotspot and tile puzzles.
 * A link cannot carry an image, so the picture is a scene id (param "img") that every device draws identically
 * from integer seeds. Scene ids 1..SCENE_COUNT are FROZEN - changing the drawing would break existing links.
 */
const SCENE_COUNT = 8

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
	const n = Math.min(SCENE_COUNT, Math.max(1, parseInt(id) || 1))
	const rnd = mulberry32(4000 + n * 7919)
	const ri = (lo, hi) => Math.round(lo + rnd() * (hi - lo))
	const hue = ri(0, 359)
	const S = 480
	let g = '<defs><linearGradient id="bg' + n + '" x1="0" y1="0" x2="1" y2="1">' +
		'<stop offset="0" stop-color="hsl(' + hue + ',55%,32%)"/><stop offset="1" stop-color="hsl(' + ((hue + 70) % 360) + ',60%,62%)"/></linearGradient></defs>' +
		'<rect width="' + S + '" height="' + S + '" fill="url(#bg' + n + ')"/>'
	const count = 26
	for (let i = 0; i < count; i++) {
		const kind = ri(0, 3)
		const h = (hue + ri(0, 5) * 60 + ri(0, 30)) % 360
		const col = "hsl(" + h + "," + ri(45, 90) + "%," + ri(35, 78) + "%)"
		const x = ri(10, S - 10), y = ri(10, S - 10), r = ri(22, 70)
		const op = (0.72 + ri(0, 25) / 100).toFixed(2)
		if (kind === 0) g += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '" opacity="' + op + '"/>'
		else if (kind === 1) g += '<rect x="' + (x - r) + '" y="' + (y - r) + '" width="' + (r * 2) + '" height="' + (ri(20, 70) * 2) + '" rx="' + ri(0, 14) + '" fill="' + col + '" opacity="' + op + '"/>'
		else if (kind === 2) g += '<polygon points="' + x + "," + (y - r) + " " + (x + r) + "," + (y + r) + " " + (x - r) + "," + (y + r) + '" fill="' + col + '" opacity="' + op + '"/>'
		else g += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r + '" ry="' + Math.round(r / 2) + '" transform="rotate(' + ri(0, 170) + " " + x + " " + y + ')" fill="' + col + '" opacity="' + op + '"/>'
	}
	// a few high-contrast landmarks so every region of the picture is distinguishable
	for (let i = 0; i < 6; i++) {
		const x = ri(30, S - 30), y = ri(30, S - 30)
		g += '<circle cx="' + x + '" cy="' + y + '" r="' + ri(5, 12) + '" fill="#fff" opacity="0.9"/><circle cx="' + x + '" cy="' + y + '" r="' + ri(2, 4) + '" fill="#111"/>'
	}
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + " " + S + '" width="' + size + '" height="' + size + '" preserveAspectRatio="none">' + g + "</svg>"
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
