const initialHash = window.location.hash          // router.navigateTo() drops the #fragment, privacy-mode links need it
const currentHash = () => window.location.hash || initialHash

let _new = new New()
let _decrypter = new Decrypter()
let _home = new Home()
let _batch = new Batch()
let _inspect = new Inspect()
const _pages = [_home, _new, _decrypter, _batch, _inspect]
function showOnly(page) { _pages.forEach(p => (p === page ? p.show() : p.hide())) }

const router = new Router({
	mode: 'history',
	page404: function (data) {
		showOnly(_decrypter)
		_decrypter.update(data, window.location.search, currentHash())
	}
})

router.add(`x/(:any)`, function (data) {
	showOnly(_decrypter)
	_decrypter.update(data, window.location.search, currentHash())
})
router.add(`new`, function () { showOnly(_new) })
router.add(`batch`, function () { showOnly(_batch) })
router.add(`inspect`, function () { showOnly(_inspect); _inspect.update(window.location.search) })
router.add(`/`, function () { showOnly(_home) })

router.addUriListener()

window.onload = function () {
	hydrateIcons(document)
	router.navigateTo(window.location.pathname + window.location.search)
	// navigateTo() rewrites the address bar without the #fragment: put it back so a refresh keeps working
	if (initialHash && !window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search + initialHash)
}
window.addEventListener('beforeunload', function () {
	_new.saveConfig()
})

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
	navigator.serviceWorker.register('/sw.js').catch(function () {})
}
