/*
 * Creator page.
 *  - Legacy-compatible mode (default): every deployed Bycrypt can open the result; legacy options produce the
 *    exact original link format.
 *  - Enhanced mode: PBKDF2 + AES-GCM, compression, schedule, decoy, privacy (#fragment). Needs this version or newer.
 */

/* ---------- content builders (one per scan type) ---------- */
function textBuilder(placeholder, rows) {
	let ta
	return {
		mount(box) { ta = h("textarea", { id: "c-text", placeholder, rows: rows || 8, "aria-label": "Content" }); box.append(ta) },
		async get() { if (!ta.value) throw new Error("Enter the content to encrypt."); return ta.value }
	}
}
function fieldRow(label, input) { return h("label", { class: "frow" }, h("span", {}, label), input) }

const CONTENT = {
	raw: () => textBuilder("Text to encrypt"),
	redirect: () => {
		const b = textBuilder("https://example.com", 3)
		const get = b.get
		b.get = async () => {
			const v = (await get()).trim()
			const c = classifyUrl(v)
			if (c.kind === "blocked") throw new Error("Addresses starting with " + c.scheme + ": are blocked: they can run code in the viewer's browser.")
			if (c.kind === "invalid") throw new Error("Enter a full web address, for example https://example.com")
			return v
		}
		return b
	},
	account: () => textBuilder("Username: alice\nPassword: ...", 6),
	download: () => textBuilder("Text that will be offered as a .txt download", 8),
	wifi: () => {
		let ssid, pass, sec, hid
		return {
			mount(box) {
				ssid = h("input", { type: "text", id: "c-wifi-ssid", placeholder: "Network name", autocomplete: "off" })
				pass = h("input", { type: "text", id: "c-wifi-pass", placeholder: "Password", autocomplete: "off" })
				sec = h("select", { id: "c-wifi-sec" }, h("option", { value: "WPA" }, "WPA / WPA2 / WPA3"), h("option", { value: "WEP" }, "WEP"), h("option", { value: "nopass" }, "Open (no password)"))
				hid = h("input", { type: "checkbox", id: "c-wifi-hidden" })
				box.append(fieldRow("Network", ssid), fieldRow("Password", pass), fieldRow("Security", sec), h("label", { class: "inline" }, hid, "Hidden network"))
			},
			async get() { if (!ssid.value) throw new Error("Enter the network name."); return packWifi({ ssid: ssid.value, password: pass.value, security: sec.value, hidden: hid.checked }) }
		}
	},
	contact: () => {
		const f = {}
		return {
			mount(box) {
				for (const [k, label] of [["name", "Name"], ["org", "Organisation"], ["phone", "Phone"], ["email", "Email"], ["url", "Website"], ["note", "Note"]]) {
					f[k] = h("input", { type: "text", id: "c-ct-" + k, placeholder: label, autocomplete: "off" }); box.append(fieldRow(label, f[k]))
				}
			},
			async get() { if (!f.name.value) throw new Error("Enter a name."); const o = {}; for (const k in f) o[k] = f[k].value; return packContact(o) }
		}
	},
	links: () => textBuilder("One link per line\nMy site | https://example.com\nhttps://example.org", 7),
	markdown: () => {
		let ta, prev
		return {
			mount(box) {
				ta = h("textarea", { id: "c-text", rows: 8, placeholder: "# Title\n\nSome **bold** text, a list:\n- one\n- two", "aria-label": "Markdown" })
				prev = h("div", { class: "md preview-md", "aria-label": "Preview" })
				ta.addEventListener("input", () => { prev.innerHTML = renderMarkdown(ta.value) })
				box.append(ta, h("p", { class: "hint" }, "Preview:"), prev)
			},
			async get() { if (!ta.value) throw new Error("Write the note first."); return ta.value }
		}
	},
	file: () => {
		let input
		return {
			mount(box) { input = h("input", { type: "file", id: "c-file", "aria-label": "File" }); box.append(input, h("p", { class: "hint" }, "A QR code holds only a few kilobytes: use tiny files (a key, a certificate, a small image).")) },
			async get() {
				const f = input.files[0]
				if (!f) throw new Error("Choose a file.")
				if (f.size > 6000) throw new Error("This file is too large for a QR code (" + f.size + " bytes).")
				return packFile(f.name, f.type, new Uint8Array(await f.arrayBuffer()))
			}
		}
	}
}
const SCAN_OPTIONS = {
	legacy: [["raw", "Text"], ["redirect", "Redirect to a link"], ["account", "Account details"], ["download", "Text download"]],
	extended: [["wifi", "Wi-Fi network"], ["contact", "Contact card"], ["links", "Link list"], ["markdown", "Markdown note"], ["file", "Small file"]]
}

class New {
	constructor() {
		this.element = $("#new")
		const $id = id => document.getElementById(id)
		this.$id = $id
		this.imgData = null
		this.inst = null; this.decoyInst = null; this.methodId = null; this.decoySig = ""

		// selects
		const scan = $id("c-scan")
		for (const [group, label] of [["legacy", "Classic"], ["extended", "More types"]]) {
			const og = h("optgroup", { label })
			SCAN_OPTIONS[group].forEach(([v, t]) => og.append(h("option", { value: v }, t)))
			scan.append(og)
		}
		prefixes.forEach(p => $id("c-prefix").append(h("option", { value: p }, p !== "" ? p : "None")))
		const key = $id("c-key")
		for (const [g, label] of KEY_GROUPS) {
			const og = h("optgroup", { label })
			Object.values(KeyMethods).filter(m => m.group === g).forEach(m => og.append(h("option", { value: m.id }, m.label)))
			key.append(og)
		}
		scan.addEventListener("change", () => this.mountContent())
		key.addEventListener("change", () => this.mountMethod())
		$id("c-mode").addEventListener("change", () => this.updateMode())
		$id("c-decoy-on").addEventListener("change", () => this.updateDecoy())
		$id("c-generate").addEventListener("click", () => this.generate())
		$id("c-copy").addEventListener("click", () => copyText(this.last.link, $id("c-copy")))
		$id("c-png").addEventListener("click", () => $id("c-canvas").toBlob(b => saveAs(b, "qrcode-exported-bycrypt.png")))
		$id("c-svg").addEventListener("click", () => saveAs(new Blob([qrSvgString(this.last.link, this.style())], { type: "image/svg+xml" }), "qrcode-exported-bycrypt.svg"))
		$id("c-test").addEventListener("click", () => window.open(this.localUrl(), "_blank"))
		$id("c-inspect").addEventListener("click", () => window.open("/inspect?l=" + encodeURIComponent(this.last.link), "_blank"))

		// brand logos + custom picture for the label
		const picker = $id("icon-picker")
		const addIcon = (src, name) => {
			const im = new Image(); im.className = "xicon"; im.src = src; im.width = 32; im.height = 32; im.alt = name || "custom icon"
			im.addEventListener("click", () => {
				picker.querySelectorAll(".xicon").forEach(i => { i.style.backgroundColor = "transparent" })
				im.style.backgroundColor = "#ebebeb"; this.imgData = im.src
				if (name) $id("c-label").value = name[0].toUpperCase() + name.slice(1)
			})
			picker.append(im)
		}
		brandIcons.forEach(n => addIcon("/res/icons/" + n + ".png", n))
		$id("c-custom-icon").addEventListener("click", () => {
			const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"
			input.addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => addIcon(ev.target.result); r.readAsDataURL(f) })
			input.click()
		})

		this.loadConfig()
		this.mountContent()
		this.mountMethod()
		this.updateMode()
	}
	hide() { this.element.hide() }
	show() { this.element.show() }

	/* ---------- content ---------- */
	mountContent() {
		const box = this.$id("c-content"); box.innerHTML = ""
		this.content = CONTENT[this.$id("c-scan").value]()
		this.content.mount(box)
		hydrateIcons(box)
	}

	/* ---------- key method ---------- */
	mountMethod() {
		const id = this.$id("c-key").value
		if (!KeyMethods[id]) return
		this.methodId = id
		const def = KeyMethods[id]
		this.$id("c-key-desc").textContent = def.desc
		const box = this.$id("c-widget"); box.innerHTML = ""
		const ref = this
		this.inst = buildKeyWidget(id, { mode: "create", params: {}, onChange() { ref.onKeyChange() }, submit() {} })
		box.append(this.inst.el)
		hydrateIcons(box)
		this.updateDecoy()
		this.updateStrength()
	}
	onKeyChange() {
		this.updateStrength()
		if (this.$id("c-decoy-on").checked && JSON.stringify(this.inst.getParams()) !== this.decoySig) this.buildDecoyWidget()
	}
	updateStrength() {
		const bits = this.inst ? this.inst.bits() : 0
		const s = strengthInfo(bits)
		const box = this.$id("c-strength")
		box.className = "strength " + s.cls
		box.innerHTML = ""
		box.append(h("span", { class: "sbar" }, h("span", { class: "sfill", style: "width:" + Math.min(100, bits * 100 / 100) + "%" })), h("span", { class: "stext" }, bits ? s.label + " (about " + bits + " bits)" : "No key yet"))
		const legacyMode = this.$id("c-mode").value === "legacy"
		const warn = this.$id("c-strength-note")
		warn.textContent = bits && bits < 40
			? (legacyMode ? "Anyone holding the QR code can try guesses offline, and Legacy mode is fast to guess. Choose a stronger key or use Enhanced mode." : "Anyone holding the QR code can try guesses offline. Enhanced mode slows each guess, but a stronger key is still better.")
			: ""
	}

	/* ---------- mode / decoy ---------- */
	updateMode() {
		const enhanced = this.$id("c-mode").value === "enhanced"
		$(this.$id("c-enh")).toggle(enhanced)
		this.$id("c-mode-note").className = "notice " + (enhanced ? "warn" : "ok")
		this.$id("c-mode-note").textContent = enhanced
			? "Enhanced: stronger encryption and extra features. Only this version of Bycrypt (or newer) can open these links. Older deployments will not."
			: "Legacy-compatible: opens in every version of Bycrypt, past and present. Puzzle keys can also be typed into the old password box."
		this.updateDecoy(); this.updateStrength()
	}
	decoyAllowed() {
		const def = KeyMethods[this.methodId]
		if (!def || def.decoy === false) return false
		if (this.methodId === "composite") return (this.inst.getParams().cm || "").split("").every(c => KeyMethods[XK_KEY_[c]] && KeyMethods[XK_KEY_[c]].decoy !== false)
		return true
	}
	updateDecoy() {
		const on = this.$id("c-decoy-on"), enhanced = this.$id("c-mode").value === "enhanced"
		const allowed = this.decoyAllowed()
		on.disabled = !allowed
		this.$id("c-decoy-hint").textContent = allowed ? "A second key opens harmless content instead. The unlock page does not reveal which key is real, but anyone who analyses the link format can see that two sealed items exist." : "This key method cannot have a decoy."
		if (!allowed) on.checked = false
		$(this.$id("c-decoy-box")).toggle(enhanced && on.checked)
		if (enhanced && on.checked) this.buildDecoyWidget()
	}
	buildDecoyWidget() {
		const box = this.$id("c-decoy-widget"); box.innerHTML = ""
		const params = this.inst.getParams()
		this.decoySig = JSON.stringify(params)
		this.decoyInst = buildKeyWidget(this.methodId, { mode: "unlock", params, onChange() {}, submit() {} })
		box.append(this.decoyInst.el)
		hydrateIcons(box)
	}

	/* ---------- output ---------- */
	style() {
		const v = id => this.$id(id).value
		return { label: v("c-label"), labelSize: parseFloat(v("c-lsize")) || 30, labelColor: v("c-lcolor"), labelX: parseFloat(v("c-lx")) || 0, labelY: parseFloat(v("c-ly")) || 0,
			bg: v("c-bg"), qrbg: v("c-qrbg"), qrfg: v("c-qrfg"), level: v("c-level"), imgData: this.imgData }
	}
	localUrl() {
		const r = this.last
		return r.fragment ? location.origin + "/x/_?" + r.query + "#" + r.payload : location.origin + "/x/" + r.payload + "?" + r.query
	}
	setError(msg) { this.$id("c-error").textContent = msg || ""; $(this.$id("c-error"))[msg ? "show" : "hide"]() }

	async generate() {
		const $id = this.$id
		const btnGen = $id("c-generate")
		this.setError("")
		btnGen.disabled = true
		try {
			const scan = $id("c-scan").value, mode = $id("c-mode").value, enhanced = mode === "enhanced"
			const data = await this.content.get()
			const key = (await this.inst.collect())[0]
			const params = Object.assign({}, this.inst.getParams())
			if ($id("c-title").value.trim()) params.t = $id("c-title").value.trim()
			if ($id("c-message").value.trim()) params.n = $id("c-message").value.trim()
			if ($id("c-hint").value.trim()) params.h = $id("c-hint").value.trim()
			if (parseInt($id("c-attempts").value) > 0) params.m = parseInt($id("c-attempts").value)
			if (params.h && params.h.indexOf(key) >= 0) throw new Error("The hint contains the key itself.")

			const o = { scan, data, prefix: $id("c-prefix").value, keyMethod: this.methodId, key, params, mode, encoding: "Base64url" }
			if (enhanced) {
				o.compress = $id("c-compress").checked
				o.fragment = $id("c-fragment").checked
				const nb = $id("c-nb").value, ex = $id("c-ex").value
				if (nb) o.nb = new Date(nb).getTime()
				if (ex) o.ex = new Date(ex).getTime()
				if (o.nb && o.ex && o.ex <= o.nb) throw new Error("The expiry must be after the start time.")
				if ($id("c-decoy-on").checked) {
					const dd = $id("c-decoy-data").value
					if (!dd) throw new Error("Enter the decoy content.")
					const dk = (await this.decoyInst.collect())[0]
					if (dk === key) throw new Error("The decoy key must differ from the real key.")
					o.decoy = { data: dd, key: dk }
				}
			}
			const res = await makeLink(o)
			this.last = res
			const style = this.style()
			const canvas = $id("c-canvas")
			const qr = drawQrCard(canvas, res.link, style)
			const levelNote = qr.usedLevel !== style.level ? " Correction level lowered from " + style.level + " to " + qr.usedLevel + " so the data fits." : ""

			$id("c-out").style.display = "block"
			$id("c-link").textContent = res.link
			const cap = QR_CAP[style.level], used = new TextEncoder().encode(res.link).length
			$id("c-cap").textContent = "QR capacity: " + used + " of " + cap + " bytes (" + Math.round(used * 100 / cap) + "%)" + (used > cap * 0.7 ? " - dense codes scan less reliably." : "") + levelNote
			$id("c-compat").className = "notice " + (res.compatLegacy ? "ok" : "warn")
			$id("c-compat").textContent = res.compatLegacy ? "Opens in every Bycrypt version." : "Needs this version of Bycrypt or newer."
			const hash = CryptoJS.MD5(res.link).toString()
			$id("c-log").textContent = makeLog(
				["scanType", scan], ["prefix", o.prefix || "None"], ["keyMethod", this.methodId], ["key", hideKey(key)], ["mode", mode],
				["query", res.query], ["label", style.label], ["correctLevel", style.level], ["length", res.link.length], ["hash", hash])
			hydrateIcons($id("c-out"))
			this.saveConfig()
		} catch (err) {
			this.setError(err && err.message ? err.message : String(err))
		}
		btnGen.disabled = false
	}

	/* ---------- saved settings (appearance and options only, never keys or content) ---------- */
	static get FIELDS() { return ["c-scan", "c-prefix", "c-key", "c-label", "c-lsize", "c-lcolor", "c-lx", "c-ly", "c-bg", "c-qrbg", "c-qrfg", "c-level"] }
	saveConfig() {
		try {
			const o = {}
			for (const id of New.FIELDS) { const e = this.$id(id); o[id] = e.type === "checkbox" ? e.checked : e.value }
			localStorage.setItem("bycryptConfig2", JSON.stringify(o))
		} catch (e) {}
	}
	loadConfig() {
		try {
			let o = JSON.parse(localStorage.getItem("bycryptConfig2") || "null")
			if (!o) {                       // migrate the index-based config written by earlier versions
				const old = JSON.parse(localStorage.getItem("bycryptConfig") || "null")
				if (!old || !old.inputs || !old.selects) return
				o = { "c-label": old.inputs[3], "c-lsize": old.inputs[4], "c-lcolor": old.inputs[5], "c-lx": old.inputs[6], "c-ly": old.inputs[7],
					"c-bg": old.inputs[9], "c-qrbg": old.inputs[10], "c-qrfg": old.inputs[11], "c-scan": old.selects[0], "c-prefix": old.selects[1], "c-level": old.selects[4] }
			}
			for (const id of New.FIELDS) {
				const e = this.$id(id)
				if (o[id] === undefined || o[id] === null || !e) continue
				if (e.type === "checkbox") e.checked = !!o[id]
				else if (e.tagName !== "SELECT" || Array.from(e.options).some(op => op.value === String(o[id]))) e.value = o[id]
			}
		} catch (e) {}
	}
}
