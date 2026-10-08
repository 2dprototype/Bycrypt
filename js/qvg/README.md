# QVG v4 – QR Vector Graphics

SVG-complete vector format built to live inside QR codes, plus an **SVG → QVG converter**.
Pipeline: source text → commands → bit-packed (delta coords, Exp-Golomb, usage-sorted palette) → **base41** → QR **alphanumeric mode**.
Base41 = the QR alphanumeric set minus space, `%`, `+`, `/`: `0-9 A-Z - . $ * :` — every char is URL-safe (path, query, fragment, no percent-encoding) and packs 2 bytes into 3 chars, so it is as dense as Base45.

| File | What |
|---|---|
| `qvg.js` | library (browser + Node, no deps): parse / encode / decode / toSVG / toCanvas |
| `svg2qvg.js` | `QVG.fromSVG(svgText,{prec})` – browser only (uses DOM for CSS cascade, units, bounding boxes) |
| `converter.html` | drop an SVG → QVG payload, with live pixel-diff against the original |
| `editor.html` | draw directly in QVG, live payload + size meter |
| `test.html` | library test bench · `test/fidelity.html` converter fidelity suite |
| `npm test` | Node round-trip tests · `python3 test/browser-test.py` Chromium fidelity tests (needs playwright) |

## API
```js
const pay = QVG.compile(src);                 // source -> Base45 payload
QVG.decode(pay) / QVG.stringify(program);     // payload -> program -> source
QVG.toSVG(x) / QVG.toCanvas(x, canvas, 512);  // x = source | payload | program
const r = QVG.fromSVG(svgText, {prec: 2});    // {payload, source, program, warnings, info}
QVG.info(pay);                                // chars, bytes, QR mode, which ECC levels fit
QVG.toURL(pay,'https://q.example.com/');      // -> HTTPS://Q.EXAMPLE.COM/<PAYLOAD>  (also 'hash' | 'query' mode)
QVG.decode(url) / QVG.fromURL(url);           // decode accepts a bare payload or any of those URL forms
```
`prec` = decimals kept (0-3). Auto-picked losslessly inside the codec; the converter UI can also auto-pick the smallest `prec` that is visually identical.

## What the converter handles
Shapes (rect+rx/ry, circle, ellipse, line, polyline, polygon), **all path commands** (M L H V C S Q T A Z, absolute/relative, implicit repeats, packed arc flags; smooth curves compress to `s`/`t`), nested groups, any `transform` (matrix/skew/rotate), `<use>`/`<symbol>` (inlined), CSS `<style>`/classes/ids/inheritance/currentColor/named colors/rgb()/hsl() (via computed style), fill/stroke opacity, element and group opacity, fill-rule, stroke width/cap/join/miter/dash/offset, linear+radial gradients (multi-stop, stop-opacity, `href` inheritance, objectBoundingBox & userSpaceOnUse, gradientTransform, focal point, pad/reflect/repeat), clipPath (userSpace + objectBoundingBox, multi-shape, transformed children), viewBox with offset, % and units, text (family class, size, weight, italic, tspan runs).

**Not convertible (warned, never silent):** `<pattern>`, `<mask>`, `<filter>`, `<marker>`, `<image>`, animation/SMIL, scripts, `foreignObject`, text on a path / per-glyph rotate, `<symbol>` viewBox scaling, nested `<svg viewBox>` scaling, `preserveAspectRatio` (QVG canvas = the viewBox). Text uses system fonts (shape differs on other machines, like any SVG). Fonts are 3 generic families.
Canvas rendering fakes nothing it can't do exactly except: group/element opacity uses offscreen layers (exact), gradient spread is emulated over ±6 periods (exact for practical sizes). `toSVG` output is always exact.

**"Identical"** means: coordinates rounded to `prec` decimals and colors exact. Measured in headless Chromium on the sample suite: mean difference ≤ 0.17/255 and ≤ 0.4 % of pixels differing by >24 levels (anti-aliasing at hairlines). Run the suite yourself; `converter.html` shows the diff for your own file.

## Source syntax
One command per line (or `;`), `//` comments, decimals allowed. Colors `#rgb` (cheap: 13 bits) / `#rrggbb` (25 bits) / `-` for none. A line starting with `#color` = `f #color`. State works like canvas.

| Command | Meaning |
|---|---|
| `grid W [H]` · `bg #c` | canvas size (decimals ok) · fill background (after `grid`) |
| `f #c` `s #c` `w n` | fill / stroke / width |
| `fo` `so` `al` `go` 0-1000 | fill-, stroke-, element-, group-opacity (permille); `go` after `sv` |
| `fr 0/1` | fill rule nonzero/evenodd |
| `cap` `join` 0-2 · `ml n` · `dash a b …` (none = solid) · `do n` | stroke style |
| `gl x1 y1 x2 y2 spread M stops…` | define linear gradient #n. `spread` 0 pad 1 reflect 2 repeat; `M` = `a,b,c,d,e,f` or `-`; stops `0:#f00` `0.5:#00f:0.4` (offset:color[:opacity]) |
| `gr cx cy r fx fy spread M stops…` | radial gradient |
| `fg n` / `sg n` | use gradient n as fill / stroke |
| `lg x1 y1 x2 y2 #a #b` · `rg cx cy r #a #b` | shortcuts: define + fill in one line |
| `r x y w h` · `rr x y w h rx [ry]` · `c cx cy r` · `e cx cy rx ry` | primitives |
| `ln x1 y1 x2 y2` · `pl x y …` · `p x y …` | line · polyline · polygon |
| `d x y <segs>` | path, segments relative: `l dx dy` `h` `v` `m dx dy` `q cx cy ex ey` `t ex ey` `c c1x c1y c2x c2y ex ey` `s c2x c2y ex ey` `a rx ry rot large sweep dx dy` `z` |
| built-ins | `star cx cy R r n rot` · `ngon cx cy R n rot` · `ring cx cy R r` · `heart cx cy s` · `gear cx cy R r teeth` · `plus cx cy s thick` · `pie`/`arc cx cy r a0 a1` |
| `t x y size TEXT` · `ta 0-2` · `ft family(0 sans,1 serif,2 mono) weight(1-9) italic` | text (avoid `;`) |
| `sv` / `rs` | save / restore state + transform |
| `tr dx dy` `ro deg` `sc sx sy` `mx a b c d e f` | transforms |
| `clip n` | next n shapes are unioned into a clip region (until `rs`) |
| `x n dx dy` · `xr n deg cx cy` | repeat last shape n times shifted / rotated about a point |
| `mir axisX` · `mih axisY` | mirror everything drawn so far (top level only) |
| `df` … `de` · `us i dx dy` | define a reusable block (no gradients inside) / use it |

## URLs
`QVG.toURL(payload, base, mode)` upper-cases scheme+host (case-insensitive) so the whole string stays in QR **alphanumeric mode**:
* `path` (default): `HTTPS://Q.EXAMPLE.COM/<PAYLOAD>` – smallest QR. `#`, `?`, `=` are *not* alphanumeric characters, so the other two modes switch the QR to byte mode (~45 % more data). Needs the server to serve `viewer.html` for any path (GitHub Pages: copy it to `404.html`; Netlify: `/* /viewer.html 200`; nginx: `try_files $uri /viewer.html`). Keep the base path empty or upper-case.
* `hash`: `HTTPS://HOST/#<PAYLOAD>` – works on any static host, never sent to the server. `query`: `HTTPS://HOST/?q=<PAYLOAD>`.
`viewer.html` renders whatever URL it is opened with (`#…`, `?q=…`, or a rewritten path) and offers an SVG download. Host `qvg.js` + `viewer.html` anywhere.

## QR tips
~5.5 bits per char. v40 alphanumeric capacity: L 4296 · M 3391 · Q 2420 · H 1852 chars; keep < ~1000 for reliable phone scans. Generate the QR from the payload (or URL) in alphanumeric mode; keep it uppercase.
Smaller payloads: lowest `prec` that looks right, `#rgb` colors, fewer colors, fewer path nodes (simplify in your SVG editor first), use built-ins/repeats/mirror when hand-writing.
