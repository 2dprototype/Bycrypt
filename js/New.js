let w = window.location.host + "/" 
const prefixes = [
	"bycrypt.web.app/" != w ? w : "bycrypt.web.app/",
	"bycrypt.web.app/x/",
	"https://bycrypt.web.app/x/",
	""
]

const icons = [
	"facebook",
	"google",
	"instagram",
	"messenger",
	"twitter",
	"whatsapp",
	"yahoo",
	"gmail",
	"hellocat",
	"reddit",
	"x",
	"youtube",
	"link",
	"website"
]

class New {
	constructor() {
		var ref = this
		this.element = $("#new")
		this.inputs = this.element.find("input")
		this.buttons = this.element.find("button")
		this.selects = this.element.find("select")
		this.canvases = this.element.find("canvas")
		this.textareas = this.element.find("textarea")
		this.codes = this.element.find("code")
		this.iconPicker = this.element.find("#icon-picker")
		this.lock = this.element.find(".patternlock")
		this.patternlock = new PatternLock(this.lock[0], {
			onPattern: function(pattern) {
				if (!Number.isNaN(pattern)) {
					ref.inputs[1].value = CryptoJS.MD5(pattern.toString()).toString()
				}
			}
		})
		this.lock.hide()
		this._map = {
			map: null,
			vectorLayer: null,
			elm_map: $("#map"),
			elm_btn: $("#map-btn")
		}
		for (let t of prefixes) {
            var newOption = document.createElement("option");
            newOption.value = t;
            newOption.textContent = t != "" ? t : "None";
            this.selects[1].appendChild(newOption);
		}	
		for (let icon of icons) {
			let im = new Image()
			im.setAttribute("class", "xicon")
			im.src = `/res/icons/${icon}.png`
			im.height = 32
			im.width = 32
			$(im).click(function(){
				$(".xicon").css("background-color", "transparent")
				this.style.backgroundColor = "#ebebeb"
				ref.imgData = this.src
				let txt = icon[0].toUpperCase() + icon.slice(1)
				ref.inputs[3].value = txt
			})
            this.iconPicker.append(im);
		}
		this.imgData = null
		$(this.selects[3]).change(function(){
			if (this.value == "alphanumeric") {
				$(ref.lock).hide()
				$(ref.inputs[1]).show()
				ref.inputs[1].disabled = false
				$(ref.inputs[2]).hide()
				$(ref._map.elm_map).hide()
				$(ref._map.elm_btn).hide()
				$("#fingerprint-btn").hide()
			}
			else if (this.value == "pin") {
				$(ref.lock).hide()
				$(ref.inputs[1]).hide()
				$(ref.inputs[2]).show()
				$(ref._map.elm_map).hide()
				$(ref._map.elm_btn).hide()
				$("#fingerprint-btn").hide()
			}	
			else if (this.value == "pattern") {
				$(ref.lock).show()
				$(ref.inputs[1]).show()
				ref.inputs[1].disabled = true
				$(ref.inputs[2]).hide()
				$(ref._map.elm_map).hide()
				$(ref._map.elm_btn).hide()
				$("#fingerprint-btn").hide()
			}
			else if (this.value == "location") {
				$(ref.lock).hide()
				$(ref.inputs[1]).show()
				ref.inputs[1].disabled = true
				$(ref.inputs[2]).hide()
				$(ref._map.elm_map).show()
				$(ref._map.elm_btn).show()
				$("#fingerprint-btn").hide()
			}
			else if (this.value == "fingerprint") {
				$(ref.lock).hide()
				$(ref.inputs[1]).show()
				ref.inputs[1].disabled = true // make the field readonly
				$(ref.inputs[2]).hide()
				$(ref._map.elm_map).hide()
				$(ref._map.elm_btn).hide()
				$("#fingerprint-btn").show()
			}

		})
		$(this.inputs[8]).click(function(){
			var input = document.createElement('input')
			input.type = 'file'
			input.setAttribute('accept', "image/*")
			input.click();
			input.addEventListener('change', function (e) {
				if (e.target.files[0].name) {
					let file = e.target.files[0]
					var reader = new FileReader();
					reader.readAsDataURL(e.target.files[0])
					ref.img_name = e.target.files[0].name
					reader.onload = function (f) {
						let im = new Image()
						im.setAttribute("class", "xicon")
						im.src = f.target.result
						im.height = 32
						im.width = 32
						$(im).click(function(){
							$(".xicon").css("background-color", "transparent")
							this.style.backgroundColor = "#ebebeb"
							ref.imgData = this.src
						})
						ref.iconPicker.append(im);
					}
				}
			})
		})
		$(this.buttons[0]).click(async function() {
			try {
				ref.inputs[1].value = await getFingerprintKeyHash()
			}
			catch (err) {
				alert("Fingerprint failed: " + err.message)
			}
		})

		$(this.buttons[1]).click(function(){
			ref.generateLocationHash()
		})	
		$(this.buttons[2]).click(function(){
			ref.generate()
		})	
		$(this.buttons[3]).click(function(){
			ClipboardJS.copy(ref.codes[0].innerText)
		})	
		$(this.buttons[4]).click(function(){
			ref.canvases[0].toBlob(function(blob){
				saveAs(blob, "qrcode-exported-bycrypt.png")
			}, "image/png")
		})
	}
	hide() {
		this.element.hide()
	}
	show() {
		this.element.show()
	}
	generateLocationHash () {
		var ref = this

		if (!navigator.geolocation) {
			alert("Geolocation not supported.")
			return
		}

		navigator.geolocation.getCurrentPosition(function(pos){
				const lat = pos.coords.latitude
				const lon = pos.coords.longitude
				ref.inputs[1].value = hashWithinRange(lat, lon, 100);

				ref.showMap(lat, lon, 50)
			}, 
			function(err) {
				alert(`Error: ${err.message}`)
			},
			{ 
				enableHighAccuracy: true 
			}
		)
	}
	showMap (lat, lon, radius=100) {
		var ref = this
		const userPoint = ol.proj.fromLonLat([lon, lat])

		const circle = new ol.geom.Circle(userPoint, radius) // 100 meters
		const circleFeature = new ol.Feature(circle)
		const pointFeature = new ol.Feature(new ol.geom.Point(userPoint))

		const styleCircle = new ol.style.Style({
			stroke: new ol.style.Stroke({ color: '#00a1f5', width: 1 }),
			fill: new ol.style.Fill({ color: 'rgba(0, 161, 245, 0.25)' })
		})

		const stylePoint = new ol.style.Style({
			image: new ol.style.Circle({
				radius: 4,
				fill: new ol.style.Fill({ color: '#00a1f5' }),
				stroke: new ol.style.Stroke({ color: '#fff', width: 1 })
			})
		})

		circleFeature.setStyle(styleCircle);
		pointFeature.setStyle(stylePoint);

		this._map.vectorLayer = new ol.layer.Vector({
			source: new ol.source.Vector({
				features: [circleFeature, pointFeature]
			})
		})

		if (!this._map.map) {
			let source = new ol.source.OSM({attributions: []})
			this._map.map = new ol.Map({
				target: 'map',
				layers: [new ol.layer.Tile({source: source}), this._map.vectorLayer],
					view: new ol.View({
					center: userPoint,
					zoom: 17
				})
			})
			this._map.map.on('click', function (event) {
				const lonLat = ol.proj.toLonLat(event.coordinate)

				const lon = lonLat[0];
				const lat = lonLat[1];
				ref.inputs[1].value = hashWithinRange(lat, lon, 100);

				// console.log(`Clicked at Longitude: ${lon}, Latitude: ${lat}`);
			})
		} 
		else {
			this._map.map.getView().setCenter(userPoint);
			this._map.map.getView().setZoom(17);
			this._map.map.getLayers().setAt(1, this._map.vectorLayer)
		}
	}
	getPassword(){
		var keyType = this.selects[3].value
		if (keyType == "pin") return this.inputs[2].value
		else return this.inputs[1].value
	}
	generate(){
		try {
			let canvas = this.canvases[0]
			$(canvas).show()
			$(this.buttons[3]).show()
			$(this.buttons[4]).show()
			var _data = this.textareas[0].value
			var scanType = this.selects[0].value
			var prefix = this.selects[1].value
			var encoding = this.selects[2].value
			var keyType = this.selects[3].value
			var key = this.getPassword()
			var data = make(scanType, prefix, encoding, keyType, key, _data)
			let hash = CryptoJS.MD5(data).toString()
			
			this.codes[0].innerText = data
			
			var context = this.canvases[0].getContext("2d")
			var label = this.inputs[3].value
			var labelSize = parseFloat(this.inputs[4].value)
			var labelColor = this.inputs[5].value
			var labelX = parseFloat(this.inputs[6].value)
			var labelY = parseFloat(this.inputs[7].value)
			
			var bg = this.inputs[9].value
			var qrbg = this.inputs[10].value
			var qrfg = this.inputs[11].value
			var correctLevel = this.selects[4].value

			this.codes[1].innerText = makeLog(
				["scanType", scanType],
				["prefix", prefix],
				["keyType", keyType],
				["key", hideKey(key)],
				["label", label],
				["labelColor", labelColor],
				["labelXY", `(${labelX}, ${labelY})`],
				["background", bg],
				["qrBackground", qrbg],
				["qrForeground", qrfg],
				["correctLevel", correctLevel],
				["length", data.length],
				["hash", hash],
			)

			// console.log(qrbg)
			// console.log(qrfg)
			var qrcode = new QRCode(document.createElement("div"), {
				text: data,
				width: 500,
				height: 500,
				colorDark : qrfg,
				colorLight : qrbg,
				correctLevel : QRCode.CorrectLevel[correctLevel]
			})	
			
			context.reset()
			context.fillStyle = bg;
			context.fillRect(0, 0, canvas.width, canvas.height)
			var qrCanvas = qrcode._oDrawing._elCanvas;
			context.drawImage(qrCanvas, 0, 0);

			if (this.imgData != null) {
				let im = new Image()
				im.src = this.imgData
				im.onload = function() {
					context.drawImage(im, 10, 510, 80, 80);
				}
			}

			// Draw additional content on top of the QR code
			context.fillStyle = labelColor;
			context.font = labelSize + "px Arial";
			context.fillText(label, 115  + labelX, 550 + labelSize/3 + labelY);
		}
		catch(err) {
			alert(err)
		}
	}
	getConfig(){
		let obj = {
			inputs: [],
			selects: []
		}
		let i = 0
		for (let input of this.inputs) {
		if (i == 1 || i == 2 || i == 3) obj.inputs.push(null)
			else obj.inputs.push(input.value)
			i++
		}
		i = 0
		for (let select of this.selects) {
			if (i == 3) obj.selects.push(null)
			else obj.selects.push(select.value)
			i++
		}
		return obj
	}
	saveConfig(){
		localStorage.setItem("bycryptConfig", JSON.stringify(this.getConfig()))
	}	
	loadConfig(){
		let data = localStorage.getItem("bycryptConfig")
		let obj = JSON.parse(data)
		for (let i in obj.inputs) {
			let v = obj.inputs[i]
			if (v != null) this.inputs[i].value = v
		}
		for (let i in obj.selects) {
			let v = obj.selects[i]
			if (v != null) this.selects[i].value = v
		}
	}
}