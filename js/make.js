function revMap(map){
	let _map = {}
	for (k in map) {
		let v = map[k]
		_map[v] = k
	}
	return _map
}


const scanTypeMap = {
	"raw":         "0",
	"redirect":    "1",
	"account":     "2",
	"download":    "3"
}
const scanTypeMap_ = revMap(scanTypeMap)
const encodingMap = {
	"Base64url":    "0",
	"Base64":       "1",
	"Hex":          "2"
}
const encodingMap_ = revMap(encodingMap)
const keyTypeMap = {
	"alphanumeric":    "0",
	"pin":             "1",
	"pattern":         "2",
	"location":        "3",
	"fingerprint":     "4"
}
const keyTypeMap_ = revMap(keyTypeMap)



function encrypt(v, k){
	return CryptoJS.AES.encrypt(v, k).toString().replaceAll("/", "_").replaceAll("+", "-").replaceAll("=", "")
}

function decrypt(v, k){
	v = v.replaceAll("_", "/").replaceAll("-", "+")
	return CryptoJS.AES.decrypt(v, k).toString(CryptoJS.enc.Utf8)
}

function make(scanType, prefix, encoding, keyType, key, data) {
	// console.log(scanType, prefix, encoding, keyType, key, data)
	let cytext = prefix
	// cytext += CryptoJS.AES.encrypt(data, key).ciphertext.toString(CryptoJS.enc[encoding])
	cytext += encrypt(data, key)
	cytext += "?"
	cytext += scanTypeMap[scanType] ? scanTypeMap[scanType] : "_"
	cytext += encodingMap[encoding] ? encodingMap[encoding] : "_"
	cytext += keyTypeMap[keyType] ? keyTypeMap[keyType] : "_"
	
	return cytext
}

function parseQuery(str){
	if (str[0] == "?") str = str.slice(1)
	let obj = {
		scanType: null,
		encoding: null,
		keyType: null
	}
	for (let i in str) {
		let v = str[i]
		if (i == 0) obj.scanType = v
		else if (i == 1) obj.encoding = v
		else if (i == 2) obj.keyType = v
	}
	return obj
}

function makeLog(...args) {
	var str = ""
	for(a of args) str += `${a[0]}: ${a[1]}\n`
	return str.trim()
}

function hideKey(str) {
	let out = ""
	for (s of str) out += "*"
	return out
}