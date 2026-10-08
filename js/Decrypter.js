/*
 * Decrypter (unlock page). Opens every legacy link exactly as before (same key derivations, both fingerprint
 * hashes, neighbour location cells) and understands the extended S / E / K codes. Unknown extended codes fall
 * back to the legacy slot; if nothing usable is left, a "needs a newer Bycrypt" screen is shown.
 */
const UNLOCK_LABEL = { location: "Get location and unlock", fingerprint: "Scan fingerprint", webauthn: "Use passkey" }

class Decrypter {
	constructor() {
		this.element = $("#decrypter")
		this.widget = null
		this.busy = false
		this.q(".dt-unlock").on("click", () => this.unlock())
	}
	hide() { this.element.hide() }
	show() { this.element.show() }
	q(sel) { return this.element.find(sel) }

	reset() {
		this.widget = null; this.busy = false
		this.q(".dt-widget").empty()
		this.q(".output").empty().hide()
		this.q(".dt-card").show().removeClass("shake")
		this.q(".dt-error").text("")
		this.q(".dt-note").text("").hide()
		this.q(".dt-hint-box").hide()
		this.q(".dt-message").text("").hide()
		this.q(".dt-attempts").text("")
		this.q(".dt-unlock").prop("disabled", false).show()
	}

	update(data, search, hash) {
		this.reset()
		const meta = parseLinkQuery(search)
		const info = resolveLink(meta)
		this.meta = meta; this.info = info; this.params = meta.params
		this.payload = info.suite === "fragment" ? String(hash || "").replace(/^#/, "") : data

		this.q(".dt-title").text(this.params.t || "Locked data")
		if (this.params.n) this.q(".dt-message").text(this.params.n).show()
		if (this.params.h) { this.q(".dt-hint-text").text(this.params.h); this.q(".dt-hint-box").show().prop("open", false) }
		if (info.warnings.length) this.q(".dt-note").text(info.warnings.join(" ")).show()

		const def = info.key && KeyMethods[info.key]
		if (info.unsupported || !def) return this.showUnsupported(info.unsupported || "key method")
		if (!this.payload) return this.showFatal("This link contains no data.")

		this.def = def
		this.q(".dt-method").empty().append(iconEl(def.icon, 16), h("span", {}, def.label))
		const ref = this
		this.widget = buildKeyWidget(def.id, { mode: "unlock", params: this.params, onChange() {}, submit() { ref.unlock() } })
		this.q(".dt-widget").append(this.widget.el)
		this.q(".dt-unlock").empty().append(iconEl("unlock", 16), h("span", {}, UNLOCK_LABEL[def.id] || "Unlock"))
		this.updateAttempts()
		if (this.widget.focus) setTimeout(() => this.widget.focus(), 50)
		hydrateIcons(this.element[0])
	}

	showUnsupported(what) {
		this.q(".dt-widget").empty().append(h("div", { class: "notice warn" }, iconEl("alert", 20), h("div", {},
			h("b", {}, "This link needs a newer version of Bycrypt."),
			h("p", {}, "It uses a feature this version does not know (" + what + ")."),
			h("p", {}, h("a", { href: "/" }, "Open the current Bycrypt")))))
		this.q(".dt-unlock").hide()
		this.q(".dt-method").empty()
	}
	showFatal(msg) {
		this.q(".dt-widget").empty().append(h("div", { class: "notice warn" }, iconEl("alert", 20), h("div", {}, msg)))
		this.q(".dt-unlock").hide()
	}
	setError(msg) { this.q(".dt-error").text(msg) }

	/* soft, per-device attempt limit (only a speed bump: clearing site data resets it) */
	attemptKey() { let n = 5381; const s = this.payload; for (let i = 0; i < s.length; i++) n = ((n * 33) ^ s.charCodeAt(i)) >>> 0; return "bycrypt.attempts." + n + "." + s.length }
	maxAttempts() { return parseInt(this.params.m) || 0 }
	attemptsUsed() { try { return parseInt(localStorage.getItem(this.attemptKey())) || 0 } catch (e) { return 0 } }
	setAttempts(n) { try { localStorage.setItem(this.attemptKey(), String(n)) } catch (e) {} }
	locked() { const m = this.maxAttempts(); return m > 0 && this.attemptsUsed() >= m }
	updateAttempts() {
		const m = this.maxAttempts()
		if (!m) return
		if (this.locked()) { this.q(".dt-attempts").text("Too many failed attempts on this device."); this.q(".dt-unlock").prop("disabled", true) }
		else this.q(".dt-attempts").text("Attempts left: " + (m - this.attemptsUsed()))
	}

	async unlock() {
		if (this.busy || !this.widget) return
		if (this.locked()) { this.updateAttempts(); return }
		this.setError("")
		let candidates
		try { candidates = await this.widget.collect() } catch (e) { this.setError(e.message || String(e)); return }
		this.busy = true
		const button = this.q(".dt-unlock").prop("disabled", true)
		let env = null
		try {
			if (this.info.suite === "legacy") {
				for (const c of candidates) { const t = legacyDecryptSafe(this.payload, c); if (t) { env = { d: t }; break } }
			} else {
				this.setError("Checking...")
				env = await enhancedDecrypt(this.payload, candidates, (d, t) => { if (t > 1) this.setError("Checking " + d + " / " + t + "...") })
				this.setError("")
			}
		} catch (e) { this.setError("Could not read this link: " + e.message) }
		this.busy = false
		button.prop("disabled", false)
		if (!env) return this.fail()
		this.succeed(env)
	}

	fail() {
		if (this.widget.mark) this.widget.mark(false)
		if (this.maxAttempts()) this.setAttempts(this.attemptsUsed() + 1)
		this.setError("Wrong key. Try again.")
		const card = this.q(".dt-card"); card.removeClass("shake"); void card[0].offsetWidth; card.addClass("shake")
		this.updateAttempts()
	}

	succeed(env) {
		if (this.widget.mark) this.widget.mark(true)
		if (this.maxAttempts()) this.setAttempts(0)
		const out = this.q(".output").empty().show()
		const now = Date.now()
		let notice = null
		if (env.nb && now < env.nb) notice = "This content opens on " + new Date(env.nb).toLocaleString() + "."
		else if (env.ex && now > env.ex) notice = "This content expired on " + new Date(env.ex).toLocaleString() + "."
		this.q(".dt-card").hide()
		if (notice) { out.append(h("div", { class: "notice warn" }, iconEl("clock", 20), h("div", {}, h("b", {}, "The key is right, but this content is not available now."), h("p", {}, notice)))); return }
		this.render(out[0], this.info.scan, env.d)
	}

	/* ---------- result renderers ---------- */
	render(out, scan, text) {
		const head = (title, icon) => h("div", { class: "result-head" }, iconEl(icon || "unlock", 20), h("b", {}, title))
		const actions = (...btns) => h("div", { class: "kw-row result-actions" }, ...btns)
		const copyBtn = (t, label) => { const b = btn(label || "Copy", "copy", () => copyText(t, b)); return b }
		const row = (label, value, secret) => {
			const mask = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
			const val = h("span", { class: "rv" }, secret ? mask : value)
			const r = h("div", { class: "rrow" }, h("span", { class: "rl" }, label), val)
			if (secret) { let shown = false; const e = btn("", "eye", () => { shown = !shown; val.textContent = shown ? value : mask }, "icon-only"); e.setAttribute("aria-label", "Show or hide " + label); r.append(e) }
			const c = btn("", "copy", () => copyText(value, c), "icon-only"); c.setAttribute("aria-label", "Copy " + label); r.append(c)
			return r
		}
		const card = h("div", { class: "result" })
		const add = (...items) => items.flat(Infinity).filter(Boolean).forEach(i => card.append(i))
		out.append(card)

		if (scan === "redirect") {
			const c = classifyUrl(text)
			add(head("Redirect", "external"), h("p", { class: "dest" }, c.url))
			if (c.kind === "safe") add(h("p", { class: "hint" }, "Check the address before you continue."), actions(btn("Open link", "external", () => { window.location.assign(c.url) }, "primary"), copyBtn(c.url)))
			else if (c.kind === "app") add(h("div", { class: "notice warn" }, iconEl("alert", 20), h("div", {}, "This link opens another app (" + c.scheme + ":). Only continue if you trust the sender.")), actions(btn("Open anyway", "external", () => { window.location.assign(c.url) }), copyBtn(c.url)))
			else add(h("div", { class: "notice warn" }, iconEl("alert", 20), h("div", {}, c.kind === "blocked" ? "This address was blocked for your safety (" + c.scheme + ": links can run code)." : "This does not look like a web address, so it was not opened.")), actions(copyBtn(text)))
		} else if (scan === "download") {
			const save = () => saveAs(new Blob([text], { type: "text/plain;charset=utf-8" }), "bycrypt-decrypted-data.txt")
			add(head("Download", "download"), h("p", { class: "hint" }, "Your download should start automatically."), actions(btn("Download again", "download", save, "primary")))
			save()
		} else if (scan === "wifi" && parseWifi(text)) {
			const w = parseWifi(text)
			add(head("Wi-Fi network", "wifi"), row("Network", w.ssid), w.security !== "nopass" ? row("Password", w.password, true) : null, row("Security", w.security === "nopass" ? "Open" : w.security), w.hidden ? row("Hidden", "Yes") : null,
				h("p", { class: "hint" }, "Join the network from your device's Wi-Fi settings using these details."))
		} else if (scan === "contact" && parseContact(text)) {
			add(head("Contact card", "user"), parseContact(text).map(r => row(r.label, r.value)),
				actions(btn("Save contact (.vcf)", "download", () => saveAs(new Blob([text], { type: "text/vcard;charset=utf-8" }), "contact.vcf"), "primary")))
		} else if (scan === "links") {
			add(head("Links", "link"))
			const list = h("ul", { class: "linklist" })
			for (const l of parseLinks(text)) {
				const c = classifyUrl(l.url)
				if (c.kind === "safe") list.append(h("li", {}, h("a", { href: c.url, target: "_blank", rel: "noopener noreferrer" }, l.title), h("span", { class: "hint" }, " " + c.url)))
				else list.append(h("li", { class: "blocked" }, l.title, h("span", { class: "hint" }, c.kind === "app" ? " (opens another app, copy it to use)" : " (blocked)"), " ", copyBtn(l.url, "Copy")))
			}
			add(list)
		} else if (scan === "markdown") {
			const md = h("div", { class: "md" }); md.innerHTML = renderMarkdown(text)          // renderMarkdown escapes everything first
			add(head("Note", "file-text"), md, actions(copyBtn(text, "Copy source")))
		} else if (scan === "file" && parseFile(text)) {
			const f = parseFile(text)
			add(head("File", "file"), row("Name", f.name), row("Type", f.mime), row("Size", f.bytes.length + " bytes"))
			if (/^image\/(png|jpe?g|gif|webp)$/i.test(f.mime)) add(h("img", { class: "preview", src: URL.createObjectURL(new Blob([f.bytes], { type: f.mime })), alt: f.name }))
			add(actions(btn("Download file", "download", () => saveAs(new Blob([f.bytes], { type: f.mime }), f.name), "primary")))
		} else {
			add(head("Unlocked", "unlock"), h("pre", { class: "result-text" }, h("code", {}, text)), actions(copyBtn(text)))
		}
		hydrateIcons(out)
	}
}
