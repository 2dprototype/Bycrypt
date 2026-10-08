/*! svg2qvg - SVG -> QVG converter (browser; uses the DOM for CSS cascade, units, bounding boxes). Adds QVG.fromSVG */
(function (root) {
'use strict';
const QVG = root.QVG, NS = 'http://www.w3.org/2000/svg', XL = 'http://www.w3.org/1999/xlink';
const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'linearGradient', 'radialGradient', 'marker', 'style', 'title', 'desc', 'metadata', 'filter', 'script', 'foreignObject']);
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
const ID = [1, 0, 0, 1, 0, 0];

/**
 * fromSVG(svgText, {prec:2}) -> {program, payload, source, warnings, info}
 * prec = decimals kept for coordinates (0-3). Higher = closer to the original, larger payload.
 */
QVG.fromSVG = function (text, opt) {
  opt = Object.assign({ prec: 2 }, opt);
  const m = 10 ** opt.prec, warn = [], R = v => Math.round(v * m) / m, ri = v => Math.round(v * m);
  const W = s => { if (!warn.includes(s)) warn.push(s); };
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw Error('Invalid SVG XML');
  if (doc.documentElement.localName !== 'svg') throw Error('Not an SVG document');
  doc.querySelectorAll('script,foreignObject').forEach(e => e.remove());
  doc.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => { if (/^on/i.test(a.name)) e.removeAttribute(a.name); }));
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1000px;height:1000px;overflow:hidden;pointer-events:none';
  const svg = document.importNode(doc.documentElement, true);
  if (!svg.getAttribute('viewBox') && !svg.getAttribute('width')) { svg.setAttribute('width', '300'); svg.setAttribute('height', '150'); }
  host.appendChild(svg); document.body.appendChild(host);
  try { return convert(); } finally { host.remove(); }

  function byId(id) { return svg.querySelector('[id="' + String(id).replace(/"/g, '\\"') + '"]'); }
  function hrefOf(e) { const h = e.getAttribute('href') || e.getAttributeNS(XL, 'href') || ''; return h[0] === '#' ? h.slice(1) : ''; }

  function inlineUses() {
    for (let n = 0; n < 30; n++) {
      const us = [...svg.querySelectorAll('use')]; if (!us.length) return;
      for (const u of us) {
        const ref = byId(hrefOf(u)), g = document.createElementNS(NS, 'g');
        for (const a of u.attributes) if (!/^(x|y|width|height|href|xlink:href|transform)$/.test(a.name)) g.setAttribute(a.name, a.value);
        g.setAttribute('transform', (u.getAttribute('transform') || '') + ` translate(${parseFloat(u.getAttribute('x')) || 0} ${parseFloat(u.getAttribute('y')) || 0})`);
        if (ref && !ref.contains(u)) {
          const c = ref.cloneNode(true); c.removeAttribute('id');
          if (c.localName === 'symbol') { const g2 = document.createElementNS(NS, 'g'); while (c.firstChild) g2.appendChild(c.firstChild); g.appendChild(g2); W('<symbol> viewBox/size ignored'); }
          else g.appendChild(c);
        } else W('unresolved <use>');
        u.replaceWith(g);
      }
    }
  }

  function convert() {
    inlineUses();
    const pal = [], cmds = [], gradCmds = [], gkeys = [], stk = [];
    const ci = hex => { let i = pal.indexOf(hex); if (i < 0) i = pal.push(hex) - 1; return i; };
    let E = { f: '#000000', s: null, w: 1, fo: 1000, so: 1000, a: 1000, fr: 0, cap: 0, join: 0, ml: 4, dash: '', dof: 0 };
    const sv = () => { stk.push({ ...E }); cmds.push({ n: 'sv', a: [] }); };
    const rs = () => { E = stk.pop(); cmds.push({ n: 'rs', a: [] }); };

    /* ---- colors & paints ---- */
    function color(s) {
      const mt = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/.exec(s || '');
      if (!mt) { W('unparsed color "' + s + '"'); return { k: '#000000', a: 1 }; }
      const hex = '#' + [1, 2, 3].map(i => Math.round(+mt[i]).toString(16).padStart(2, '0')).join('');
      return { k: hex, a: mt[4] === undefined ? 1 : mt[5] ? +mt[4] / 100 : +mt[4] };
    }
    function len(v, def, dim, bboxMode) {
      if (v === null || v === undefined || v === '') return def;
      if (/%$/.test(v)) return parseFloat(v) / 100 * (bboxMode ? 1 : dim);
      return parseFloat(v);
    }
    function tmat(str) {
      if (!str) return ID;
      const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', str);
      const c = g.transform.baseVal.consolidate(); return c ? [c.matrix.a, c.matrix.b, c.matrix.c, c.matrix.d, c.matrix.e, c.matrix.f] : ID;
    }
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    function grad(id, el) {
      const g0 = byId(id); if (!g0 || !/^(linear|radial)Gradient$/.test(g0.localName)) { W('unsupported paint server #' + id + ' (pattern?) -> not drawn'); return -1; }
      const chain = []; for (let g = g0; g && chain.length < 12 && !chain.includes(g); g = byId(hrefOf(g))) chain.push(g);
      const at = n => { const c = chain.find(x => x.hasAttribute(n)); return c ? c.getAttribute(n) : null; };
      const sEl = chain.find(c => c.querySelector(':scope > stop')); if (!sEl) return -1;
      const userSpace = at('gradientUnits') === 'userSpaceOnUse', radial = g0.localName === 'radialGradient';
      const VW = QVGW, VH = QVGH, dm = n => (radial ? 0 : 0, n);
      let M = ID;
      if (!userSpace) {
        let bb; try { bb = el.getBBox(); } catch (e) { return -1; }
        if (!bb.width || !bb.height) return -1;
        M = [bb.width, 0, 0, bb.height, bb.x, bb.y];
      }
      M = mul(M, tmat(at('gradientTransform')));
      const X = (n, d) => len(at(n), d, VW, !userSpace), Y = (n, d) => len(at(n), d, VH, !userSpace), D = n => len(n, 0.5, Math.sqrt((VW * VW + VH * VH) / 2), !userSpace);
      const v = radial ? (() => { const cx = X('cx', userSpace ? VW / 2 : .5), cy = Y('cy', userSpace ? VH / 2 : .5), r = len(at('r'), userSpace ? Math.sqrt((VW * VW + VH * VH) / 2) / 2 : .5, Math.sqrt((VW * VW + VH * VH) / 2), !userSpace); return [cx, cy, r, X('fx', cx), Y('fy', cy)]; })()
        : [X('x1', 0), Y('y1', 0), X('x2', userSpace ? VW : 1), Y('y2', 0)];
      const stops = []; let po = 0;
      for (const s of sEl.querySelectorAll(':scope > stop')) {
        const cs = getComputedStyle(s), c = color(cs.stopColor); let o = len(s.getAttribute('offset'), 0, 1, true); o = Math.min(1, Math.max(po, isNaN(o) ? 0 : o)); po = o;
        stops.push([Math.round(o * 1000), ci(c.k), Math.round(1000 * c.a * (+cs.stopOpacity))]);
      }
      const sp = Math.max(0, ['pad', 'reflect', 'repeat'].indexOf(at('spreadMethod') || 'pad'));
      const ident = M.every((x, i) => Math.abs(x - ID[i]) < 1e-9);
      const a = [...v.map(x => +x.toFixed(4)), sp, ident ? null : M.map(x => +x.toFixed(4)), stops];
      const cmd = { n: radial ? 'gr' : 'gl', a }, key = JSON.stringify(cmd);
      let i = gkeys.indexOf(key); if (i < 0) { i = gkeys.push(key) - 1; gradCmds.push(cmd); } return i;
    }
    function paint(val, el) {
      if (!val || val === 'none') return { k: null, a: 1 };
      const mt = /^url\(\s*["']?#([^"')]+)["']?\s*\)\s*(.*)$/.exec(val);
      if (mt) { const g = grad(mt[1], el); if (g >= 0) return { k: 'g' + g, a: 1 }; return mt[2] && mt[2] !== 'none' ? color(mt[2]) : { k: null, a: 1 }; }
      return color(val);
    }

    /* ---- emit state diffs ---- */
    function apply(w) {
      const set = (key, mk) => { if (JSON.stringify(w[key]) !== JSON.stringify(E[key])) { const c = mk(w[key]); if (c) cmds.push(c); E[key] = w[key]; } };
      const col = (k, op, gop) => v => v === null ? { n: op, a: [0] } : v[0] === 'g' ? { n: gop, a: [+v.slice(1)] } : { n: op, a: [ci(v) + 1] };
      set('f', col('f', 'f', 'fg')); set('s', col('s', 's', 'sg'));
      set('w', v => ({ n: 'w', a: [R(v)] })); set('fo', v => ({ n: 'fo', a: [v] })); set('so', v => ({ n: 'so', a: [v] })); set('a', v => ({ n: 'al', a: [v] }));
      set('fr', v => ({ n: 'fr', a: [v] })); set('cap', v => ({ n: 'cap', a: [v] })); set('join', v => ({ n: 'join', a: [v] }));
      set('ml', v => ({ n: 'ml', a: [R(v)] })); set('dash', v => ({ n: 'dash', a: [v ? v.split(',').map(Number) : []] })); set('dof', v => ({ n: 'do', a: [R(v)] }));
    }

    /* ---- path data -> relative QVG segments (rounded-absolute, no drift) ---- */
    function pathCmd(d) {
      const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y; let i = 0, cmd = '', first = true;
      const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
      const num = () => { ws(); NUM.lastIndex = i; const x = NUM.exec(d); if (!x) throw 0; i = NUM.lastIndex; return +x[0]; };
      const flag = () => { ws(); const c = d[i++]; if (c !== '0' && c !== '1') throw 0; return +c; };
      let cx = 0, cy = 0, sx = 0, sy = 0, ix = 0, iy = 0, six = 0, siy = 0, px = 0, py = 0, pt = '', X0, Y0; const out = [];
      try {
        for (;;) {
          ws(); if (i >= d.length) break;
          if (/[MmLlHhVvCcSsQqTtAaZz]/.test(d[i])) cmd = d[i++]; else if (!cmd || /[Zz]/.test(cmd)) throw 0;
          const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
          if (first && C !== 'M') throw 0;
          if (C === 'Z') { out.push(['z']); cx = sx; cy = sy; ix = six; iy = siy; pt = 'Z'; cmd = 'Z'; continue; }
          if (C === 'M') {
            const x = ox + num(), y = oy + num(), nx = ri(x), ny = ri(y);
            if (first) { X0 = nx; Y0 = ny; first = false; } else out.push(['m', nx - ix, ny - iy]);
            ix = nx; iy = ny; cx = sx = x; cy = sy = y; six = ix; siy = iy; pt = 'M'; cmd = rel ? 'l' : 'L'; continue;
          }
          let x, y;
          if (C === 'L') { x = ox + num(); y = oy + num(); const dx = ri(x) - ix, dy = ri(y) - iy; out.push(dy === 0 && dx !== 0 ? ['h', dx] : dx === 0 && dy !== 0 ? ['v', dy] : ['l', dx, dy]); }
          else if (C === 'H') { x = ox + num(); y = cy; out.push(['h', ri(x) - ix]); }
          else if (C === 'V') { y = oy + num(); x = cx; out.push(['v', ri(y) - iy]); }
          else if (C === 'C' || C === 'S') {
            let a, b; if (C === 'C') { a = ri(ox + num()); b = ri(oy + num()); }
            const c2x = ri(ox + num()), c2y = ri(oy + num()); x = ox + num(); y = oy + num(); const ex = ri(x), ey = ri(y);
            const rx = pt === 'C' ? 2 * ix - px : ix, ry = pt === 'C' ? 2 * iy - py : iy;
            if (C === 'S' || (a === rx && b === ry)) out.push(['s', c2x - ix, c2y - iy, ex - ix, ey - iy]); else out.push(['c', a - ix, b - iy, c2x - ix, c2y - iy, ex - ix, ey - iy]);
            px = c2x; py = c2y; pt = 'C';
          } else if (C === 'Q' || C === 'T') {
            const rx = pt === 'Q' ? 2 * ix - px : ix, ry = pt === 'Q' ? 2 * iy - py : iy; let a = rx, b = ry;
            if (C === 'Q') { a = ri(ox + num()); b = ri(oy + num()); }
            x = ox + num(); y = oy + num(); const ex = ri(x), ey = ri(y);
            if (C === 'T' || (a === rx && b === ry)) out.push(['t', ex - ix, ey - iy]); else out.push(['q', a - ix, b - iy, ex - ix, ey - iy]);
            px = a; py = b; pt = 'Q';
          } else if (C === 'A') {
            const arx = Math.abs(num()), ary = Math.abs(num()), rot = num(), la = flag(), sw = flag(); x = ox + num(); y = oy + num();
            const dx = ri(x) - ix, dy = ri(y) - iy;
            out.push(arx && ary ? ['a', ri(arx), ri(ary), ri(rot), la, sw, dx, dy] : ['l', dx, dy]); pt = 'A';
          }
          if (C !== 'C' && C !== 'S' && C !== 'Q' && C !== 'T' && C !== 'A') pt = C;
          ix = ri(x); iy = ri(y); cx = x; cy = y;
        }
      } catch (e) { if (e !== 0) throw e; }
      if (X0 === undefined || !out.length) return null;
      const segs = out.map(g => [g[0], ...[...QVG.SEG[g[0]]].map((c, k) => c === 'b' ? g[k + 1] : g[k + 1] / m)]);
      return { n: 'd', a: [X0 / m, Y0 / m, segs] };
    }

    /* ---- elements -> commands ---- */
    const L = (el, n) => el[n].baseVal.value;
    function shapeCmd(el, ln) {
      if (ln === 'rect') {
        const x = L(el, 'x'), y = L(el, 'y'), w = L(el, 'width'), h = L(el, 'height'); if (!(w > 0 && h > 0)) return null;
        let rx = L(el, 'rx'), ry = L(el, 'ry'); if (!el.hasAttribute('rx') && el.hasAttribute('ry')) rx = ry; if (!el.hasAttribute('ry') && el.hasAttribute('rx')) ry = rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        return rx > 0 && ry > 0 ? { n: 'rr', a: [R(x), R(y), R(w), R(h), R(rx), R(ry)] } : { n: 'r', a: [R(x), R(y), R(w), R(h)] };
      }
      if (ln === 'circle') { const r = L(el, 'r'); return r > 0 ? { n: 'c', a: [R(L(el, 'cx')), R(L(el, 'cy')), R(r)] } : null; }
      if (ln === 'ellipse') { const a = L(el, 'rx'), b = L(el, 'ry'); return a > 0 && b > 0 ? { n: 'e', a: [R(L(el, 'cx')), R(L(el, 'cy')), R(a), R(b)] } : null; }
      if (ln === 'line') return { n: 'ln', a: [R(L(el, 'x1')), R(L(el, 'y1')), R(L(el, 'x2')), R(L(el, 'y2'))], open: true };
      if (ln === 'polyline' || ln === 'polygon') {
        const p = []; for (let i = 0; i < el.points.numberOfItems; i++) { const q = el.points.getItem(i); p.push(R(q.x), R(q.y)); }
        return p.length >= 4 ? { n: ln === 'polygon' ? 'p' : 'pl', a: p } : null;
      }
      return pathCmd(el.getAttribute('d') || '');
    }
    function matrixOf(el) {
      if (!el.transform || !el.transform.baseVal.numberOfItems) return null;
      const c = el.transform.baseVal.consolidate().matrix, a = [c.a, c.b, c.c, c.d, c.e, c.f];
      return a.every((v, i) => Math.abs(v - ID[i]) < 1e-9) ? null : a;
    }
    function emitMatrix(a) {
      const f = v => +v.toFixed(4);
      if (Math.abs(a[0] - 1) < 1e-9 && Math.abs(a[3] - 1) < 1e-9 && !a[1] && !a[2]) cmds.push({ n: 'tr', a: [R(a[4]), R(a[5])] });
      else if (!a[1] && !a[2] && !a[4] && !a[5]) cmds.push({ n: 'sc', a: [f(a[0]), f(a[3])] });
      else cmds.push({ n: 'mx', a: [f(a[0]), f(a[1]), f(a[2]), f(a[3]), R(a[4]), R(a[5])] });
    }
    function clipOf(el, cs) {
      const mt = /^url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(cs.clipPath || ''); if (!mt) return null;
      const cp = byId(mt[1]); if (!cp || cp.localName !== 'clipPath') { W('missing clipPath #' + mt[1]); return null; } return cp;
    }
    function emitClip(cp, el) {
      const at = cmds.length; cmds.push(null); let count = 0;
      const wrapT = (c, f) => { const mt = matrixOf(c); if (mt) { sv(); emitMatrix(mt); } f(); if (mt) rs(); };
      const walkC = parent => {
        for (const c of parent.children) {
          const ln = c.localName; if (c.namespaceURI !== NS || getComputedStyle(c).display === 'none') continue;
          if (ln === 'g') { wrapT(c, () => walkC(c)); continue; }
          if (!SHAPES.has(ln)) { W('<' + ln + '> inside clipPath ignored'); continue; }
          const sh = shapeCmd(c, ln); if (!sh) continue;
          wrapT(c, () => { apply({ ...E, fr: getComputedStyle(c).clipRule === 'evenodd' ? 1 : 0 }); cmds.push({ n: sh.n, a: sh.a }); count++; });
        }
      };
      let bbm = null;
      if (cp.getAttribute('clipPathUnits') === 'objectBoundingBox') { try { const bb = el.getBBox(); bbm = [bb.width, 0, 0, bb.height, bb.x, bb.y]; } catch (e) { } }
      const outer = matrixOf(cp); if (bbm) { sv(); emitMatrix(bbm); } if (outer) { sv(); emitMatrix(outer); }
      walkC(cp);
      if (outer) rs(); if (bbm) rs();
      if (!count) { cmds.splice(at, 1); cmds.push({ n: 'clip', a: [1] }); cmds.push({ n: 'r', a: [0, 0, 0, 0] }); return; }
      cmds[at] = { n: 'clip', a: [count] };
    }
    function wrapStart(el, cs, group) {
      const mt = matrixOf(el), cp = clipOf(el, cs), op = group ? +cs.opacity : 1;
      if (cs.mask !== 'none' && cs.mask) W('mask ignored'); if (cs.filter !== 'none' && cs.filter) W('filter ignored');
      if (!mt && !cp && !(op < 1)) return false;
      sv(); if (mt) emitMatrix(mt); if (op < 1) cmds.push({ n: 'go', a: [Math.round(op * 1000)] }); if (cp) emitClip(cp, el); return true;
    }
    function drawShape(el, cs, ln) {
      if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return;
      const sh = shapeCmd(el, ln); if (!sh) return;
      if (cs.markerStart !== 'none' || cs.markerMid !== 'none' || cs.markerEnd !== 'none') W('markers ignored');
      const fp = paint(cs.fill, el), sp = paint(cs.stroke, el), sw = parseFloat(cs.strokeWidth) || 0;
      const hasF = !!fp.k && !sh.open, hasS = !!sp.k && sw > 0; if (!hasF && !hasS) return;
      const w = { ...E }; w.f = hasF ? fp.k : null; w.s = hasS ? sp.k : null;
      w.fo = Math.round(1000 * fp.a * +cs.fillOpacity); w.so = Math.round(1000 * sp.a * +cs.strokeOpacity); w.a = Math.round(1000 * +cs.opacity);
      w.fr = cs.fillRule === 'evenodd' ? 1 : 0;
      if (hasS) {
        w.w = sw; w.cap = Math.max(0, ['butt', 'round', 'square'].indexOf(cs.strokeLinecap)); w.join = Math.max(0, ['miter', 'round', 'bevel'].indexOf(cs.strokeLinejoin));
        w.ml = +cs.strokeMiterlimit || 4; w.dof = parseFloat(cs.strokeDashoffset) || 0;
        const da = cs.strokeDasharray === 'none' ? [] : cs.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter(x => !isNaN(x));
        w.dash = da.length && da.some(x => x > 0) ? da.map(R).join(',') : '';
      }
      const wrapped = wrapStart(el, cs, false); apply(w); cmds.push({ n: sh.n, a: sh.a }); if (wrapped) rs();
    }
    function drawText(el, cs) {
      if (cs.visibility === 'hidden') return;
      const fp = paint(cs.fill, el); if (!fp.k) return;
      if (paint(cs.stroke, el).k) W('text stroke ignored');
      const parts = []; (function col(n) { for (const c of n.childNodes) { if (c.nodeType === 3) parts.push({ t: c.nodeValue, el: n }); else if (c.nodeType === 1 && /^(tspan|a)$/.test(c.localName)) col(c); else if (c.nodeType === 1) W('<' + c.localName + '> in text ignored'); } })(el);
      let out = '', prev = true; for (const p of parts) { p.s = out.length; for (const ch of p.t) { if (/\s/.test(ch)) { if (!prev) { out += ' '; prev = true; } } else { out += ch; prev = false; } } p.e = out.length; }
      if (out.endsWith(' ')) { out = out.slice(0, -1); parts.forEach(p => { p.e = Math.min(p.e, out.length); }); }
      let runs; const nch = el.getNumberOfChars();
      if (out.length === nch && parts.length) runs = parts.filter(p => p.e > p.s).map(p => ({ s: p.s, t: out.slice(p.s, p.e), el: p.el }));
      else { runs = [{ s: 0, t: out, el }]; if (out.length !== nch) W('text positions approximate'); }
      if (out.length && el.hasAttribute('rotate')) W('text rotate ignored');
      const wrapped = wrapStart(el, cs, false);
      for (const r of runs) {
        if (!r.t.trim()) continue; const rc = getComputedStyle(r.el), pos = el.getStartPositionOfChar(Math.min(r.s, nch - 1));
        const fam = rc.fontFamily, family = /mono|courier|consolas/i.test(fam) ? 2 : /sans|arial|helvet|verdana|tahoma/i.test(fam) ? 0 : /serif|times|georgia|garamond/i.test(fam) ? 1 : 0;
        const rp = paint(rc.fill, r.el); const w = { ...E, f: rp.k, fo: Math.round(1000 * rp.a * +rc.fillOpacity), a: Math.round(1000 * +cs.opacity), fr: 0 }; if (!rp.k) continue;
        apply(w); cmds.push({ n: 'ta', a: [0] }, { n: 'ft', a: [family, Math.max(1, Math.round((parseInt(rc.fontWeight) || 400) / 100)), /italic|oblique/.test(rc.fontStyle) ? 1 : 0] },
          { n: 't', a: [R(pos.x), R(pos.y), R(parseFloat(rc.fontSize)), r.t] });
      }
      if (wrapped) rs();
    }
    function node(el) {
      if (el.namespaceURI !== NS) return; const ln = el.localName; if (SKIP.has(ln)) return;
      const cs = getComputedStyle(el); if (cs.display === 'none') return;
      if (ln === 'g' || ln === 'a' || ln === 'svg' || ln === 'switch') {
        if (ln === 'svg' && el.hasAttribute('viewBox')) W('nested <svg viewBox> scaling ignored');
        const w = wrapStart(el, cs, true), nx = ln === 'svg' ? (parseFloat(el.getAttribute('x')) || 0) : 0, ny = ln === 'svg' ? (parseFloat(el.getAttribute('y')) || 0) : 0;
        if (nx || ny) { if (!w) sv(); cmds.push({ n: 'tr', a: [R(nx), R(ny)] }); }
        for (const c of el.children) node(c);
        if (w || nx || ny) rs(); return;
      }
      if (SHAPES.has(ln)) return drawShape(el, cs, ln);
      if (ln === 'text') return drawText(el, cs);
      if (ln === 'image') W('<image> not supported'); else W('<' + ln + '> not supported');
    }

    /* ---- root ---- */
    const vb = svg.viewBox.baseVal; let w, h, ox = 0, oy = 0;
    if (vb && vb.width > 0 && vb.height > 0) { w = vb.width; h = vb.height; ox = vb.x; oy = vb.y; }
    else { w = svg.width.baseVal.value; h = svg.height.baseVal.value; }
    if (!(w > 0 && h > 0)) { const bb = svg.getBBox(); w = bb.x + bb.width; h = bb.y + bb.height; W('no size/viewBox: using content bounds'); }
    var QVGW = w, QVGH = h;
    if (ox || oy) cmds.push({ n: 'tr', a: [R(-ox), R(-oy)] });
    const rootCs = getComputedStyle(svg), rw = wrapStart(svg, rootCs, true);
    for (const c of svg.children) node(c);
    if (rw) rs();
    while (cmds.length && cmds[cmds.length - 1].n === 'rs') cmds.pop();
    for (let i = cmds.length - 2; i >= 0; i--) if (cmds[i].n === 'sv' && cmds[i + 1].n === 'rs') cmds.splice(i, 2);
    const program = { w: R(w), h: R(h), pal, cmds: [...gradCmds, ...cmds] };
    const payload = QVG.encode(program);
    return { program, payload, source: QVG.stringify(program), warnings: warn, info: QVG.info(payload) };
  }
};
})(typeof self !== 'undefined' ? self : this);
