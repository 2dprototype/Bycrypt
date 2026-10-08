/*
 * Extended scan types (xS 4-8) and URL safety. Pure functions, no DOM access.
 * The plaintext of every type is an ordinary string, so an older decrypter that does not know the type
 * simply shows that string as text (or downloads it for file).
 */

/* ---------- URL safety (Redirect, link lists, markdown links) ---------- */
const SAFE_SCHEMES = ["http", "https", "mailto", "tel", "sms", "geo"]
const BLOCKED_SCHEMES = ["javascript", "data", "vbscript", "file", "blob", "about"]

/* kind: safe | app (another application's scheme - needs explicit confirmation) | blocked | invalid */
function classifyUrl(raw) {
	const u = String(raw == null ? "" : raw).trim()
	// browsers ignore control chars / whitespace inside the scheme ("java\nscript:"), so detect on a compacted copy
	const compact = u.replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, "")
	const m = compact.match(/^([a-z][a-z0-9+.\-]*):/i)
	if (!m) {
		if (/^(www\.)?[a-z0-9\-]+(\.[a-z0-9\-]+)+(:\d+)?([\/?#]|$)/i.test(compact)) return { kind: "safe", url: "https://" + compact, assumed: true }
		return { kind: "invalid", url: u }
	}
	const scheme = m[1].toLowerCase()
	const clean = u.replace(/[\u0000-\u001f\u007f]/g, "")
	if (clean.toLowerCase().indexOf(scheme + ":") !== 0) return { kind: "blocked", url: u, scheme }   // junk before the scheme
	if (BLOCKED_SCHEMES.indexOf(scheme) >= 0) return { kind: "blocked", url: u, scheme }
	if (SAFE_SCHEMES.indexOf(scheme) >= 0) return { kind: "safe", url: clean, scheme }
	return { kind: "app", url: clean, scheme }
}

/* ---------- Wi-Fi (xS 4): standard WIFI: payload ---------- */
function wifiEscape(s) { return String(s).replace(/([\\;,:"])/g, "\\$1") }
function wifiUnescape(s) { return String(s).replace(/\\([\\;,:"])/g, "$1") }

function packWifi(o) {
	const sec = o.security || "WPA"
	let s = "WIFI:T:" + sec + ";S:" + wifiEscape(o.ssid || "") + ";"
	if (sec !== "nopass") s += "P:" + wifiEscape(o.password || "") + ";"
	if (o.hidden) s += "H:true;"
	return s + ";"
}

function parseWifi(str) {
	if (!/^WIFI:/i.test(str)) return null
	const body = str.slice(5)
	const fields = {}
	let cur = "", parts = []
	for (let i = 0; i < body.length; i++) {          // split on unescaped ;
		if (body[i] === "\\" && i + 1 < body.length) { cur += body[i] + body[i + 1]; i++ }
		else if (body[i] === ";") { parts.push(cur); cur = "" }
		else cur += body[i]
	}
	if (cur) parts.push(cur)
	for (const p of parts) {
		const i = p.indexOf(":")
		if (i > 0) fields[p.slice(0, i).toUpperCase()] = wifiUnescape(p.slice(i + 1))
	}
	if (fields.S === undefined) return null
	return { ssid: fields.S, password: fields.P || "", security: fields.T || "WPA", hidden: String(fields.H).toLowerCase() === "true" }
}

/* ---------- Contact (xS 5): vCard 3.0 ---------- */
function vEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;") }
function vUnescape(s) { return String(s).replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1") }

function packContact(o) {
	const L = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + vEscape(o.name || "")]
	if (o.org) L.push("ORG:" + vEscape(o.org))
	if (o.phone) L.push("TEL:" + vEscape(o.phone))
	if (o.email) L.push("EMAIL:" + vEscape(o.email))
	if (o.url) L.push("URL:" + o.url)
	if (o.note) L.push("NOTE:" + vEscape(o.note))
	L.push("END:VCARD")
	return L.join("\n")
}

function parseContact(str) {
	if (!/^BEGIN:VCARD/i.test(str)) return null
	const labels = { FN: "Name", ORG: "Organisation", TEL: "Phone", EMAIL: "Email", URL: "Website", NOTE: "Note" }
	const rows = []
	for (const line of str.split(/\r?\n/)) {
		const i = line.indexOf(":")
		if (i < 0) continue
		const key = line.slice(0, i).split(";")[0].toUpperCase()
		if (labels[key]) rows.push({ key, label: labels[key], value: key === "URL" ? line.slice(i + 1) : vUnescape(line.slice(i + 1)) })
	}
	return rows
}

/* ---------- Link list (xS 6): one link per line, optional "Title | url" ---------- */
function parseLinks(str) {
	const out = []
	for (let line of String(str).split(/\r?\n/)) {
		line = line.trim()
		if (!line) continue
		const bar = line.lastIndexOf("|")
		let title = "", url = line
		if (bar > 0) { title = line.slice(0, bar).trim(); url = line.slice(bar + 1).trim() }
		out.push({ title: title || url, url })
	}
	return out
}

/* ---------- File (xS 8): BYCFILE:<name>:<mime>:<base64> ---------- */
function packFile(name, mime, bytes) {
	let bin = ""
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
	return "BYCFILE:" + encodeURIComponent(name) + ":" + (mime || "application/octet-stream") + ":" + btoa(bin)
}

function parseFile(str) {
	const m = String(str).match(/^BYCFILE:([^:]*):([^:]*):([A-Za-z0-9+\/=]*)$/)
	if (!m) return null
	let name = "file"
	try { name = decodeURIComponent(m[1]) || "file" } catch (e) {}
	const bin = atob(m[3])
	const bytes = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
	return { name, mime: m[2] || "application/octet-stream", bytes }
}

/* ---------- Markdown (xS 7): small, escape-first renderer, output is safe to put into innerHTML ---------- */
function htmlEscape(s) {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function mdInline(src) {
	let s = htmlEscape(src)
	const codes = []
	s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000" })
	s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
	s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
	s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
		const raw = url.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
		const c = classifyUrl(raw)
		if (c.kind !== "safe") return text
		return '<a href="' + htmlEscape(c.url) + '" target="_blank" rel="noopener noreferrer">' + text + "</a>"
	})
	return s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[+i] + "</code>")
}

function renderMarkdown(src) {
	const lines = String(src).replace(/\r\n?/g, "\n").split("\n")
	const out = []
	let list = null, para = [], code = null
	const flushPara = () => { if (para.length) { out.push("<p>" + para.map(mdInline).join("<br>") + "</p>"); para = [] } }
	const flushList = () => { if (list) { out.push("</" + list + ">"); list = null } }
	for (const line of lines) {
		if (code !== null) {
			if (/^```/.test(line)) { out.push("<pre><code>" + htmlEscape(code.join("\n")) + "</code></pre>"); code = null }
			else code.push(line)
			continue
		}
		if (/^```/.test(line)) { flushPara(); flushList(); code = []; continue }
		let m
		if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushPara(); flushList(); out.push("<h" + m[1].length + ">" + mdInline(m[2]) + "</h" + m[1].length + ">"); continue }
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push("<hr>"); continue }
		if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push("<blockquote>" + mdInline(m[1]) + "</blockquote>"); continue }
		if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { flushPara(); if (list !== "ul") { flushList(); out.push("<ul>"); list = "ul" } out.push("<li>" + mdInline(m[1]) + "</li>"); continue }
		if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== "ol") { flushList(); out.push("<ol>"); list = "ol" } out.push("<li>" + mdInline(m[1]) + "</li>"); continue }
		if (!line.trim()) { flushPara(); flushList(); continue }
		flushList(); para.push(line)
	}
	if (code !== null) out.push("<pre><code>" + htmlEscape(code.join("\n")) + "</code></pre>")
	flushPara(); flushList()
	return out.join("\n")
}
