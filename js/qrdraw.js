/* QR rendering, export and small UI helpers shared by the creator, batch page and decrypter. */

const QR_CAP = { L: 2953, M: 2331, Q: 1663, H: 1273 }       // bytes in byte mode

function qrFits(text, level) { return new TextEncoder().encode(text).length <= QR_CAP[level] }

function makeQrModel(text, level, fg, bg, px) {
	// The bundled QR library can overflow before the nominal capacity at high correction levels, so step down
	// (H -> Q -> M -> L) until the data fits. The level actually used is reported in qr.usedLevel.
	const order = ["H", "Q", "M", "L"]
	let lastErr = null
	for (const lvl of order.slice(order.indexOf(level))) {
		if (!qrFits(text, lvl)) continue
		try {
			const qr = new QRCode(document.createElement("div"), { text, width: px, height: px, colorDark: fg, colorLight: bg, correctLevel: QRCode.CorrectLevel[lvl] })
			qr.usedLevel = lvl
			return qr
		} catch (e) { lastErr = e }
	}
	const n = new TextEncoder().encode(text).length
	throw new Error("Too much data for a QR code (" + n + " bytes; at most " + QR_CAP.L + " even at the lowest correction level). Shorten the data, or use compression (Enhanced mode)." + (lastErr ? "" : ""))
}

/* Draw the card: QR (500x500) + footer with optional logo and label, exactly like the original layout. */
function drawQrCard(canvas, text, o) {
	const qr = makeQrModel(text, o.level, o.qrfg, o.qrbg, 500)
	const ctx = canvas.getContext("2d")
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.fillStyle = o.bg; ctx.fillRect(0, 0, canvas.width, canvas.height)
	// quiet zone: scanners need a light margin around the code (the original drew it edge to edge)
	ctx.fillStyle = o.qrbg; ctx.fillRect(0, 0, 500, 500)
	ctx.drawImage(qr._oDrawing._elCanvas, 32, 32, 436, 436)
	const drawLabel = () => {
		ctx.fillStyle = o.labelColor || "#000000"
		ctx.font = (o.labelSize || 30) + "px Arial"
		ctx.textBaseline = "alphabetic"
		ctx.fillText(o.label || "", 115 + (o.labelX || 0), 550 + (o.labelSize || 30) / 3 + (o.labelY || 0))
	}
	if (o.imgData) {
		const im = new Image()
		im.onload = () => { ctx.drawImage(im, 10, 510, 80, 80); drawLabel() }
		im.onerror = drawLabel
		im.src = o.imgData
	} else drawLabel()
	return qr
}

function drawQrError(canvas, message) {
	const ctx = canvas.getContext("2d")
	ctx.setTransform(1, 0, 0, 1, 0, 0)
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.fillStyle = "#ffffff"
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.textAlign = "center"
	ctx.fillStyle = "#b00020"
	ctx.font = "bold 22px Arial"
	ctx.fillText("QR code could not be generated", canvas.width / 2, canvas.height / 2 - 30)
	ctx.fillStyle = "#333333"
	ctx.font = "15px Arial"
	ctx.fillText("The link is too long to fit in a QR code.", canvas.width / 2, canvas.height / 2 + 6)
	ctx.fillText("Everything still works - use the link text", canvas.width / 2, canvas.height / 2 + 30)
	ctx.fillText("or the Copy button instead.", canvas.width / 2, canvas.height / 2 + 52)
	if (message) {
		ctx.fillStyle = "#666666"
		ctx.font = "12px Arial"
		ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 84)
	}
	ctx.textAlign = "start"
}

function xmlEscape(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }

/* Vector export: one path for all dark modules, quiet zone of 4 modules, optional label underneath. */
function qrSvgString(text, o) {
	const qr = makeQrModel(text, o.level, o.qrfg, o.qrbg, 128)
	const m = qr._oQRCode, n = m.getModuleCount(), q = 4
	let d = ""
	for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m.isDark(r, c)) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z"
	const size = n + 2 * q, extra = o.label ? 5 : 0
	return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + (size + extra) + '" width="' + size * 8 + '" height="' + (size + extra) * 8 + '" shape-rendering="crispEdges">' +
		'<rect width="100%" height="100%" fill="' + xmlEscape(o.bg) + '"/><rect x="0" y="0" width="' + size + '" height="' + size + '" fill="' + xmlEscape(o.qrbg) + '"/>' +
		'<path d="' + d + '" fill="' + xmlEscape(o.qrfg) + '"/>' +
		(o.label ? '<text x="' + size / 2 + '" y="' + (size + 3.4) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="2.6" fill="' + xmlEscape(o.labelColor || "#000") + '">' + xmlEscape(o.label) + "</text>" : "") + "</svg>"
}

function copyText(text, button) {
	const done = () => { if (button) { const old = button.innerHTML; button.innerHTML = ""; button.append(iconEl("check", 16), h("span", {}, "Copied")); setTimeout(() => { button.innerHTML = old }, 1400) } }
	if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done))
	else fallbackCopy(text, done)
}
function fallbackCopy(text, done) {
	const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"
	document.body.append(t); t.select()
	try { document.execCommand("copy"); done() } catch (e) {}
	t.remove()
}
