/*
 * Batch page: many QR codes at once (one per CSV line: label,data[,password]), laid out as a printable sheet.
 * Passwords are generated with the browser's secure random generator when a line has none.
 */
function parseCsv(text) {
	const rows = []
	for (const line of String(text).split(/\r?\n/)) {
		if (!line.trim()) continue
		const cells = []
		let cur = "", q = false
		for (let i = 0; i < line.length; i++) {
			const c = line[i]
			if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
			else if (c === '"') q = true
			else if (c === ",") { cells.push(cur); cur = "" }
			else cur += c
		}
		cells.push(cur)
		rows.push(cells.map(x => x.trim()))
	}
	return rows
}
function csvCell(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

class Batch {
	constructor() {
		this.element = $("#batch")
		const $id = id => document.getElementById(id)
		this.$id = $id
		for (const [v, t] of SCAN_OPTIONS.legacy) $id("b-scan").append(h("option", { value: v }, t))
		prefixes.forEach(p => $id("b-prefix").append(h("option", { value: p }, p !== "" ? p : "None")))
		$id("b-generate").addEventListener("click", () => this.generate())
		$id("b-print").addEventListener("click", () => window.print())
		$id("b-csv").addEventListener("click", () => {
			if (!this.rows) return
			const lines = ["label,link,password"].concat(this.rows.map(r => [r.label, r.link, r.key].map(csvCell).join(",")))
			saveAs(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "bycrypt-batch.csv")
		})
	}
	hide() { this.element.hide() }
	show() { this.element.show() }

	async generate() {
		const $id = this.$id, err = $id("b-error")
		err.textContent = ""
		$id("b-generate").disabled = true
		try {
			const lines = parseCsv($id("b-rows").value)
			if (!lines.length) throw new Error("Add at least one line: label,data,password")
			if (lines.length > 60) throw new Error("At most 60 lines at a time.")
			const len = Math.min(64, Math.max(6, parseInt($id("b-len").value) || 12))
			const level = $id("b-level").value
			const out = $id("b-out"); out.innerHTML = ""
			this.rows = []
			for (let i = 0; i < lines.length; i++) {
				const [label, data, pw] = lines[i]
				if (!data) throw new Error("Line " + (i + 1) + " has no data.")
				const scan = $id("b-scan").value
				if (scan === "redirect") { const c = classifyUrl(data); if (c.kind === "blocked" || c.kind === "invalid") throw new Error("Line " + (i + 1) + ": not a valid web address.") }
				const key = pw || secureRandomString(len)
				const res = await makeLink({ scan, data, prefix: $id("b-prefix").value, keyMethod: "alphanumeric", key, params: {}, mode: $id("b-mode").value, encoding: "Base64url" })
				const canvas = h("canvas", { width: 500, height: 600 })
				drawQrCard(canvas, res.link, { label: label || "", labelSize: 30, labelColor: "#000000", bg: "#ffffff", qrbg: "#ffffff", qrfg: "#000000", level })
				const card = h("div", { class: "bcard" }, canvas, $id("b-showpw").checked ? h("div", { class: "bpw" }, key) : null)
				out.append(card)
				this.rows.push({ label, link: res.link, key })
			}
			$id("b-actions").style.display = "flex"
		} catch (e) { err.textContent = e.message || String(e) }
		$id("b-generate").disabled = false
	}
}
