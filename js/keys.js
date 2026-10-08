/*
 * Key methods. Every method is a small widget that works in two modes:
 *   mode "create": the owner chooses the secret         (New.js)
 *   mode "unlock": the visitor reproduces the secret    (Decrypter.js)
 * and always reduces the secret to a canonical string (the "key string"):
 *   - Legacy mode feeds it to CryptoJS as the passphrase,
 *   - Enhanced mode feeds it to PBKDF2.
 * Because a puzzle's canonical string is plain text ("star-key-moon-heart"), it can also be typed into the
 * ordinary password box of an older Bycrypt.
 *
 * instance API: { el, collect(): Promise<string[]> (candidate key strings, best first), bits(), reset(),
 *                 getParams() (public params saved in the link), mark?(ok) }
 * ctx: { mode, params, onChange(), submit() }
 */

/* ---------- small DOM helpers ---------- */
function h(tag, attrs) {
	const e = document.createElement(tag)
	for (const key in (attrs || {})) {
		const v = attrs[key]
		if (v === false || v == null) continue
		if (key === "class") e.className = v
		else if (key.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(key.slice(2), v)
		else e.setAttribute(key, v === true ? "" : v)
	}
	for (const c of Array.prototype.slice.call(arguments, 2).flat(Infinity)) {
		if (c == null || c === false) continue
		e.append(c.nodeType ? c : document.createTextNode(String(c)))
	}
	return e
}
function iconEl(slug, size, cls) {
	const s = document.createElement("span")
	s.className = "icw"
	s.innerHTML = iconSvg(slug, size || 18, cls)
	return s
}
function btn(label, icon, onclick, cls) {
	const b = h("button", { type: "button", class: "btn " + (cls || ""), onclick })
	if (icon) b.append(iconEl(icon, 16))
	if (label) b.append(h("span", {}, label))
	return b
}
function setBtnLabel(b, label, icon) {
	b.innerHTML = ""
	if (icon) b.append(iconEl(icon, 16))
	b.append(h("span", {}, label))
}
const log2 = Math.log2
function log2fact(n) { let s = 0; for (let i = 2; i <= n; i++) s += log2(i); return s }
function log2perm(n, k) { let s = 0; for (let i = 0; i < k; i++) s += log2(Math.max(1, n - i)); return s }

function estimateTextBits(s) {
	if (!s) return 0
	let pool = 0
	if (/[a-z]/.test(s)) pool += 26
	if (/[A-Z]/.test(s)) pool += 26
	if (/[0-9]/.test(s)) pool += 10
	if (/[^a-zA-Z0-9]/.test(s)) pool += 33
	const eff = Math.min(s.length, new Set(s).size * 2)        // repeated characters add little
	return Math.round(eff * log2(Math.max(pool, 2)) * 0.9)
}
function strengthInfo(bits) {
	if (bits < 28) return { label: "Very weak", cls: "s0" }
	if (bits < 40) return { label: "Weak", cls: "s1" }
	if (bits < 56) return { label: "Fair", cls: "s2" }
	if (bits < 80) return { label: "Good", cls: "s3" }
	return { label: "Strong", cls: "s4" }
}

async function sha256Bytes(input) {
	const data = typeof input === "string" ? new TextEncoder().encode(input) : input
	return new Uint8Array(await crypto.subtle.digest("SHA-256", data))
}
function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("") }

/* ---------- registry ---------- */
const KeyMethods = {}
const KEY_GROUPS = [["classic", "Classic (original)"], ["puzzle", "Puzzle and game"], ["advanced", "Advanced"]]
function defKey(def) { KeyMethods[def.id] = def }
function buildKeyWidget(id, ctx) { return KeyMethods[id].build(ctx) }

const MAX_CANDIDATES = 64
function limitedProduct(lists) {
	let acc = [[]]
	for (const list of lists) {
		const next = []
		for (const a of acc) for (const x of list) { next.push(a.concat([x])); if (next.length >= MAX_CANDIDATES * 8) break }
		acc = next
	}
	return acc.slice(0, MAX_CANDIDATES)
}

/* =====================================================================================================
   CLASSIC (legacy codes 0-4)
   ===================================================================================================== */
defKey({
	id: "alphanumeric", code: "0", group: "classic", icon: "type", label: "Alphanumeric", decoy: true,
	desc: "A password of letters, numbers and symbols.",
	build(ctx) {
		const create = ctx.mode === "create"
		const input = h("input", { type: create ? "text" : "password", class: "kw-text", placeholder: "Password", autocomplete: "off", spellcheck: "false", "aria-label": "Password" })
		input.addEventListener("input", () => ctx.onChange())
		input.addEventListener("keydown", e => { if (e.key === "Enter" && !create) ctx.submit() })
		const root = h("div", { class: "kw kw-row" }, input)
		if (create) root.append(btn("Generate", "refresh", () => { input.value = secureRandomString(16); ctx.onChange() }))
		else {
			const eye = btn("", "eye", () => { input.type = input.type === "password" ? "text" : "password" }, "icon-only")
			eye.setAttribute("aria-label", "Show or hide password")
			root.append(eye)
		}
		return {
			el: root, focus() { input.focus() },
			async collect() { if (!input.value) throw new Error("Enter the password."); return [input.value] },
			bits: () => estimateTextBits(input.value), reset() { input.value = "" }, getParams: () => ({})
		}
	}
})

defKey({
	id: "pin", code: "1", group: "classic", icon: "hash", label: "PIN", decoy: true,
	desc: "Digits only. Short PINs are quick to guess, use 6 or more.",
	build(ctx) {
		const create = ctx.mode === "create"
		const input = h("input", { type: "text", inputmode: "numeric", class: "kw-text", placeholder: "PIN", autocomplete: "off", "aria-label": "PIN" })
		input.addEventListener("input", () => { if (create) input.value = input.value.replace(/\D+/g, ""); ctx.onChange() })
		input.addEventListener("keydown", e => { if (e.key === "Enter" && !create) ctx.submit() })
		return {
			el: h("div", { class: "kw kw-row" }, input), focus() { input.focus() },
			async collect() { if (!input.value) throw new Error("Enter the PIN."); return [input.value] },
			bits: () => Math.round(input.value.replace(/\D/g, "").length * 3.32), reset() { input.value = "" }, getParams: () => ({})
		}
	}
})

function patternLockSvg() {
	let dots = ""
	for (const y of [20, 50, 80]) for (const x of [20, 50, 80]) dots += '<circle cx="' + x + '" cy="' + y + '" r="2"/>'
	return '<svg class="patternlock" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Pattern lock"><g class="lock-actives"></g><g class="lock-lines"></g><g class="lock-dots">' + dots + "</g></svg>"
}

defKey({
	id: "pattern", code: "2", group: "classic", icon: "grid-dots", label: "Pattern (3x3)", decoy: true,
	desc: "Draw a pattern across nine dots. Original lock-screen style.",
	build(ctx) {
		const create = ctx.mode === "create"
		const box = h("div", { class: "kw kw-pattern" })
		box.innerHTML = patternLockSvg()
		const status = h("p", { class: "hint" }, create ? "Draw your pattern." : "Draw the pattern to unlock.")
		box.append(status)
		let key = null, len = 0, pl
		pl = new PatternLock(box.querySelector("svg"), {
			onPattern(p) {
				if (Number.isNaN(p)) return
				key = CryptoJS.MD5(p.toString()).toString()       // original key derivation, unchanged
				len = String(p).length
				status.textContent = create ? len + " dots captured. Draw again to change it." : ""
				ctx.onChange()
				if (!create) ctx.submit()
			}
		})
		return {
			el: box, pl,
			async collect() { if (!key) throw new Error("Draw the pattern first."); return [key] },
			bits: () => key ? Math.round(log2perm(9, len)) : 0,
			reset() { key = null; len = 0; pl.clear() }, getParams: () => ({}),
			mark(ok) { ok ? pl.success() : pl.error() }
		}
	}
})

defKey({
	id: "location", code: "3", group: "classic", icon: "map-pin", label: "Location (~100 m)", decoy: false,
	desc: "Opens only near a place. Tolerant of GPS drift. Weak against anyone who knows the place.",
	build(ctx) {
		const create = ctx.mode === "create"
		let hash = null, map = null, layer = null
		const status = h("p", { class: "hint" }, create ? "Stand at the place, enter coordinates, or click the map." : "Allow location access and press Unlock.")
		const root = h("div", { class: "kw" }, status)
		const getPos = () => new Promise((res, rej) => {
			if (!navigator.geolocation) return rej(new Error("Geolocation is not supported on this device."))
			navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej(new Error("Location error: " + e.message)), { enableHighAccuracy: true, timeout: 25000 })
		})
		if (create) {
			const lat = h("input", { type: "number", step: "any", placeholder: "Latitude", "aria-label": "Latitude", class: "kw-num" })
			const lon = h("input", { type: "number", step: "any", placeholder: "Longitude", "aria-label": "Longitude", class: "kw-num" })
			const mapDiv = h("div", { class: "map-box", style: "display:none" })
			const setPoint = (la, lo, draw) => {
				if (!isFinite(la) || !isFinite(lo)) throw new Error("Enter a valid latitude and longitude.")
				hash = hashWithinRange(la, lo, 100)
				lat.value = (+la).toFixed(6); lon.value = (+lo).toFixed(6)
				status.textContent = "Location set (about 100 m area). Key hash: " + hash
				if (draw) showMap(la, lo)
				ctx.onChange()
			}
			const showMap = (la, lo) => {
				if (typeof ol === "undefined") return
				mapDiv.style.display = "block"
				const p = ol.proj.fromLonLat([lo, la])
				const circle = new ol.Feature(new ol.geom.Circle(p, 50)); circle.setStyle(new ol.style.Style({ stroke: new ol.style.Stroke({ color: "#00a1f5", width: 1 }), fill: new ol.style.Fill({ color: "rgba(0,161,245,0.25)" }) }))
				const dot = new ol.Feature(new ol.geom.Point(p)); dot.setStyle(new ol.style.Style({ image: new ol.style.Circle({ radius: 4, fill: new ol.style.Fill({ color: "#00a1f5" }), stroke: new ol.style.Stroke({ color: "#fff", width: 1 }) }) }))
				layer = new ol.layer.Vector({ source: new ol.source.Vector({ features: [circle, dot] }) })
				if (!map) {
					map = new ol.Map({ target: mapDiv, layers: [new ol.layer.Tile({ source: new ol.source.OSM({ attributions: [] }) }), layer], view: new ol.View({ center: p, zoom: 17 }) })
					map.on("click", ev => { const ll = ol.proj.toLonLat(ev.coordinate); setPoint(ll[1], ll[0], true) })
				} else { map.getView().setCenter(p); map.getView().setZoom(17); map.getLayers().setAt(1, layer) }
			}
			root.append(
				h("div", { class: "kw-row" }, btn("Use my location", "map-pin", async () => { try { const c = await getPos(); setPoint(c.latitude, c.longitude, true) } catch (e) { status.textContent = e.message } })),
				h("div", { class: "kw-row" }, lat, lon, btn("Set", "check", () => { try { setPoint(parseFloat(lat.value), parseFloat(lon.value), true) } catch (e) { status.textContent = e.message } })),
				mapDiv)
		}
		return {
			el: root,
			async collect() {
				if (create) { if (!hash) throw new Error("Set the location first."); return [hash] }
				const c = await getPos()
				return locationCandidates(c.latitude, c.longitude, 100)
			},
			bits: () => hash ? 20 : 0, reset() { hash = null }, getParams: () => ({})
		}
	}
})

defKey({
	id: "fingerprint", code: "4", group: "classic", icon: "fingerprint", label: "Fingerprint (this device)", decoy: false,
	desc: "Platform authenticator (WebAuthn). Only opens on this browser and device. See Passkey (PRF) for a portable option.",
	build(ctx) {
		const create = ctx.mode === "create"
		let key = null
		const status = h("p", { class: "hint" }, create ? "Scan once to register this device and capture the key." : "Verify with your fingerprint / device unlock.")
		const root = h("div", { class: "kw" }, status)
		if (create) root.append(h("div", { class: "kw-row" }, btn("Scan fingerprint", "fingerprint", async () => {
			try { key = await getFingerprintKeyHash(); status.textContent = "Fingerprint key captured."; ctx.onChange() }
			catch (e) { status.textContent = "Fingerprint failed: " + e.message }
		})))
		return {
			el: root,
			async collect() {
				if (create) { if (!key) throw new Error("Scan the fingerprint first."); return [key] }
				try { const k = await getFingerprintKeys(); return [k.md5, k.sha256] }      // old links may use either hash
				catch (e) { throw new Error("Fingerprint failed: " + e.message) }
			},
			bits: () => key ? 100 : 0, reset() { key = null }, getParams: () => ({})
		}
	}
})

/* =====================================================================================================
   PUZZLE AND GAME
   ===================================================================================================== */
defKey({
	id: "icons", code: "5", group: "puzzle", icon: "star", label: "Icon sequence", decoy: true,
	desc: "Pick a secret sequence of icons (at least 4) from a palette of 64. Hidden while unlocking.",
	build(ctx) {
		const create = ctx.mode === "create"
		let seq = [], masked = !create
		const chips = h("div", { class: "chips", "aria-live": "polite" })
		const render = () => {
			chips.innerHTML = ""
			seq.forEach(s => { const c = h("span", { class: "chip" }); if (masked) c.append(h("span", { class: "dotmask" })); else c.innerHTML = iconSvg(s, 18); chips.append(c) })
			if (!seq.length) chips.append(h("span", { class: "hint" }, "Nothing selected yet"))
		}
		const grid = h("div", { class: "pal", role: "group", "aria-label": "Icon palette" })
		PALETTE_V1.forEach(slug => {
			const b = h("button", { type: "button", class: "pal-btn", title: slug, "aria-label": slug, "data-slug": slug, onclick: () => { seq.push(slug); render(); ctx.onChange() } })
			b.innerHTML = iconSvg(slug, 22)
			grid.append(b)
		})
		const eye = btn(masked ? "Show" : "Hide", masked ? "eye" : "eye-off", () => { masked = !masked; setBtnLabel(eye, masked ? "Show" : "Hide", masked ? "eye" : "eye-off"); render() })
		const root = h("div", { class: "kw" }, chips,
			h("div", { class: "kw-row" }, btn("Undo", "backspace", () => { seq.pop(); render(); ctx.onChange() }), btn("Clear", "x", () => { seq = []; render(); ctx.onChange() }), eye), grid)
		render()
		return {
			el: root,
			async collect() {
				if (!seq.length) throw new Error("Choose the icons first.")
				if (create && seq.length < 4) throw new Error("Choose at least 4 icons.")
				return [seq.join("-")]
			},
			bits: () => Math.round(seq.length * 6), reset() { seq = []; render() }, getParams: () => ({})
		}
	}
})

/* Hotspots: click points on a picture; each click snaps to a grid cell. At unlock time, clicks that land
   close to a cell edge also try the neighbouring cell, so a slightly different tap still works. */
defKey({
	id: "hotspots", code: "6", group: "puzzle", icon: "crosshair", label: "Picture hotspots", decoy: true,
	desc: "Tap 3 or more secret spots on a picture. Taps snap to a grid and tolerate small misses.",
	build(ctx) {
		const create = ctx.mode === "create"
		const P = { img: String(ctx.params.img || "default_qvg"), g: parseInt(ctx.params.g) || 8 }
		let pts = [], gridOn = false
		const scene = h("div", { class: "hs-scene" })
		const over = h("div", { class: "hs-over", role: "img", "aria-label": "Picture. Tap your secret spots." })
		const stage = h("div", { class: "hs-stage" }, scene, over)
		const drawScene = () => { scene.innerHTML = sceneSvg(P.img, 480); const s = scene.firstChild; if (s) { s.removeAttribute("width"); s.removeAttribute("height") } }
		const drawOver = () => {
			over.innerHTML = ""
			over.classList.toggle("grid-on", gridOn)
			over.style.setProperty("--g", P.g)
			pts.forEach((p, i) => over.append(h("span", { class: "hs-mark", style: "left:" + (p[0] * 100) + "%;top:" + (p[1] * 100) + "%" }, String(i + 1))))
		}
		over.addEventListener("click", e => {
			if (pts.length >= 10) return
			const r = over.getBoundingClientRect()
			pts.push([Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(0.9999, Math.max(0, (e.clientY - r.top) / r.height))])
			drawOver(); ctx.onChange()
		})
		const root = h("div", { class: "kw" })
		if (create) {
			const gridSel = h("select", { "aria-label": "Grid size" })
			for (const g of [6, 8, 10, 12]) gridSel.append(h("option", { value: g, selected: g === P.g }, g + " x " + g + " grid"))
			const show = h("input", { type: "checkbox", id: "hs-grid-" + Math.random().toString(36).slice(2) })
			show.addEventListener("change", () => { gridOn = show.checked; drawOver() })
			gridSel.addEventListener("change", () => { P.g = parseInt(gridSel.value); pts = []; drawOver(); ctx.onChange() })
			const qvgBtn = btn("Change Image", "palette", () => {
				openQvgModal({
					currentPayload: P.img,
					onApply(newPayload) {
						P.img = "qvg:" + newPayload
						pts = []
						drawScene()
						drawOver()
						ctx.onChange()
					}
				})
			})
			root.append(h("div", { class: "kw-row" }, qvgBtn, gridSel, h("label", { class: "inline" }, show, "Show grid")))
		}
		root.append(stage, h("div", { class: "kw-row" }, btn("Undo", "backspace", () => { pts.pop(); drawOver(); ctx.onChange() }), btn("Clear", "x", () => { pts = []; drawOver(); ctx.onChange() })))
		drawScene(); drawOver()
		const cellOf = (x, y) => Math.min(P.g - 1, Math.floor(y * P.g)) * P.g + Math.min(P.g - 1, Math.floor(x * P.g))
		const canon = cells => "h" + P.g + ":" + cells.join(".")
		return {
			el: root,
			async collect() {
				if (!pts.length) throw new Error("Tap your secret spots on the picture.")
				if (create && pts.length < 3) throw new Error("Choose at least 3 spots.")
				if (create) return [canon(pts.map(p => cellOf(p[0], p[1])))]
				// candidate cells per tap: own cell first, plus the neighbour(s) when the tap was near an edge
				const g = P.g, T = 0.2
				const options = pts.map(p => {
					const c = Math.min(g - 1, Math.floor(p[0] * g)), r = Math.min(g - 1, Math.floor(p[1] * g))
					const fx = p[0] * g - c, fy = p[1] * g - r
					const dc = fx < T && c > 0 ? -1 : fx > 1 - T && c < g - 1 ? 1 : 0
					const dr = fy < T && r > 0 ? -1 : fy > 1 - T && r < g - 1 ? 1 : 0
					const out = [r * g + c]
					if (dc) out.push(r * g + c + dc)
					if (dr) out.push((r + dr) * g + c)
					if (dc && dr) out.push((r + dr) * g + c + dc)
					return out
				})
				const combos = limitedProduct(options)
				combos.sort((a, b) => a.filter((v, i) => v !== options[i][0]).length - b.filter((v, i) => v !== options[i][0]).length)
				return combos.map(canon)
			},
			bits: () => Math.round(pts.length * log2(P.g * P.g)), reset() { pts = []; drawOver() },
			getParams: () => ({ img: P.img, g: P.g })
		}
	}
})

defKey({
	id: "gridpattern", code: "7", group: "puzzle", icon: "grid-dots", label: "Grid pattern (4x4 to 6x6)", decoy: true,
	desc: "Like the pattern lock, but on a bigger grid: far more combinations.",
	build(ctx) {
		const create = ctx.mode === "create"
		const P = { n: Math.min(6, Math.max(4, parseInt(ctx.params.n) || 5)) }
		let path = [], drawing = false
		const NS = "http://www.w3.org/2000/svg"
		const svg = document.createElementNS(NS, "svg")
		svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("class", "gp-svg"); svg.setAttribute("aria-label", "Grid pattern")
		const pos = i => { const n = P.n, m = 12, step = (100 - 2 * m) / (n - 1); return [m + (i % n) * step, m + Math.floor(i / n) * step] }
		const render = () => {
			svg.innerHTML = ""
			const line = document.createElementNS(NS, "polyline")
			line.setAttribute("points", path.map(i => pos(i).join(",")).join(" ")); line.setAttribute("class", "gp-line"); svg.append(line)
			for (let i = 0; i < P.n * P.n; i++) {
				const c = document.createElementNS(NS, "circle"), p = pos(i)
				c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", path.includes(i) ? 3.4 : 2.2)
				c.setAttribute("class", "gp-dot" + (path.includes(i) ? " on" : "")); svg.append(c)
			}
		}
		const toSvg = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100] }
		const hit = e => {
			const [x, y] = toSvg(e), R = (100 - 24) / (P.n - 1) * 0.38
			for (let i = 0; i < P.n * P.n; i++) { const p = pos(i); if (!path.includes(i) && Math.hypot(p[0] - x, p[1] - y) <= R) { path.push(i); render(); break } }
		}
		svg.addEventListener("pointerdown", e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); path = []; drawing = true; hit(e); render() })
		svg.addEventListener("pointermove", e => { if (drawing) hit(e) })
		const end = () => { if (drawing) { drawing = false; ctx.onChange() } }
		svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end)
		const root = h("div", { class: "kw kw-gridpattern" })
		if (create) {
			const sel = h("select", { "aria-label": "Grid size" })
			for (const n of [4, 5, 6]) sel.append(h("option", { value: n, selected: n === P.n }, n + " x " + n))
			sel.addEventListener("change", () => { P.n = parseInt(sel.value); path = []; render(); ctx.onChange() })
			root.append(h("div", { class: "kw-row" }, h("span", {}, "Grid"), sel))
		}
		root.append(svg, h("div", { class: "kw-row" }, btn("Clear", "x", () => { path = []; render(); ctx.onChange() })))
		render()
		return {
			el: root,
			async collect() {
				if (!path.length) throw new Error("Draw the pattern first.")
				// if (create && path.length < 4) throw new Error("Connect at least 4 dots.")
				return ["p" + P.n + ":" + path.join(".")]
			},
			bits: () => Math.round(log2perm(P.n * P.n, path.length)), reset() { path = []; render() }, getParams: () => ({ n: P.n })
		}
	}
})

defKey({
	id: "tiles", code: "8", group: "puzzle", icon: "grid", label: "Secret tile order", decoy: true,
	desc: "A picture is cut into tiles and shuffled. Arrange them into your secret order (swap by tapping two tiles).",
	build(ctx) {
		const create = ctx.mode === "create"
		const P = { img: String(ctx.params.img || "default_qvg"), k: parseInt(ctx.params.k) === 4 ? 4 : 3, s: String(ctx.params.s || "0") }
		let start, arr, sel = null
		const board = h("div", { class: "tiles", role: "group", "aria-label": "Tile board" })
		let uri = sceneUri(P.img)
		const reset = () => {
			const n = P.k * P.k
			start = (P.s === "0" || !P.s) ? Array.from({ length: n }, (_, i) => i) : shuffleSeeded(n, P.s)
			arr = start.slice()
			sel = null
			render()
		}
		function render() {
			board.innerHTML = ""
			board.style.setProperty("--k", P.k)
			arr.forEach((t, pos) => {
				const b = h("button", { type: "button", class: "tile" + (sel === pos ? " sel" : ""), "aria-label": "Tile at position " + (pos + 1), "data-tile": t, "data-pos": pos })
				const row = Math.floor(t / P.k), col = t % P.k
				b.style.backgroundImage = 'url("' + uri + '")'
				b.style.backgroundSize = P.k * 100 + "% " + P.k * 100 + "%"
				b.style.backgroundPosition = (col * 100 / (P.k - 1)) + "% " + (row * 100 / (P.k - 1)) + "%"
				b.addEventListener("click", () => {
					if (sel === null) sel = pos
					else { if (sel !== pos) { const x = arr[sel]; arr[sel] = arr[pos]; arr[pos] = x; ctx.onChange() } sel = null }
					render()
				})
				board.append(b)
			})
		}
		const root = h("div", { class: "kw" })
		if (create) {
			const kSel = h("select", { "aria-label": "Board size" })
			for (const k of [3, 4]) kSel.append(h("option", { value: k, selected: k === P.k }, k + " x " + k + " tiles"))
			kSel.addEventListener("change", () => { P.k = parseInt(kSel.value); reset(); ctx.onChange() })
			const qvgBtn = btn("Change Image", "palette", () => {
				openQvgModal({
					currentPayload: P.img,
					onApply(newPayload) {
						P.img = "qvg:" + newPayload
						uri = sceneUri(P.img)
						reset()
						ctx.onChange()
					}
				})
			})
			const shuffleBtn = btn("Shuffle", "refresh", () => {
				P.s = String(1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 999999))
				reset()
				ctx.onChange()
			})
			const unshuffleBtn = btn("Unshuffle", "x", () => {
				P.s = "0"
				reset()
				ctx.onChange()
			})
			root.append(h("div", { class: "kw-row" }, qvgBtn, kSel, shuffleBtn, unshuffleBtn))
		}
		root.append(board, h("div", { class: "kw-row" }, btn("Reset", "refresh", () => { reset(); ctx.onChange() })))
		reset()
		const moved = () => arr.filter((t, i) => t !== start[i]).length
		return {
			el: root,
			async collect() {
				return ["t" + P.k + ":" + arr.join(".")]
			},
			bits: () => Math.round(log2fact(P.k * P.k) * Math.max(1, moved()) / (P.k * P.k)), reset, getParams: () => ({ img: P.img, k: P.k, s: P.s })
		}
	}
})

const MELODY_KEYS = [
	{ n: "C4", s: 0, w: true }, { n: "D4", s: 2, w: true }, { n: "E4", s: 4, w: true }, { n: "F4", s: 5, w: true },
	{ n: "G4", s: 7, w: true }, { n: "A4", s: 9, w: true }, { n: "B4", s: 11, w: true }, { n: "C5", s: 12, w: true },
	{ n: "C#4", s: 1, after: 0 }, { n: "D#4", s: 3, after: 1 }, { n: "F#4", s: 6, after: 3 }, { n: "G#4", s: 8, after: 4 }, { n: "A#4", s: 10, after: 5 }
]

defKey({
	id: "melody", code: "9", group: "puzzle", icon: "music", label: "Melody", decoy: true,
	desc: "Play a short melody (at least 5 notes) on a piano keyboard. Turn the sound off in public.",
	build(ctx) {
		const create = ctx.mode === "create"
		let seq = [], masked = !create, sound = create, ac = null
		const beep = semi => {
			if (!sound) return
			try {
				ac = ac || new (window.AudioContext || window.webkitAudioContext)()
				const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime
				o.type = "triangle"; o.frequency.value = 261.6256 * Math.pow(2, semi / 12)
				g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
				o.connect(g); g.connect(ac.destination); o.start(); o.stop(t + 0.42)
			} catch (e) {}
		}
		const chips = h("div", { class: "chips", "aria-live": "polite" })
		const render = () => {
			chips.innerHTML = ""
			seq.forEach(n => chips.append(h("span", { class: "chip note" }, masked ? h("span", { class: "dotmask" }) : n)))
			if (!seq.length) chips.append(h("span", { class: "hint" }, "No notes yet"))
		}
		const piano = h("div", { class: "piano", role: "group", "aria-label": "Piano keyboard" })
		MELODY_KEYS.forEach(k => {
			const b = h("button", { type: "button", class: k.w ? "pk white" : "pk black", "data-note": k.n, "aria-label": k.n, title: k.n })
			if (!k.w) b.style.left = "calc(" + ((k.after + 1) / 8 * 100) + "% - 3.6%)"
			if (k.w) b.append(h("span", { class: "pk-name" }, k.n))
			b.addEventListener("click", () => { seq.push(k.n); beep(k.s); render(); ctx.onChange() })
			piano.append(b)
		})
		const eye = btn(masked ? "Show" : "Hide", masked ? "eye" : "eye-off", () => { masked = !masked; setBtnLabel(eye, masked ? "Show" : "Hide", masked ? "eye" : "eye-off"); render() })
		const snd = btn(sound ? "Sound on" : "Sound off", sound ? "volume-2" : "volume-x", () => { sound = !sound; setBtnLabel(snd, sound ? "Sound on" : "Sound off", sound ? "volume-2" : "volume-x") })
		const root = h("div", { class: "kw" }, chips, piano,
			h("div", { class: "kw-row" }, btn("Undo", "backspace", () => { seq.pop(); render(); ctx.onChange() }), btn("Clear", "x", () => { seq = []; render(); ctx.onChange() }), eye, snd))
		render()
		return {
			el: root,
			async collect() {
				if (!seq.length) throw new Error("Play the melody first.")
				if (create && seq.length < 5) throw new Error("Play at least 5 notes.")
				return [seq.join("-")]
			},
			bits: () => Math.round(seq.length * log2(13)), reset() { seq = []; render() }, getParams: () => ({})
		}
	}
})

defKey({
	id: "rhythm", code: "a", group: "puzzle", icon: "activity", label: "Tap rhythm", decoy: true,
	desc: "Tap a secret rhythm: short or long presses, short or long pauses (at least 8 taps). Easy to mistype; best combined with another method.",
	build(ctx) {
		const create = ctx.mode === "create"
		const PRESS_LONG = 250, GAP_LONG = 500
		let toks = [], downAt = 0, lastUp = 0
		const strip = h("div", { class: "rhythm-strip", "aria-live": "polite" })
		const pad = h("button", { type: "button", class: "rhythm-pad", "aria-label": "Tap pad" }, "Tap here")
		const render = () => {
			strip.innerHTML = ""
			toks.forEach(t => {
				const gap = t.length > 1 ? t[0] : null, press = t[t.length - 1]
				if (gap) strip.append(h("span", { class: "rg " + (gap === "_" ? "long" : "short") }))
				strip.append(h("span", { class: "rp " + (press === "L" ? "long" : "short") }))
			})
			if (!toks.length) strip.append(h("span", { class: "hint" }, "Tap the pad: a quick tap is short, hold for long."))
		}
		const down = () => { if (!downAt) { downAt = performance.now(); pad.classList.add("down") } }
		const up = () => {
			if (!downAt) return
			const now = performance.now()
			const press = now - downAt < PRESS_LONG ? "S" : "L"
			const gap = toks.length ? ((downAt - lastUp) < GAP_LONG ? "." : "_") : ""
			toks.push(gap + press); downAt = 0; lastUp = now; pad.classList.remove("down")
			render(); ctx.onChange()
		}
		pad.addEventListener("pointerdown", e => { e.preventDefault(); down() })
		pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", up); pad.addEventListener("pointerleave", up)
		pad.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); down() } })
		pad.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); up() } })
		const root = h("div", { class: "kw" }, strip, pad, h("p", { class: "hint" }, "Short press under 0.25 s, short pause under 0.5 s."),
			h("div", { class: "kw-row" }, btn("Undo", "backspace", () => { toks.pop(); render(); ctx.onChange() }), btn("Clear", "x", () => { toks = []; render(); ctx.onChange() })))
		render()
		const api = {
			el: root,
			async collect() {
				if (!toks.length) throw new Error("Tap the rhythm first.")
				if (create && toks.length < 8) throw new Error("Tap at least 8 times.")
				return [toks.join("")]
			},
			bits: () => Math.max(0, toks.length * 2 - 1), reset() { toks = []; render() }, getParams: () => ({}),
			_inject(str) { toks = str.match(/[._]?[SL]/g) || []; render(); ctx.onChange() }     // used by tests / assistive tools
		}
		return api
	}
})

function normalizeAnswer(s) {
	return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim()
}

defKey({
	id: "riddle", code: "b", group: "puzzle", icon: "help-circle", label: "Riddle / questions", decoy: true,
	desc: "One to three questions. The questions are visible in the link, the answers are the key (ignoring case, accents and punctuation). Answers are guessable: combine with another method.",
	build(ctx) {
		const create = ctx.mode === "create"
		const rows = []
		const root = h("div", { class: "kw" })
		for (let i = 0; i < 3; i++) {
			const qText = ctx.params["q" + i]
			if (!create && !qText) continue
			const q = create ? h("input", { type: "text", class: "kw-text", placeholder: "Question " + (i + 1) + (i ? " (optional)" : ""), "aria-label": "Question " + (i + 1) }) : h("p", { class: "riddle-q" }, qText)
			const a = h("input", { type: create ? "text" : "password", class: "kw-text", placeholder: "Answer", autocomplete: "off", "aria-label": "Answer " + (i + 1) })
			a.addEventListener("input", () => ctx.onChange()); if (create) q.addEventListener("input", () => ctx.onChange())
			a.addEventListener("keydown", e => { if (e.key === "Enter" && !create) ctx.submit() })
			rows.push({ q, a, qText }); root.append(h("div", { class: "riddle-row" }, q, a))
		}
		const filled = () => rows.filter(r => normalizeAnswer(r.a.value) && (!create || r.q.value.trim()))
		return {
			el: root,
			async collect() {
				const f = filled()
				if (!f.length) throw new Error(create ? "Add at least one question with its answer." : "Answer the question(s).")
				if (!create && f.length !== rows.length) throw new Error("Answer every question.")
				if (create && rows.some(r => (r.q.value.trim() && !normalizeAnswer(r.a.value)) || (!r.q.value.trim() && normalizeAnswer(r.a.value)))) throw new Error("Each question needs an answer, and each answer a question.")
				return [f.map(r => normalizeAnswer(r.a.value)).join("|")]
			},
			bits: () => filled().length * 12, reset() { rows.forEach(r => { r.a.value = "" }) },
			getParams() { const o = {}; if (create) { let n = 0; rows.forEach(r => { if (r.q.value.trim() && normalizeAnswer(r.a.value)) o["q" + n++] = r.q.value.trim() }) } else rows.forEach((r, i) => { o["q" + i] = r.qText }); return o }
		}
	}
})

defKey({
	id: "dial", code: "c", group: "puzzle", icon: "target", label: "Dial combination lock", decoy: true,
	desc: "Spin digit wheels like a bike lock. The key is the number itself, so it also works as a PIN.",
	build(ctx) {
		const create = ctx.mode === "create"
		const P = { w: Math.min(8, Math.max(3, parseInt(ctx.params.w) || 6)) }
		let digits = Array(P.w).fill(0)
		const wheels = h("div", { class: "dials" })
		const render = () => {
			wheels.innerHTML = ""
			digits.forEach((d, i) => {
				const up = btn("", "chevron-up", () => { digits[i] = (digits[i] + 1) % 10; render(); ctx.onChange() }, "icon-only"); up.setAttribute("aria-label", "Increase digit " + (i + 1))
				const dn = btn("", "chevron-down", () => { digits[i] = (digits[i] + 9) % 10; render(); ctx.onChange() }, "icon-only"); dn.setAttribute("aria-label", "Decrease digit " + (i + 1))
				wheels.append(h("div", { class: "dial" }, up, h("div", { class: "dial-d", "data-i": i }, String(d)), dn))
			})
		}
		const root = h("div", { class: "kw" })
		if (create) {
			const sel = h("select", { "aria-label": "Number of wheels" })
			for (let w = 3; w <= 8; w++) sel.append(h("option", { value: w, selected: w === P.w }, w + " wheels"))
			sel.addEventListener("change", () => { P.w = parseInt(sel.value); digits = Array(P.w).fill(0); render(); ctx.onChange() })
			root.append(h("div", { class: "kw-row" }, sel))
		}
		root.append(wheels)
		render()
		return {
			el: root,
			async collect() { return [digits.join("")] },
			bits: () => Math.round(P.w * 3.32), reset() { digits = Array(P.w).fill(0); render() }, getParams: () => ({ w: P.w })
		}
	}
})

/* =====================================================================================================
   ADVANCED
   ===================================================================================================== */
defKey({
	id: "composite", code: "d", group: "advanced", icon: "layers", label: "Composite (2-3 methods)", decoy: true, composable: false,
	desc: "Combine several methods. All of them are needed, and their strengths add up. Best protection.",
	build(ctx) {
		const create = ctx.mode === "create"
		const eligible = Object.values(KeyMethods).filter(m => m.composable !== false && m.id !== "composite")
		let members = []                     // [{def, inst, box}]
		const area = h("div", { class: "composite-area" })
		const root = h("div", { class: "kw" })
		const subCtx = (def, i, params) => ({ mode: ctx.mode, params, onChange: ctx.onChange, submit: ctx.submit })
		const mount = () => {
			area.innerHTML = ""
			members.forEach(m => area.append(h("fieldset", { class: "sub" }, h("legend", {}, iconEl(m.def.icon, 16), " ", m.def.label), m.inst.el)))
		}
		if (create) {
			const picks = h("div", { class: "picks" })
			eligible.forEach(def => {
				const cb = h("input", { type: "checkbox", "data-m": def.id, id: "cm-" + def.id })
				cb.addEventListener("change", () => {
					const chosen = eligible.filter(d => root.querySelector('input[data-m="' + d.id + '"]').checked)
					if (chosen.length > 3) { cb.checked = false; return }
					members = chosen.map(d => members.find(m => m.def.id === d.id) || { def: d, inst: d.build(subCtx(d, 0, {})) })
					mount(); ctx.onChange()
				})
				picks.append(h("label", { class: "pick" }, cb, iconEl(def.icon, 16), def.label))
			})
			root.append(h("p", { class: "hint" }, "Choose 2 or 3 methods:"), picks)
		} else {
			const codes = String(ctx.params.cm || "").split("")
			members = codes.map((c, i) => {
				const def = KeyMethods[XK_KEY_[c]]
				if (!def) return null
				const sub = {}
				for (const key in ctx.params) if (key.indexOf("p" + i + ".") === 0) sub[key.slice(("p" + i + ".").length)] = ctx.params[key]
				return { def, inst: def.build(subCtx(def, i, sub)) }
			}).filter(Boolean)
			if (members.length !== codes.length || !members.length) root.append(h("p", { class: "error" }, "This link uses a method this version does not know."))
			mount()
		}
		root.append(area)
		return {
			el: root,
			async collect() {
				if (create && members.length < 2) throw new Error("Choose at least 2 methods.")
				if (!members.length) throw new Error("Nothing to unlock with.")
				const lists = []
				for (const m of members) lists.push(await m.inst.collect())
				return limitedProduct(lists).map(parts => parts.join("+"))
			},
			bits: () => members.reduce((n, m) => n + m.inst.bits(), 0),
			reset() { members.forEach(m => m.inst.reset()) },
			mark(ok) { members.forEach(m => m.inst.mark && m.inst.mark(ok)) },
			getParams() {
				const o = { cm: members.map(m => m.def.code).join("") }
				members.forEach((m, i) => { const p = m.inst.getParams(); for (const key in p) o["p" + i + "." + key] = p[key] })
				return o
			}
		}
	}
})

function b64uOf(bytes) { return B64.enc(bytes) }

defKey({
	id: "webauthn", code: "e", group: "advanced", icon: "shield-check", label: "Passkey (PRF)", decoy: false,
	desc: "A secret derived by your passkey / security key (WebAuthn PRF). Works anywhere the passkey is available, needs a browser and authenticator with PRF support.",
	build(ctx) {
		const create = ctx.mode === "create"
		const P = { cid: ctx.params.cid || "", ps: ctx.params.ps || "" }
		let secret = null
		const status = h("p", { class: "hint" }, create ? "Register a passkey to derive the secret." : "Use your passkey to unlock.")
		const root = h("div", { class: "kw" }, status)
		const saltFor = async ps => sha256Bytes("bycrypt-prf-v1:" + ps)
		const evalPrf = async (credId, ps) => {
			const publicKey = {
				challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: "required", timeout: 60000,
				extensions: { prf: { eval: { first: await saltFor(ps) } } }
			}
			if (credId) publicKey.allowCredentials = [{ type: "public-key", id: credId }]
			const a = await navigator.credentials.get({ publicKey })
			const r = a.getClientExtensionResults().prf
			if (!r || !r.results || !r.results.first) throw new Error("This passkey does not support the PRF extension.")
			return "prf:" + toHex(await sha256Bytes(new Uint8Array(r.results.first)))
		}
		if (create) root.append(h("div", { class: "kw-row" }, btn("Register passkey", "shield-check", async () => {
			try {
				if (!window.PublicKeyCredential) throw new Error("WebAuthn is not available in this browser.")
				const cred = await navigator.credentials.create({ publicKey: {
					challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Bycrypt" },
					user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "bycrypt-key", displayName: "Bycrypt key" },
					pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
					authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
					extensions: { prf: {} }, timeout: 60000
				} })
				const ext = cred.getClientExtensionResults()
				if (!ext.prf || !ext.prf.enabled) throw new Error("This authenticator does not support the PRF extension.")
				const id = new Uint8Array(cred.rawId)
				const ps = b64uOf(crypto.getRandomValues(new Uint8Array(16)))
				secret = await evalPrf(id, ps)            // second touch: PRF values are produced on assertion
				P.cid = b64uOf(id); P.ps = ps
				status.textContent = "Passkey registered. Secret derived."
				ctx.onChange()
			} catch (e) { status.textContent = "Passkey failed: " + e.message }
		})))
		return {
			el: root,
			async collect() {
				if (create) { if (!secret) throw new Error("Register the passkey first."); return [secret] }
				if (!P.ps) throw new Error("This link is missing its passkey parameters.")
				try { return [await evalPrf(P.cid ? B64.dec(P.cid) : null, P.ps)] }
				catch (e) { throw new Error("Passkey failed: " + e.message) }
			},
			bits: () => secret ? 128 : 0, reset() { secret = null }, getParams: () => ({ cid: P.cid, ps: P.ps })
		}
	}
})

defKey({
	id: "keyfile", code: "g", group: "advanced", icon: "file", label: "Key file", decoy: true,
	desc: "Any file is the key (its SHA-256 fingerprint). Keep an exact copy: even a printed-and-rescanned QR image must stay byte-identical.",
	build(ctx) {
		const create = ctx.mode === "create"
		const input = h("input", { type: "file", "aria-label": "Key file" })
		const info = h("p", { class: "hint" }, create ? "Choose the file that will unlock this." : "Choose the key file.")
		input.addEventListener("change", () => { info.textContent = input.files[0] ? input.files[0].name + " (" + input.files[0].size + " bytes)" : ""; ctx.onChange() })
		return {
			el: h("div", { class: "kw" }, input, info),
			async collect() {
				if (!input.files[0]) throw new Error("Choose the key file first.")
				return ["file:" + toHex(await sha256Bytes(new Uint8Array(await input.files[0].arrayBuffer())))]
			},
			bits: () => input.files[0] ? 128 : 0, reset() { input.value = ""; info.textContent = "" }, getParams: () => ({})
		}
	}
})
