/*
 * Bycrypt link format - extension layer.
 *
 *   <prefix><payload>?SEK                       legacy link (unchanged, always valid)
 *   <prefix><payload>?SEK~xSxExK                + extended codes
 *   <prefix><payload>?SEK~xSxExK~k=v&k=v       + public (pre-unlock) parameters
 *   <prefix>_?SEK~xSxExK~...#<payload>          privacy mode (xE=2): payload lives in the #fragment
 *
 * The legacy triplet S E K (func.js: scanTypeMap / encodingMap / keyTypeMap) is FROZEN: its meanings never
 * change and every new link still writes it. The old parser only reads indices 0-2 of the query, so
 * everything after the first "~" is invisible to it. "_" in an extended slot means "inherit the legacy slot".
 * Full spec: docs/LINK-FORMAT.md
 */

/* xS - extended scan type. A legacy S is written next to it so older decrypters still show something useful. */
const XS_SCAN = { wifi: "4", contact: "5", links: "6", markdown: "7", file: "8" }
const XS_SCAN_ = revMap(XS_SCAN)
const XS_LEGACY_S = { wifi: "raw", contact: "raw", links: "raw", markdown: "raw", file: "download" }

/* xE - encryption suite / packaging. 0 or "_" = legacy CryptoJS passphrase AES. */
const XE_SUITE = { legacy: "0", enhanced: "1", fragment: "2" }
const XE_SUITE_ = revMap(XE_SUITE)

/* xK - key method. Codes 0-4 are the legacy methods (valid here too), 5+ are new. */
const XK_KEY = {
	alphanumeric: "0", pin: "1", pattern: "2", location: "3", fingerprint: "4",
	icons: "5", hotspots: "6", gridpattern: "7", tiles: "8", melody: "9",
	rhythm: "a", riddle: "b", dial: "c", composite: "d", webauthn: "e", keyfile: "g"
}
const XK_KEY_ = revMap(XK_KEY)

/* Legacy K written beside each method: a "skin" method reuses the nearest legacy key path, so an old
   decrypter shows a plain password / PIN box where the canonical code can be typed by hand. */
const LEGACY_K_FOR = {
	alphanumeric: "0", pin: "1", pattern: "2", location: "3", fingerprint: "4",
	icons: "0", hotspots: "0", gridpattern: "0", tiles: "0", melody: "0",
	rhythm: "0", riddle: "0", dial: "1", composite: "0", webauthn: "_", keyfile: "_"
}

const SAFE_SCAN_LEGACY = ["raw", "redirect", "account", "download"]

function encodeParams(o) {
	return Object.keys(o || {})
		.filter(key => o[key] !== undefined && o[key] !== null && o[key] !== "")
		.map(key => key + "=" + encodeURIComponent(String(o[key])).replace(/~/g, "%7E"))
		.join("&")
}

function decodeParams(s) {
	const o = {}
	if (!s) return o
	for (const part of s.split("&")) {
		if (!part) continue
		const i = part.indexOf("=")
		const key = i < 0 ? part : part.slice(0, i)
		let val = i < 0 ? "" : part.slice(i + 1)
		try { val = decodeURIComponent(val) } catch (e) {}
		o[key] = val
	}
	return o
}

/* Parse a query string ("?102~...") into legacy + extended parts. */
function parseLinkQuery(search) {
	search = String(search || "")
	if (search[0] == "?") search = search.slice(1)
	const hashAt = search.indexOf("#")
	if (hashAt >= 0) search = search.slice(0, hashAt)
	const parts = search.split("~")
	const leg = parseQuery(parts[0])           // legacy parser from make.js (reads indices 0-2 only)
	const ext = parts[1] || ""
	const pad = i => ext[i] ? ext[i] : "_"
	return {
		scanType: leg.scanType, encoding: leg.encoding, keyType: leg.keyType,
		xS: pad(0), xE: pad(1), xK: pad(2),
		params: decodeParams(parts.slice(2).join("~")),
		hasExt: parts.length > 1
	}
}

/* Decide what a parsed link means for this build. Unknown extended codes fall back to the legacy slot. */
function resolveLink(meta) {
	const r = { scan: "raw", key: null, suite: "legacy", unsupported: null, warnings: [] }

	if (meta.xS !== "_" && XS_SCAN_[meta.xS]) r.scan = XS_SCAN_[meta.xS]
	else {
		if (meta.xS !== "_") r.warnings.push("Unknown extended scan type '" + meta.xS + "' - using the legacy scan type.")
		r.scan = scanTypeMap_[meta.scanType] || "raw"          // unknown legacy S behaved as plain text
	}

	if (meta.xE === "_" || meta.xE === "0") r.suite = "legacy"
	else if (XE_SUITE_[meta.xE]) r.suite = XE_SUITE_[meta.xE]
	else r.unsupported = "encryption suite '" + meta.xE + "'"

	if (meta.xK !== "_" && XK_KEY_[meta.xK]) r.key = XK_KEY_[meta.xK]
	else {
		if (meta.xK !== "_") r.warnings.push("Unknown extended key method '" + meta.xK + "' - using the legacy key slot.")
		r.key = keyTypeMap_[meta.keyType] || null
	}
	if (!r.key && !r.unsupported) r.unsupported = "key method '" + (meta.xK !== "_" ? meta.xK : meta.keyType) + "'"
	return r
}

/* Assemble the query string. With no extended features it is byte-identical to the original format. */
function buildQuery(o) {
	let q = (o.S || "_") + (o.E || "_") + (o.K || "_")
	const p = encodeParams(o.params)
	const x = (o.xS || "_") + (o.xE || "_") + (o.xK || "_")
	if (x !== "___" || p) q += "~" + x + (p ? "~" + p : "")
	return q
}

/* privacy mode: the ciphertext goes into #fragment (never sent to the server) behind a "_" placeholder */
function composeLink(o) {
	if (o.fragment) {
		let prefix = o.prefix
		if (!prefix) prefix = (typeof prefixes !== "undefined" ? prefixes[0] : "")
		return prefix + "_?" + o.query + "#" + o.payload
	}
	return o.prefix + o.payload + "?" + o.query
}

/* Human readable meaning of every code (used by the inspector and the creator log). */
const CODE_NAMES = {
	S: { "0": "Text", "1": "Redirect", "2": "Account", "3": "Download" },
	E: { "0": "Base64url", "1": "Base64", "2": "Hex" },
	K: { "0": "Alphanumeric", "1": "PIN", "2": "Pattern", "3": "Location", "4": "Fingerprint" },
	xS: { "4": "Wi-Fi", "5": "Contact card", "6": "Link list", "7": "Markdown note", "8": "File" },
	xE: { "0": "Legacy (CryptoJS)", "1": "Enhanced (PBKDF2 + AES-GCM)", "2": "Enhanced, payload in #fragment" },
	xK: {
		"0": "Alphanumeric", "1": "PIN", "2": "Pattern", "3": "Location", "4": "Fingerprint",
		"5": "Icon sequence", "6": "Picture hotspots", "7": "Grid pattern", "8": "Secret tile order",
		"9": "Melody", "a": "Tap rhythm", "b": "Riddle", "c": "Dial lock", "d": "Composite",
		"e": "Passkey (PRF)", "g": "Key file"
	}
}
