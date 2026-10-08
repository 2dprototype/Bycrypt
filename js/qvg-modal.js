/*
 * QVG Vector Image Modal Designer & Converter.
 * Allows importing SVG graphics or writing QVG vector code
 * for Picture Hotspots and Secret Tile Order puzzles.
 */

function openQvgModal(opts) {
	opts = opts || {}
	const onApply = opts.onApply || (() => {})
	let activePayload = opts.currentPayload ? qvgPayloadOf(opts.currentPayload) : DEFAULT_QVG_PAYLOAD
	let activeSource = ""

	try {
		activeSource = QVG.stringify(QVG.decode(activePayload))
	} catch (e) {
		activeSource = DEFAULT_QVG_SOURCE
	}

	// Remove existing modal if any
	const old = document.getElementById("qvg-modal-backdrop")
	if (old) old.remove()

	const backdrop = h("div", { id: "qvg-modal-backdrop", class: "qvg-backdrop" })
	const modal = h("div", { class: "qvg-modal card", role: "dialog", "aria-modal": "true", "aria-labelledby": "qvg-modal-title" })

	// Header
	const title = h("h3", { id: "qvg-modal-title", style: "margin:0;" },
		iconEl("palette", 20),
		h("span", {}, "QVG Designer")
	)
	const closeBtn = h("button", { type: "button", class: "btn icon-only", style: "background:transparent;color:var(--text);font-size:1.4em;padding:4px 8px;", title: "Close" }, "✕")
	closeBtn.addEventListener("click", () => backdrop.remove())
	const head = h("div", { class: "qvg-head" }, title, closeBtn)

	// Subtitle / explanation
	const sub = h("p", { class: "hint", style: "margin: 4px 0 12px;" },
		"Import an SVG file or write vector commands. Vector graphics are embedded directly into your encrypted link."
	)

	// Layout: Left editor / tabs, Right preview
	const body = h("div", { class: "qvg-body" })
	const left = h("div", { class: "qvg-left" })
	const right = h("div", { class: "qvg-right" })

	// Preview box
	const previewBox = h("div", { class: "qvg-preview-wrap" })
	const previewStage = h("div", { class: "qvg-preview-stage" })
	const infoBar = h("div", { class: "qvg-info-bar" })
	previewBox.append(previewStage, infoBar)
	right.append(previewBox)

	function updatePreview() {
		previewStage.innerHTML = ""
		try {
			const svg = sceneSvg("qvg:" + activePayload, 220)
			previewStage.innerHTML = svg
			const info = QVG.info(activePayload)
			infoBar.innerHTML = `<span><strong>${info.chars}</strong> chars (${info.bytes} B)</span>` +
				`<span class="badge ${info.easyScan ? "badge-ok" : "badge-warn"}">${info.easyScan ? "QR Alphanumeric Safe" : "Large QR"}</span>`
		} catch (err) {
			previewStage.innerHTML = `<div class="qvg-error">${err.message || "Invalid QVG"}</div>`
			infoBar.innerHTML = `<span class="badge badge-bad">Error</span>`
		}
	}

	// Tabs: Import SVG & QVG Code
	const tabsBar = h("div", { class: "qvg-tabs" })
	const tabSvg = h("button", { type: "button", class: "qvg-tab-btn on" }, "Import SVG")
	const tabCode = h("button", { type: "button", class: "qvg-tab-btn" }, "QVG Code")
	tabsBar.append(tabSvg, tabCode)

	const panelSvg = h("div", { class: "qvg-panel" })
	const panelCode = h("div", { class: "qvg-panel", style: "display:none;" })

	function setTab(idx) {
		[tabSvg, tabCode].forEach((b, i) => b.classList.toggle("on", i === idx));
		panelSvg.style.display = idx === 0 ? "block" : "none"
		panelCode.style.display = idx === 1 ? "block" : "none"
	}
	tabSvg.addEventListener("click", () => setTab(0))
	tabCode.addEventListener("click", () => {
		try {
			codeArea.value = QVG.stringify(QVG.decode(activePayload))
		} catch (e) {}
		setTab(1)
	})

	// Panel 1: SVG Import
	const svgDropZone = h("div", { class: "qvg-dropzone" },
		iconEl("upload", 22),
		h("span", {}, "Drop .svg file here or "),
		h("label", { class: "btn small", style: "margin:0 4px;" },
			"Browse",
			h("input", { type: "file", accept: ".svg", style: "display:none;" })
		)
	)
	const fileInput = svgDropZone.querySelector("input")
	const svgArea = h("textarea", { rows: 6, placeholder: "Or paste <svg>...</svg> markup here...", style: "font-size:0.85em;margin-top:8px;" })
	const svgStatus = h("div", { class: "hint", style: "min-height:1.4em;" })
	const convertBtn = h("button", { type: "button", class: "btn primary", style: "margin-top:6px;" },
		iconEl("play", 16),
		h("span", {}, "Convert to QVG")
	)

	function processSvgText(text) {
		try {
			const res = QVG.fromSVG(text, { prec: 2 })
			activePayload = res.payload
			activeSource = res.source
			svgStatus.textContent = `Converted: ${res.payload.length} chars payload` + (res.warnings && res.warnings.length ? ` (${res.warnings.length} warnings)` : "")
			svgStatus.style.color = "var(--ok)"
			updatePreview()
		} catch (err) {
			svgStatus.textContent = "Conversion error: " + err.message
			svgStatus.style.color = "var(--bad)"
		}
	}

	fileInput.addEventListener("change", e => {
		const f = e.target.files[0]
		if (!f) return
		const reader = new FileReader()
		reader.onload = ev => {
			svgArea.value = ev.target.result
			processSvgText(ev.target.result)
		}
		reader.readAsText(f)
	})
	convertBtn.addEventListener("click", () => processSvgText(svgArea.value))
	svgDropZone.addEventListener("dragover", e => { e.preventDefault(); svgDropZone.classList.add("dragover") })
	svgDropZone.addEventListener("dragleave", () => svgDropZone.classList.remove("dragover"))
	svgDropZone.addEventListener("drop", e => {
		e.preventDefault()
		svgDropZone.classList.remove("dragover")
		const f = e.dataTransfer.files[0]
		if (f) {
			const reader = new FileReader()
			reader.onload = ev => {
				svgArea.value = ev.target.result
				processSvgText(ev.target.result)
			}
			reader.readAsText(f)
		}
	})

	panelSvg.append(svgDropZone, svgArea, convertBtn, svgStatus)

	// Panel 2: QVG Code
	const codeArea = h("textarea", { rows: 9, style: "font-size:0.85em;font-family:Ubuntu Sans Mono,monospace;", placeholder: "grid 100 100\nbg #000\nf #0af\nc 50 50 30" }, activeSource)
	const codeHint = h("p", { class: "hint", style: "margin:4px 0;" }, "Commands: grid W H · bg #c · f #c · s #c · w n · r x y w h · rr x y w h rx · c cx cy r · star cx cy R r n rot · ring cx cy R r")
	codeArea.addEventListener("input", () => {
		try {
			activePayload = QVG.compile(codeArea.value)
			updatePreview()
		} catch (e) {
			// typing in progress
		}
	})
	panelCode.append(codeArea, codeHint)

	left.append(tabsBar, panelSvg, panelCode)
	body.append(left, right)

	// Footer actions
	const foot = h("div", { class: "qvg-foot" })
	const resetDefBtn = h("button", { type: "button", class: "btn", title: "Reset to basic default vector image" }, "Use Basic Default")
	resetDefBtn.addEventListener("click", () => {
		activePayload = DEFAULT_QVG_PAYLOAD
		activeSource = DEFAULT_QVG_SOURCE
		try { codeArea.value = activeSource } catch (e) {}
		updatePreview()
	})
	const applyBtn = h("button", { type: "button", class: "btn primary big" },
		iconEl("check", 18),
		h("span", {}, "Apply to Puzzle")
	)
	const cancelBtn = h("button", { type: "button", class: "btn" }, "Cancel")

	applyBtn.addEventListener("click", () => {
		onApply(activePayload)
		backdrop.remove()
	})
	cancelBtn.addEventListener("click", () => backdrop.remove())
	foot.append(resetDefBtn, h("span", { style: "flex:1" }), cancelBtn, applyBtn)

	modal.append(head, sub, body, foot)
	backdrop.append(modal)
	document.body.append(backdrop)

	updatePreview()
}
