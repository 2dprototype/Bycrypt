class Decrypter {
	constructor(){
		var ref = this
		this.element = $("#decrypter")
		this.container = this.element.find(".container")
		this.output = this.element.find(".output")
		this.inputs = this.element.find("input")
		this.buttons = this.element.find("button")
		this.lock = this.element.find(".patternlock")
		this.patternlock = new PatternLock(this.lock[0], {
			onPattern: function(pattern) {
				if (!Number.isNaN(pattern)) {
					if (ref.data == null) return
					var hash = CryptoJS.MD5(pattern.toString()).toString()
					let data = decrypt(ref.data, hash)
					if (data != "") {
						this.success()
						ref.result(data)
					}
					else {
						this.error()
					}
				}
			}
		})
		$(this.inputs[2]).click(function(){
			let key = ""
			if (ref.query.keyType == keyTypeMap.alphanumeric) key = ref.inputs[0].value
			else if (ref.query.keyType == keyTypeMap.pin) key = ref.inputs[1].value
			console.log(ref.data, key)
			let data = decrypt(ref.data, key)
			if (data != "") {
				ref.result(data)
			}
		})
		$(this.inputs[3]).click(function(){
			if (!navigator.geolocation) {
				alert("Geolocation not supported.")
				return
			}
			navigator.geolocation.getCurrentPosition(function(pos){
					const lat = pos.coords.latitude
					const lon = pos.coords.longitude
					const hash = hashWithinRange(lat, lon, 100);
					console.log(ref.data,  hash)
					let data = decrypt(ref.data, hash)
					if (data != "") {
						ref.result(data)
					}
					else {
						alert("Worng Location! Or empty/invalid output!")
					}
				}, 
				function(err) {
					alert(`Error: ${err.message}`)
				},
				{ 
					enableHighAccuracy: true 
				}
			)
		})
		$(this.inputs[4]).click(async function(){
			try {
				let hash = await getFingerprintKeyHash()
				console.log(ref.data,  hash)
				let data = decrypt(ref.data, hash)
				if (data != "") {
					ref.result(data)
				}
				else {
					alert("Worng Fingerprint! Or empty/invalid output!")
				}
			}
			catch (err) {
				alert("Fingerprint failed: " + err.message)
			}
		})
		this.query = null
		this.data = null
	}
	result(data){
		if (this.query.scanType == scanTypeMap.redirect) {
			window.open(data, '_self')
		}
		else if (this.query.scanType == scanTypeMap.download) {
			saveAs(new Blob([data], { type: 'text/plain;charset=utf-8' }), "bycrypt-decrypted-data.txt")
		}
		else {
			this.container.hide()
			this.output.show()
			this.output.find("code").text(data)
		}
	}
	update(data, _query){
		this.container.show()
		this.output.hide()
		let query = parseQuery(_query)
		this.query = query
		this.data = data
		if (query.keyType == keyTypeMap.alphanumeric) {
			$(this.inputs[0]).show()
			$(this.inputs[1]).hide()
			$(this.inputs[2]).show()
			$(this.inputs[3]).hide()
			$(this.inputs[4]).hide()
			this.lock.hide()
		}	
		else if (query.keyType == keyTypeMap.pin) {
			$(this.inputs[0]).hide()
			$(this.inputs[1]).show()
			$(this.inputs[2]).show()
			$(this.inputs[3]).hide()
			$(this.inputs[4]).hide()
			this.lock.hide()
		}
		else if (query.keyType == keyTypeMap.pattern) {
			$(this.inputs[0]).hide()
			$(this.inputs[1]).hide()
			$(this.inputs[2]).hide()
			$(this.inputs[3]).hide()
			$(this.inputs[4]).hide()
			this.lock.show()
		}
		else if (query.keyType == keyTypeMap.location) {
			$(this.inputs[0]).hide()
			$(this.inputs[1]).hide()
			$(this.inputs[2]).hide()
			$(this.inputs[3]).show()
			$(this.inputs[4]).hide()
			this.lock.hide()
		}	
		else if (query.keyType == keyTypeMap.fingerprint) {
			$(this.inputs[0]).hide()
			$(this.inputs[1]).hide()
			$(this.inputs[2]).hide()
			$(this.inputs[3]).hide()
			$(this.inputs[4]).show()
			this.lock.hide()
		}
	}
	hide() {
		this.element.hide()
	}
	show() {
		this.element.show()
	}
}