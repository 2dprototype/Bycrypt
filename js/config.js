/* Shared configuration (loaded first). */
const prefixes = [
	"bycrypt.web.app/" != (window.location.host + "/") ? (window.location.host + "/") : "bycrypt.web.app/",
	"bycrypt.web.app/x/",
	"https://bycrypt.web.app/x/",
	""
]

/* Brand logos usable as the small QR label picture (res/icons/<name>.png). */
const brandIcons = [
	"facebook", "google", "instagram", "messenger", "twitter", "whatsapp", "yahoo",
	"gmail", "hellocat", "reddit", "x", "youtube", "link", "website"
]
