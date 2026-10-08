/*
 * Enhanced suite (xE = 1 or 2).
 *
 *   blob v1 = 0x01 | iter/1000 (u16 BE) | salt (16) | iv (12) | AES-256-GCM(ciphertext + tag)
 *   key     = PBKDF2-HMAC-SHA256(NFKC(canonical key string), salt, iter)
 *   AAD     = first 3 header bytes
 *   plain   = flags (bit0 = raw deflate) | UTF-8 JSON envelope {v, d, nb?, ex?}
 *
 *   container (decoy) = 0x02 | count (u8) | [len (u16 BE) | blob]...   blobs shuffled, each opens with its own key
 *
 * The payload is base64url without padding. Legacy mode (xE = 0/_) keeps using CryptoJS AES (make.js encrypt()).
 */

const BYC_ITER = 200000          // default PBKDF2 rounds
const BYC_ITER_MAX = 1000000     // refuse crafted links that would hang the browser

const B64 = {
	enc(bytes) {
		let s = ""
		for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
		return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
	},
	dec(str) {
		str = String(str).replace(/-/g, "+").replace(/_/g, "/")
		while (str.length % 4) str += "="
		const bin = atob(str)
		const out = new Uint8Array(bin.length)
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
		return out
	}
}

async function deriveAesKey(keyStr, salt, iter) {
	const raw = new TextEncoder().encode(String(keyStr).normalize("NFKC"))
	const km = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"])
	return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, km,
		{ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
}

async function sealBlob(plain, keyStr, iter) {
	iter = iter || BYC_ITER
	const salt = crypto.getRandomValues(new Uint8Array(16))
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const head = new Uint8Array([1, (iter / 1000) >> 8 & 255, (iter / 1000) & 255])
	const key = await deriveAesKey(keyStr, salt, iter)
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: head }, key, plain))
	const out = new Uint8Array(3 + 16 + 12 + ct.length)
	out.set(head, 0); out.set(salt, 3); out.set(iv, 19); out.set(ct, 31)
	return out
}

/* Returns plaintext bytes or null when the key is wrong / the data was altered. */
async function openBlob(blob, keyStr) {
	if (blob.length < 31 + 16 || blob[0] !== 1) return null
	const iter = ((blob[1] << 8) | blob[2]) * 1000
	if (iter < 1000 || iter > BYC_ITER_MAX) return null
	try {
		const key = await deriveAesKey(keyStr, blob.subarray(3, 19), iter)
		return new Uint8Array(await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: blob.subarray(19, 31), additionalData: blob.subarray(0, 3) }, key, blob.subarray(31)))
	} catch (e) { return null }
}

function packEnvelope(env, compress) {
	let body = new TextEncoder().encode(JSON.stringify(env))
	let flags = 0
	if (compress && typeof pako !== "undefined") {
		const z = pako.deflateRaw(body)
		if (z.length < body.length) { body = z; flags |= 1 }
	}
	const out = new Uint8Array(body.length + 1)
	out[0] = flags; out.set(body, 1)
	return out
}

function unpackEnvelope(bytes) {
	let body = bytes.subarray(1)
	if (bytes[0] & 1) body = pako.inflateRaw(body)
	return JSON.parse(new TextDecoder().decode(body))
}

function shuffleInPlace(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
		const t = arr[i]; arr[i] = arr[j]; arr[j] = t
	}
	return arr
}

/* o: {data, key, nb?, ex?, compress?, decoy?: {data, key}, iter?} -> base64url payload */
async function enhancedEncrypt(o) {
	const env = { v: 1, d: o.data }
	if (o.nb) env.nb = o.nb
	if (o.ex) env.ex = o.ex
	const real = await sealBlob(packEnvelope(env, o.compress), o.key, o.iter)
	if (!o.decoy) return B64.enc(real)
	if (o.decoy.key === o.key) throw new Error("The decoy key must differ from the real key.")
	const fake = await sealBlob(packEnvelope({ v: 1, d: o.decoy.data }, o.compress), o.decoy.key, o.iter)
	const blobs = shuffleInPlace([real, fake])
	const out = new Uint8Array(2 + blobs.reduce((n, b) => n + 2 + b.length, 0))
	out[0] = 2; out[1] = blobs.length
	let at = 2
	for (const b of blobs) { out[at++] = b.length >> 8; out[at++] = b.length & 255; out.set(b, at); at += b.length }
	return B64.enc(out)
}

function splitBlobs(bytes) {
	if (bytes[0] === 1) return [bytes]
	if (bytes[0] !== 2) return []
	const blobs = []
	let at = 2
	for (let i = 0; i < bytes[1]; i++) {
		const len = (bytes[at] << 8) | bytes[at + 1]; at += 2
		if (at + len > bytes.length) return []
		blobs.push(bytes.subarray(at, at + len)); at += len
	}
	return blobs
}

/* Try every candidate key against every blob. onProgress(done,total) is optional. Returns envelope or null. */
async function enhancedDecrypt(payload, candidates, onProgress) {
	let bytes
	try { bytes = B64.dec(payload) } catch (e) { return null }
	const blobs = splitBlobs(bytes)
	const total = blobs.length * candidates.length
	let done = 0
	for (const cand of candidates) {
		for (const blob of blobs) {
			const plain = await openBlob(blob, cand)
			if (onProgress) onProgress(++done, total)
			if (plain) { try { return unpackEnvelope(plain) } catch (e) { return null } }
		}
	}
	return null
}

/* Legacy decrypt that never throws (CryptoJS throws "Malformed UTF-8" for many wrong keys). */
function legacyDecryptSafe(payload, key) {
	try { return decrypt(payload, key) } catch (e) { return "" }
}

/* Build a complete link. Legacy mode with legacy options is byte-for-byte the original format.
   o: {scan, data, prefix, keyMethod, key, params, mode:'legacy'|'enhanced', fragment, compress, nb, ex, decoy, encoding, iter} */
async function makeLink(o) {
	const isExtScan = !!XS_SCAN[o.scan]
	const S = scanTypeMap[isExtScan ? XS_LEGACY_S[o.scan] : o.scan] || "_"
	const E = encodingMap[o.encoding || "Base64url"] || "_"
	const K = LEGACY_K_FOR[o.keyMethod] || "_"
	const xS = isExtScan ? XS_SCAN[o.scan] : "_"
	const code = XK_KEY[o.keyMethod]
	const xK = (code && "01234".indexOf(code) < 0) ? code : "_"
	const enhanced = o.mode === "enhanced"
	const fragment = enhanced && !!o.fragment && true
	let payload
	if (enhanced) {
		payload = await enhancedEncrypt({ data: o.data, key: o.key, nb: o.nb, ex: o.ex, compress: o.compress, decoy: o.decoy, iter: o.iter })
	} else {
		if (o.decoy || o.nb || o.ex || o.compress) throw new Error("Decoy, schedule and compression need Enhanced mode.")
		payload = encrypt(o.data, o.key)
	}
	const xE = enhanced ? (fragment ? XE_SUITE.fragment : XE_SUITE.enhanced) : "_"
	const query = buildQuery({ S, E, K, xS, xE, xK, params: o.params })
	const link = composeLink({ prefix: o.prefix, payload, query, fragment })
	return { link, payload, query, fragment, compatLegacy: !enhanced }
}
