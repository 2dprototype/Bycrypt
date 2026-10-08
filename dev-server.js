/* Tiny static server with SPA fallback for local development:  node dev-server.js [port]  ->  http://localhost:8080 */
const http = require("http"), fs = require("fs"), path = require("path")
const port = parseInt(process.argv[2]) || 8080
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" }
http.createServer((req, res) => {
	let p = decodeURIComponent(req.url.split("?")[0].split("#")[0])
	let file = path.join(__dirname, path.normalize(p))
	if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(__dirname, "index.html")
	res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" })
	fs.createReadStream(file).pipe(res)
}).listen(port, () => console.log("Bycrypt dev server: http://localhost:" + port))
