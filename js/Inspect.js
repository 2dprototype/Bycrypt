/*
 * Link inspector: explains what a link is made of WITHOUT decrypting it. Nothing leaves the browser.
 */
function inspectLink(raw) {
	let s = String(raw).trim()
	const hashAt = s.indexOf("#")
	const fragment = hashAt >= 0 ? s.slice(hashAt + 1) : ""
	if (hashAt >= 0) s = s.slice(0, hashAt)
	const q = s.indexOf("?")
	const query = q >= 0 ? s.slice(q + 1) : ""
	const before = q >= 0 ? s.slice(0, q) : s
	const cut = before.lastIndexOf("/") + 1
	const meta = parseLinkQuery("?" + query)
	const info = resolveLink(meta)
	const payload = info.suite === "fragment" ? fragment : before.slice(cut)
	const out = { prefix: before.slice(0, cut), payloadLength: payload.length, meta, info, rows: [] }
	const R = (k, v) => out.rows.push([k, v])
	R("Link prefix", out.prefix || "(none)")
	R("Payload", payload.length + " characters" + (info.suite === "fragment" ? " (in the #fragment)" : ""))
	R("Scan type (S)", (CODE_NAMES.S[meta.scanType] || "unknown") + " [" + meta.scanType + "]")
	R("Encoding (E, unused by the decrypter)", (CODE_NAMES.E[meta.encoding] || "unknown") + " [" + meta.encoding + "]")
	R("Key type (K)", (CODE_NAMES.K[meta.keyType] || "unknown") + " [" + meta.keyType + "]")
	if (meta.hasExt) {
		R("Extended scan type (xS)", meta.xS === "_" ? "not used" : (CODE_NAMES.xS[meta.xS] || "unknown") + " [" + meta.xS + "]")
		R("Extended suite (xE)", meta.xE === "_" ? "legacy (not set)" : (CODE_NAMES.xE[meta.xE] || "unknown") + " [" + meta.xE + "]")
		R("Extended key method (xK)", meta.xK === "_" ? "not used" : (CODE_NAMES.xK[meta.xK] || "unknown") + " [" + meta.xK + "]")
	}
	R("Effective result", "opens as: " + info.scan + ", unlocked with: " + (info.key ? (KeyMethods[info.key] ? KeyMethods[info.key].label : info.key) : "unknown") + ", encryption: " + info.suite)
	const keys = Object.keys(meta.params)
	if (keys.length) {
		const paramLines = keys.map(k => {
			if (k === "img" && typeof isQvgImg === "function" && isQvgImg(meta.params[k])) {
				const p = qvgPayloadOf(meta.params[k])
				return k + " = QVG Vector Image (" + p.length + " chars)"
			}
			return k + " = " + meta.params[k]
		})
		R("Public parameters", paramLines.join("\n"))
	}
	if (info.suite !== "legacy" && payload) {
		try {
			const b = B64.dec(payload)
			if (b[0] === 1) R("Sealed data", "1 item, PBKDF2 " + (((b[1] << 8) | b[2]) * 1000) + " rounds, " + b.length + " bytes")
			else if (b[0] === 2) R("Sealed data", b[1] + " sealed items (a link with several keys), " + b.length + " bytes. Note: this structure is visible to anyone who inspects the link.")
			else R("Sealed data", "unrecognised format")
		} catch (e) { R("Sealed data", "not valid base64url") }
	}
	out.compat = info.suite === "legacy" ? "Opens in every Bycrypt version (legacy encryption)." : "Needs a Bycrypt version that supports the Enhanced suite."
	out.warnings = info.warnings.concat(info.unsupported ? ["Unsupported here: " + info.unsupported] : [])
	return out
}

class Inspect {
	constructor() {
		this.element = $("#inspect")
		document.getElementById("i-go").addEventListener("click", () => this.run())
	}
	hide() { this.element.hide() }
	show() { this.element.show() }
	update(search) {
		const m = String(search || "").match(/[?&]l=([^&]*)/)
		if (m) { try { document.getElementById("i-input").value = decodeURIComponent(m[1]) } catch (e) {} this.run() }
	}
	run() {
		const box = document.getElementById("i-out"); box.innerHTML = ""
		const v = document.getElementById("i-input").value.trim()
		if (!v) return
		const r = inspectLink(v)
		const table = h("table", { class: "itable" })
		r.rows.forEach(([k, val]) => table.append(h("tr", {}, h("th", {}, k), h("td", {}, val))))
		box.append(table, h("div", { class: "notice " + (r.info.suite === "legacy" ? "ok" : "warn") }, r.compat))
		r.warnings.forEach(w => box.append(h("div", { class: "notice warn" }, w)))
	}
}
