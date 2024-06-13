let _new = new New()
let _decrypter = new Decrypter()
let _home = new Home()

const router = new Router({
    mode: 'history',
    page404: function (data) {
		_home.hide()
		_new.hide()
		_decrypter.show()
		_decrypter.update(data, window.location.search)
	}
})

router.add(`x/(:any)`, function (data) {
	_home.hide()
	_new.hide()
	_decrypter.show()
	_decrypter.update(data, window.location.search)
})

router.add(`new`, function (data) {
	_home.hide()
	_new.show()
	_decrypter.hide()
})

router.add(`/`, function (data) {
	_home.show()
	_new.hide()
	_decrypter.hide()
})

router.addUriListener()

window.onload = function(){
	router.navigateTo(window.location.pathname + window.location.search)
	_new.loadConfig()
}
window.addEventListener('beforeunload', function (e) {
    _new.saveConfig()
});
