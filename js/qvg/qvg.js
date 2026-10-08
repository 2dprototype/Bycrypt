/*! QVG v4 - QR Vector Graphics. SVG-complete vector commands -> bit-packed -> Base45 (QR alphanumeric safe). MIT */
(function (root) {
'use strict';
// base41: the QR alphanumeric set minus space % + / -> every char is URL-safe (path, query, fragment) and still alphanumeric-mode
const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.$*:";
const N = v => +(+v).toFixed(3), rad = d => d * Math.PI / 180;
const CAP = ['butt', 'round', 'square'], JOIN = ['miter', 'round', 'bevel'], SPREAD = ['pad', 'reflect', 'repeat'];
const FAM = ['sans-serif', 'serif', 'monospace'], ANCH = ['start', 'middle', 'end'];
const FX = 1e4, KF = 6; let LOSS = 0;

/* ---------- bit io ---------- */
class BW {
  constructor() { this.b = []; }
  put(v, n) { for (let i = n - 1; i >= 0; i--) this.b.push((v >> i) & 1); }
  eg(v) { v++; const n = 31 - Math.clz32(v); this.put(0, n); this.put(v, n + 1); }
  ueg(v, k) { this.eg(v >> k); if (k) this.put(v & ((1 << k) - 1), k); }
  seg(v, k) { this.ueg(v < 0 ? -2 * v - 1 : 2 * v, k); }
  bytes() { const o = new Uint8Array((this.b.length + 7) >> 3); this.b.forEach((x, i) => o[i >> 3] |= x << (7 - (i & 7))); return o; }
}
class BR {
  constructor(u) { this.u = u; this.p = 0; }
  bit() { if (this.p > this.u.length * 8 + 16) throw Error('QVG: truncated data'); const v = ((this.u[this.p >> 3] || 0) >> (7 - (this.p & 7))) & 1; this.p++; return v; }
  get(n) { let v = 0; while (n--) v = v * 2 + this.bit(); return v; }
  eg() { let n = 0; while (!this.bit()) if (++n > 28) throw Error('QVG: corrupt data'); return 2 ** n + this.get(n) - 1; }
  ueg(k) { const q = this.eg(); return k ? q * (1 << k) + this.get(k) : q; }
  seg(k) { const v = this.ueg(k); return v & 1 ? -(v + 1) / 2 : v / 2; }
}
function b45e(u) {
  let s = '';
  for (let i = 0; i < u.length; i += 2) {
    if (i + 1 < u.length) { const n = u[i] * 256 + u[i + 1]; s += A[n % 41] + A[(n / 41 | 0) % 41] + A[n / 1681 | 0]; }
    else s += A[u[i] % 41] + A[u[i] / 41 | 0];
  }
  return s;
}
/** accepts a bare payload or a URL carrying it (#fragment, ?q= / ?qvg=, or last path segment) */
function payloadOf(s) {
  s = s.trim();
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(s)) {
    const h = s.indexOf('#'), q = /[?&](?:q|qvg)=([^&#]+)/i.exec(s);
    s = h >= 0 ? s.slice(h + 1) : q ? q[1] : s.replace(/[?#].*$/, '').split('/').pop();
  }
  return s.replace(/^QVG:/i, '').toUpperCase();
}
function b45d(s) {
  s = payloadOf(s); const o = [];
  const v = c => { const i = A.indexOf(c); if (i < 0) throw Error('QVG: invalid character "' + c + '"'); return i; };
  for (let i = 0; i < s.length; i += 3) {
    if (i + 2 < s.length) { const n = v(s[i]) + v(s[i + 1]) * 41 + v(s[i + 2]) * 1681; if (n > 65535) throw Error('QVG: corrupt data'); o.push(n >> 8, n & 255); }
    else if (i + 1 < s.length) { const n = v(s[i]) + v(s[i + 1]) * 41; if (n > 255) throw Error('QVG: corrupt data'); o.push(n); }
    else throw Error('QVG: bad length');
  }
  return new Uint8Array(o);
}

/* ---------- command table ----------
 u,s = plain ints   U,S = scaled lengths (10^prec)   F = 4-decimal ratio   b = bit
 P = point (delta from cursor)  C = color or none(0)  i = palette index
 G = point list  D = path  T = text  L = number list  X = optional matrix  Z = gradient stops
 Frequent commands first = shorter opcodes. */
const OPS = [
  ['d', 'D'], ['f', 'C'], ['s', 'C'], ['sv', ''], ['rs', ''], ['w', 'U'], ['r', 'PUU'], ['c', 'PU'], ['p', 'G'], ['tr', 'SS'], ['e', 'PUU'],
  ['fo', 'u'], ['so', 'u'], ['al', 'u'], ['ln', 'PP'], ['pl', 'G'], ['rr', 'PUUUU'], ['mx', 'FFFFSS'], ['fg', 'u'], ['sg', 'u'],
  ['gl', 'FFFFuXZ'], ['gr', 'FFFFFuXZ'], ['clip', 'u'], ['go', 'u'], ['fr', 'u'], ['cap', 'u'], ['join', 'u'], ['ml', 'U'], ['dash', 'L'], ['do', 'S'],
  ['star', 'PUUuS'], ['ngon', 'PUuS'], ['ring', 'PUU'], ['heart', 'PU'], ['pie', 'PUSS'], ['arc', 'PUSS'], ['gear', 'PUUu'], ['plus', 'PUU'],
  ['t', 'PUT'], ['ta', 'u'], ['ft', 'uub'], ['x', 'uSS'], ['xr', 'uSP'], ['ro', 'S'], ['sc', 'FF'], ['mir', 'U'], ['mih', 'U'],
  ['df', ''], ['de', ''], ['us', 'uSS']
];
const OPI = {}; OPS.forEach((o, i) => OPI[o[0]] = i);
const SEG = { l: 'SS', q: 'SSSS', c: 'SSSSSS', a: 'UUSbbSS', h: 'S', v: 'S', m: 'SS', z: '', s: 'SSSS', t: 'SS' }, SK = Object.keys(SEG);

function norm(s) {
  let h = String(s).trim().replace('#', '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) throw Error('bad color ' + s);
  if (h.length === 3) h = [...h].map(x => x + x).join('');
  return '#' + h.toLowerCase();
}
/** snap to the cheap 12-bit palette (#rgb) */
const q12 = s => '#' + [1, 3, 5].map(i => (Math.round(parseInt(norm(s).substr(i, 2), 16) / 17) * 17).toString(16).padStart(2, '0')).join('');

/* ---------- source text -> program ---------- */
function parse(src) {
  const P = { w: 64, h: 64, pal: [], cmds: [] }, bgs = []; let gcount = 0;
  const col = s => { const q = norm(s); let i = P.pal.indexOf(q); if (i < 0) i = P.pal.push(q) - 1; return i; };
  const fl = s => { const v = parseFloat(s); if (s === undefined || isNaN(v)) throw Error('bad number "' + s + '"'); return +v.toFixed(4); };
  const int = s => Math.round(fl(s));
  src.split(/[\n;]+/).forEach((ln, li) => {
    const t = ln.replace(/\/\/.*$/, '').trim().split(/\s+/); if (!t[0]) return;
    let c = t.shift();
    try {
      if (c[0] === '#') { t.unshift(c); c = 'f'; }
      if (c === 'grid') { P.w = fl(t[0]); P.h = t[1] ? fl(t[1]) : P.w; return; }
      if (c === 'bg') { P.cmds.push({ n: 'f', a: [col(t[0]) + 1] }); const r = { n: 'r', a: [0, 0, 0, 0] }; bgs.push(r); P.cmds.push(r); return; }
      if (c === 'lg') { P.cmds.push({ n: 'gl', a: [fl(t[0]), fl(t[1]), fl(t[2]), fl(t[3]), 0, null, [[0, col(t[4]), 1000], [1000, col(t[5]), 1000]]] }, { n: 'fg', a: [gcount++] }); return; }
      if (c === 'rg') { const x = fl(t[0]), y = fl(t[1]); P.cmds.push({ n: 'gr', a: [x, y, fl(t[2]), x, y, 0, null, [[0, col(t[3]), 1000], [1000, col(t[4]), 1000]]] }, { n: 'fg', a: [gcount++] }); return; }
      const o = OPI[c]; if (o === undefined) throw Error('unknown command "' + c + '"');
      if (c === 'clip' && !t.length) t.push('1');
      if (c === 'rr' && t.length === 5) t.push(t[4]);
      const a = []; let i = 0;
      for (const ch of OPS[o][1]) {
        if (ch === 'u' || ch === 's') a.push(int(t[i++]));
        else if (ch === 'U' || ch === 'S' || ch === 'F') a.push(fl(t[i++]));
        else if (ch === 'b') a.push(int(t[i++]) ? 1 : 0);
        else if (ch === 'P') a.push(fl(t[i++]), fl(t[i++]));
        else if (ch === 'C') { const s = t[i++]; a.push(/^(-|none)$/.test(s) ? 0 : col(s) + 1); }
        else if (ch === 'i') a.push(col(t[i++]));
        else if (ch === 'G') { const v = t.slice(i).map(fl); if (v.length < 4 || v.length % 2) throw Error('needs 2+ points'); a.push(...v); i = t.length; }
        else if (ch === 'L') { a.push(t.slice(i).map(fl)); i = t.length; }
        else if (ch === 'X') { const s = t[i++]; if (s === undefined) throw Error('missing matrix (use -)'); a.push(s === '-' ? null : s.split(',').map(fl)); }
        else if (ch === 'Z') { if (!t[i]) throw Error('gradient needs stops'); a.push(t.slice(i).map(s => { const p = s.split(':'); return [Math.round(fl(p[0]) * 1000), col(p[1]), p[2] === undefined ? 1000 : Math.round(fl(p[2]) * 1000)]; })); i = t.length; }
        else if (ch === 'D') {
          a.push(fl(t[i++]), fl(t[i++])); const segs = [];
          while (i < t.length) { const ty = t[i++], sp = SEG[ty]; if (sp === undefined) throw Error('bad path op "' + ty + '"'); segs.push([ty, ...[...sp].map(k => k === 'b' ? (int(t[i++]) ? 1 : 0) : fl(t[i++]))]); }
          a.push(segs);
        } else if (ch === 'T') { a.push(t.slice(i).join(' ')); i = t.length; }
      }
      if (c === 'gl' || c === 'gr') gcount++;
      P.cmds.push({ n: c, a });
    } catch (e) { throw Error('line ' + (li + 1) + ': ' + e.message.replace(/^QVG: /, '')); }
  });
  bgs.forEach(r => r.a = [0, 0, P.w, P.h]);
  return P;
}
function stringify(P) {
  const L = ['grid ' + P.w + ' ' + P.h];
  for (const { n, a } of P.cmds) {
    let j = 0; const o = [n];
    for (const ch of OPS[OPI[n]][1]) {
      if ('usUSFb'.includes(ch)) o.push(+(+a[j++]).toFixed(4));
      else if (ch === 'P') o.push(a[j++], a[j++]);
      else if (ch === 'C') { const v = a[j++]; o.push(v ? P.pal[v - 1] : '-'); }
      else if (ch === 'i') o.push(P.pal[a[j++]]);
      else if (ch === 'G') { o.push(...a.slice(j)); j = a.length; }
      else if (ch === 'L') o.push(...a[j++]);
      else if (ch === 'X') { const m = a[j++]; o.push(m ? m.join(',') : '-'); }
      else if (ch === 'Z') o.push(...a[j++].map(s => s[0] / 1000 + ':' + P.pal[s[1]] + (s[2] < 1000 ? ':' + s[2] / 1000 : '')));
      else if (ch === 'D') { o.push(a[j++], a[j++]); for (const g of a[j]) o.push(g.join(' ')); }
      else if (ch === 'T') o.push(a[j]);
    }
    L.push(o.join(' '));
  }
  return L.join('\n');
}

/* ---------- bit codec ---------- */
function wr(w, spec, a, k, cur, m) {
  let j = 0;
  const sc = v => { const x = v * m, r = Math.round(x); if (Math.abs(x - r) > 1e-6) LOSS++; return r; };
  const P = () => { const X = sc(a[j++]), Y = sc(a[j++]); w.seg(X - cur.x, k); w.seg(Y - cur.y, k); cur.x = X; cur.y = Y; };
  for (const c of spec) {
    if (c === 'u') { if (!(a[j] >= 0)) throw Error('QVG: negative value where unsigned required'); w.ueg(a[j++], k); }
    else if (c === 's') w.seg(a[j++], k);
    else if (c === 'U') { const v = sc(a[j++]); if (v < 0) throw Error('QVG: negative length'); w.ueg(v, k); }
    else if (c === 'S') w.seg(sc(a[j++]), k);
    else if (c === 'F') w.seg(Math.round(a[j++] * FX), KF);
    else if (c === 'b') w.put(a[j++] ? 1 : 0, 1);
    else if (c === 'C' || c === 'i') w.eg(a[j++]);
    else if (c === 'P') P();
    else if (c === 'G') { w.eg(a.length / 2 - 2); for (let i = a.length / 2; i--;) P(); }
    else if (c === 'L') { const l = a[j++]; w.eg(l.length); l.forEach(v => w.ueg(sc(v), k)); }
    else if (c === 'X') { const mm = a[j++]; w.put(mm ? 1 : 0, 1); if (mm) mm.forEach(v => w.seg(Math.round(v * FX), KF)); }
    else if (c === 'Z') { const l = a[j++]; w.eg(l.length); let p = 0; for (const s of l) { w.eg(s[0] - p); p = s[0]; w.eg(s[1]); if (s[2] === 1000) w.put(1, 1); else { w.put(0, 1); w.eg(s[2]); } } }
    else if (c === 'D') { P(); const s = a[j]; w.eg(s.length); for (const g of s) { w.put(SK.indexOf(g[0]), 4); wr(w, SEG[g[0]], g.slice(1), k, cur, m); } }
    else if (c === 'T') { const s = a[j]; w.eg(s.length); for (const ch of s) { const cc = ch.charCodeAt(0); if (cc < 127) w.put(cc, 7); else { w.put(127, 7); w.put(cc, 16); } } }
  }
}
function rd(r, spec, k, cur, m) {
  const o = [], P = () => { cur.x += r.seg(k); cur.y += r.seg(k); o.push(cur.x / m, cur.y / m); };
  for (const c of spec) {
    if (c === 'u') o.push(r.ueg(k)); else if (c === 's') o.push(r.seg(k));
    else if (c === 'U') o.push(r.ueg(k) / m); else if (c === 'S') o.push(r.seg(k) / m);
    else if (c === 'F') o.push(r.seg(KF) / FX); else if (c === 'b') o.push(r.get(1));
    else if (c === 'C' || c === 'i') o.push(r.eg()); else if (c === 'P') P();
    else if (c === 'G') for (let n = r.eg() + 2; n--;) P();
    else if (c === 'L') { const l = []; for (let n = r.eg(); n--;) l.push(r.ueg(k) / m); o.push(l); }
    else if (c === 'X') o.push(r.get(1) ? Array.from({ length: 6 }, () => r.seg(KF) / FX) : null);
    else if (c === 'Z') { const l = []; let p = 0; for (let n = r.eg(); n--;) { p += r.eg(); const ci = r.eg(); l.push([p, ci, r.get(1) ? 1000 : r.eg()]); } o.push(l); }
    else if (c === 'D') { P(); const s = []; for (let n = r.eg(); n--;) { const t = SK[r.get(4)]; if (!t) throw Error('QVG: corrupt path'); s.push([t, ...rd(r, SEG[t], k, cur, m)]); } o.push(s); }
    else if (c === 'T') { let n = r.eg(), s = ''; while (n--) { let cc = r.get(7); if (cc === 127) cc = r.get(16); s += String.fromCharCode(cc); } o.push(s); }
  }
  return o;
}
function recolor(P, map) {
  return P.cmds.map(({ n, a }) => {
    a = a.slice();
    if (n === 'f' || n === 's') a[0] = a[0] ? map(a[0] - 1) + 1 : 0;
    else if (n === 'gl' || n === 'gr') a[a.length - 1] = a[a.length - 1].map(s => [s[0], map(s[1]), s[2]]);
    return { n, a };
  });
}
/** reorder palette by usage (frequent colors get shorter codes), drop unused colors */
function optimize(P) {
  const cnt = P.pal.map(() => 0); recolor(P, i => (cnt[i]++, i));
  const ord = cnt.map((c, i) => i).filter(i => cnt[i] > 0).sort((x, y) => cnt[y] - cnt[x]), map = {};
  ord.forEach((o, i) => map[o] = i);
  return { w: P.w, h: P.h, pal: ord.map(i => P.pal[i]), cmds: recolor(P, i => map[i]) };
}
function pack(P, k, p) {
  const w = new BW(), m = 10 ** p, sc = v => { const x = v * m, r = Math.round(x); if (Math.abs(x - r) > 1e-6) LOSS++; return r; };
  w.put(1, 2); w.put(k, 2); w.put(p, 2);
  if (P.w === P.h && P.w >= 16 && P.w <= 2048 && Number.isInteger(P.w) && !(P.w & (P.w - 1))) { w.put(1, 1); w.put(Math.log2(P.w) - 4, 3); } else { w.put(0, 1); w.eg(sc(P.w)); w.eg(sc(P.h)); }
  w.eg(P.pal.length);
  for (const c of P.pal) {
    const ch = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
    if (ch.every(v => v % 17 === 0)) { w.put(0, 1); ch.forEach(v => w.put(v / 17, 4)); } else { w.put(1, 1); ch.forEach(v => w.put(v, 8)); }
  }
  const cur = { x: 0, y: 0 };
  for (const { n, a } of P.cmds) { const o = OPI[n]; w.eg(o); wr(w, OPS[o][1], a, k, cur, m); }
  w.eg(OPS.length);
  return b45e(w.bytes());
}
/** program or source text -> Base45 payload (picks the smallest lossless precision and Golomb k) */
function encode(x) {
  const P = optimize(typeof x === 'string' ? parse(x) : x); let bp = 3;
  for (let p = 0; p < 4; p++) { LOSS = 0; pack(P, 0, p); if (!LOSS) { bp = p; break; } }
  let best; for (let k = 0; k < 4; k++) { const s = pack(P, k, bp); if (!best || s.length < best.length) best = s; }
  return best;
}
function decode(text) {
  const r = new BR(b45d(text)); if (r.get(2) !== 1) throw Error('QVG: unsupported version'); const k = r.get(2), p = r.get(2), m = 10 ** p; let w, h;
  if (r.get(1)) w = h = 16 << r.get(3); else { w = r.eg() / m; h = r.eg() / m; }
  const pal = []; for (let n = r.eg(); n--;) { const big = r.get(1), c = [0, 0, 0].map(() => big ? r.get(8) : r.get(4) * 17); pal.push('#' + c.map(v => v.toString(16).padStart(2, '0')).join('')); }
  const cmds = [], cur = { x: 0, y: 0 };
  for (;;) { const o = r.eg(); if (o >= OPS.length) break; cmds.push({ n: OPS[o][0], a: rd(r, OPS[o][1], k, cur, m) }); }
  return { w, h, pal, cmds };
}
const QR_ALNUM = { L: 4296, M: 3391, Q: 2420, H: 1852 }, QR_BYTE = { L: 2953, M: 2331, Q: 1663, H: 1273 };
/** size/capacity info for a payload or a full URL (alphanumeric mode needs the whole string uppercase) */
function info(text) {
  const chars = text.length, alnum = /^[0-9A-Z $%*+\-.\/:]*$/.test(text), cap = alnum ? QR_ALNUM : QR_BYTE;
  return { chars, bytes: Math.ceil(chars * 5.5 / 8), mode: alnum ? 'alphanumeric' : 'byte', capacity: cap, fitsEcc: Object.keys(cap).filter(e => chars <= cap[e]), easyScan: chars <= (alnum ? 1000 : 700) };
}
/** payload -> URL. Scheme+host are upper-cased (case-insensitive) so the QR can stay in alphanumeric mode;
 *  mode 'path' (default): HOST/PAYLOAD  -> stays alphanumeric (smallest QR). Needs a server rewrite so any path serves viewer.html.
 *  mode 'hash' / 'query': HOST/#PAYLOAD, HOST/?Q=PAYLOAD -> '#','?','=' are not in the QR alphanumeric set, so the QR falls back to byte mode (~45% bigger). */
function toURL(payload, base, mode) {
  base = (base || 'https://example.com/').replace(/[#?].*$/, '');
  const m = /^(https?:\/\/[^\/]+)(.*)$/i.exec(base); if (!m) throw Error('QVG: base must start with http(s)://');
  const head = m[1].toUpperCase(), path = m[2] || '/';
  return mode === 'query' ? head + path + '?q=' + payload : mode === 'hash' ? head + path + '#' + payload : head + path.replace(/\/?$/, '/') + payload;
}
const fromURL = payloadOf;

/* ---------- geometry (every shape -> SVG path data) ---------- */
const pol = (x, y, r, a) => [x + r * Math.cos(rad(a)), y + r * Math.sin(rad(a))];
const poly = p => 'M' + p.map(q => N(q[0]) + ' ' + N(q[1])).join('L') + 'z';
const pp = (a, z) => 'M' + a.reduce((s, v, i) => s + (i % 2 ? ' ' : i ? 'L' : '') + v, '') + (z ? 'z' : '');
const ell = (x, y, a, b, s = 1) => `M${N(x + a)} ${y}A${a} ${b} 0 1 ${s} ${N(x - a)} ${y}A${a} ${b} 0 1 ${s} ${N(x + a)} ${y}z`;
const arcp = (x, y, r, a, b, pie) => {
  const d = ((b - a) % 360 + 360) % 360; if (!d) return b === a ? '' : ell(x, y, r, r);
  const p = pol(x, y, r, a), q = pol(x, y, r, a + d);
  return `M${pie ? x + ' ' + y + 'L' : ''}${N(p[0])} ${N(p[1])}A${r} ${r} 0 ${d > 180 ? 1 : 0} 1 ${N(q[0])} ${N(q[1])}${pie ? 'z' : ''}`;
};
const HEART = [[0, .9], [-1.2, .1, -1.1, -.9, -.5, -.9], [-.2, -.9, 0, -.7, 0, -.5], [0, -.7, .2, -.9, .5, -.9], [1.1, -.9, 1.2, .1, 0, .9]];
const SH = {
  r: ([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`,
  c: ([x, y, r]) => ell(x, y, r, r), e: ([x, y, a, b]) => ell(x, y, a, b),
  p: a => pp(a, 1), pl: a => pp(a, 0), ln: ([a, b, c, d]) => `M${a} ${b}L${c} ${d}`,
  d: ([x, y, s]) => `M${x} ${y}` + s.map(g => g.join(' ')).join(''),
  rr: ([x, y, w, h, a, b]) => { a = Math.min(a, w / 2); b = Math.min(b, h / 2); const u = N(w - 2 * a), v = N(h - 2 * b); return `M${N(x + a)} ${y}h${u}a${a} ${b} 0 0 1 ${a} ${b}v${v}a${a} ${b} 0 0 1 ${-a} ${b}h${-u}a${a} ${b} 0 0 1 ${-a} ${-b}v${-v}a${a} ${b} 0 0 1 ${a} ${-b}z`; },
  star: ([x, y, R, r, n, rot]) => poly(Array.from({ length: 2 * n }, (_, i) => pol(x, y, i % 2 ? r : R, rot - 90 + i * 180 / n))),
  ngon: ([x, y, R, n, rot]) => poly(Array.from({ length: n }, (_, i) => pol(x, y, R, rot - 90 + i * 360 / n))),
  ring: ([x, y, R, r]) => ell(x, y, R, R) + ell(x, y, r, r, 0),
  heart: ([x, y, s]) => HEART.map((v, i) => (i ? 'C' : 'M') + v.map((n, j) => N(n * s + (j % 2 ? y : x))).join(' ')).join('') + 'z',
  pie: ([x, y, r, a, b]) => arcp(x, y, r, a, b, 1), arc: ([x, y, r, a, b]) => arcp(x, y, r, a, b, 0),
  gear: ([x, y, R, r, n]) => poly(Array.from({ length: n * 4 }, (_, i) => pol(x, y, [r, R, R, r][i % 4], (Math.floor(i / 4) + [0, .1, .4, .5][i % 4]) * 360 / n - 90))),
  plus: ([x, y, s, t]) => { const h = t / 2, m = N(s - h); return `M${N(x - h)} ${y - s}h${t}v${m}h${m}v${t}h${-m}v${m}h${-t}v${-m}h${-m}v${-t}h${m}z`; }
};
const OPEN = new Set(['ln', 'arc']);

/* ---------- transforms ---------- */
const ID = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const inv = m => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
const TR = (x, y) => [1, 0, 0, 1, x, y], RO = d => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [c, s, -s, c, 0, 0]; };
const ROA = (d, x, y) => mul(mul(TR(x, y), RO(d)), TR(-x, -y));

/* ---------- interpreter (shared by SVG and Canvas backends) ---------- */
function prep(P) { const cmds = [], defs = []; let cur = null; for (const c of P.cmds) { if (c.n === 'df') { cur = []; defs.push(cur); } else if (c.n === 'de') cur = null; else (cur || cmds).push(c); } return { cmds, defs }; }
function run(P, B, cmds, S0, Cx) {
  if (!Cx) { const p = prep(P); Cx = { defs: p.defs, G: [] }; cmds = p.cmds; }
  const G = Cx.G; let gi = 0;
  let S = Object.assign({ f: '#000000', s: null, w: 1, fo: 1, so: 1, a: 1, fr: 0, cap: 0, join: 0, ml: 4, dash: [], dof: 0, ta: 0, ft: [0, 4, 0], m: ID }, S0 && { ...S0, m: ID });
  const stk = [], pc = v => P.pal[v]; let dep = 0, last = null, ck = 0, ckl = [], ckdep = 0, ckdone = false;
  const flush = () => { if (ckdone && dep === ckdep) { const im = inv(S.m); B.clip(ckl.map(i => ({ d: i.d, r: i.r, m: mul(im, i.m) }))); ckdone = false; } };
  const T = m => { B.tf(m); S.m = mul(S.m, m); };
  const scope = f => { const k = S; S = { ...S }; B.save(); f(); B.restore(); S = k; };
  const sh = c => {
    const { n, a } = c;
    if (n === 't') return B.text(a[0], a[1], a[2], a[3], { fill: S.f, fo: S.fo, a: S.a, ta: S.ta, ft: S.ft });
    const d = SH[n](a); if (!d) return;
    if (ck) { ckl.push({ d, r: S.fr, m: S.m }); if (!--ck) { ckdone = true; flush(); } return; }
    const op = OPEN.has(n), sc = S.s || (op && typeof S.f === 'string' ? S.f : null);
    B.draw(d, { fill: op ? null : S.f, stroke: sc, fo: S.fo, so: S.so, a: S.a, fr: S.fr, w: S.w, cap: S.cap, join: S.join, ml: S.ml, dash: S.dash, dof: S.dof });
  };
  B.save();
  cmds.forEach((c, i) => {
    const { n, a } = c;
    if (SH[n] || n === 't') { last = c; sh(c); return; }
    switch (n) {
      case 'f': S.f = a[0] ? pc(a[0] - 1) : null; break;
      case 's': S.s = a[0] ? pc(a[0] - 1) : null; break;
      case 'w': S.w = a[0]; break;
      case 'fo': S.fo = a[0] / 1000; break; case 'so': S.so = a[0] / 1000; break; case 'al': S.a = a[0] / 1000; break;
      case 'fr': S.fr = a[0]; break; case 'cap': S.cap = a[0]; break; case 'join': S.join = a[0]; break;
      case 'ml': S.ml = a[0]; break; case 'dash': S.dash = a[0]; break; case 'do': S.dof = a[0]; break;
      case 'ta': S.ta = a[0]; break; case 'ft': S.ft = a; break;
      case 'gl': G[gi++] = { t: 'l', v: a.slice(0, 4), spread: a[4], m: a[5], stops: a[6].map(s => ({ o: s[0] / 1000, c: pc(s[1]), op: s[2] / 1000 })) }; break;
      case 'gr': G[gi++] = { t: 'r', v: a.slice(0, 5), spread: a[5], m: a[6], stops: a[7].map(s => ({ o: s[0] / 1000, c: pc(s[1]), op: s[2] / 1000 })) }; break;
      case 'fg': S.f = { g: G[a[0]] }; break; case 'sg': S.s = { g: G[a[0]] }; break;
      case 'go': B.group(a[0] / 1000); break;
      case 'sv': stk.push({ ...S }); B.save(); dep++; break;
      case 'rs': if (dep) { S = stk.pop(); B.restore(); dep--; flush(); } break;
      case 'tr': T(TR(a[0], a[1])); break; case 'ro': T(RO(a[0])); break;
      case 'sc': T([a[0], 0, 0, a[1], 0, 0]); break; case 'mx': T(a); break;
      case 'clip': ck = a[0]; ckl = []; ckdep = dep; ckdone = false; break;
      case 'x': for (let j = 1; last && j <= a[0]; j++) scope(() => { T(TR(a[1] * j, a[2] * j)); sh(last); }); break;
      case 'xr': for (let j = 1; last && j <= a[0]; j++) scope(() => { T(ROA(a[1] * j, a[2], a[3])); sh(last); }); break;
      case 'us': if (Cx.defs[a[0]]) scope(() => { T(TR(a[1], a[2])); run(P, B, Cx.defs[a[0]], S, Cx); }); break;
      case 'mir': scope(() => { T([-1, 0, 0, 1, 2 * a[0], 0]); run(P, B, cmds.slice(0, i), null, Cx); }); break;
      case 'mih': scope(() => { T([1, 0, 0, -1, 0, 2 * a[0]]); run(P, B, cmds.slice(0, i), null, Cx); }); break;
    }
  });
  while (dep-- > 0) B.restore();
  B.restore();
}

/* ---------- backends ---------- */
function svgB() {
  const o = [], defs = [], st = [0], ids = new Map(); let id = 0;
  const stops = g => g.stops.map(s => `<stop offset="${s.o}" stop-color="${s.c}"${s.op < 1 ? ` stop-opacity="${s.op}"` : ''}/>`).join('');
  const pt = f => {
    if (!f) return 'none'; if (typeof f === 'string') return f;
    const g = f.g; let gid = ids.get(g);
    if (!gid) {
      gid = 'g' + id++; ids.set(g, gid);
      const at = ` id="${gid}" gradientUnits="userSpaceOnUse" spreadMethod="${SPREAD[g.spread]}"` + (g.m ? ` gradientTransform="matrix(${g.m.join(' ')})"` : '');
      defs.push(g.t === 'l' ? `<linearGradient${at} x1="${g.v[0]}" y1="${g.v[1]}" x2="${g.v[2]}" y2="${g.v[3]}">${stops(g)}</linearGradient>`
        : `<radialGradient${at} cx="${g.v[0]}" cy="${g.v[1]}" r="${g.v[2]}" fx="${g.v[3]}" fy="${g.v[4]}">${stops(g)}</radialGradient>`);
    }
    return `url(#${gid})`;
  };
  const mx = m => `matrix(${m.map(v => +v.toFixed(5)).join(' ')})`;
  return {
    o, defs, save() { st.push(0); }, restore() { o.push('</g>'.repeat(st.pop())); },
    tf(m) { o.push(`<g transform="${mx(m)}">`); st[st.length - 1]++; },
    group(v) { o.push(`<g opacity="${v}">`); st[st.length - 1]++; },
    clip(list) {
      const k = 'k' + id++;
      defs.push(`<clipPath id="${k}">${list.map(i => `<path d="${i.d}"${i.m.join() === ID.join() ? '' : ` transform="${mx(i.m)}"`}${i.r ? ' clip-rule="evenodd"' : ''}/>`).join('')}</clipPath>`);
      o.push(`<g clip-path="url(#${k})">`); st[st.length - 1]++;
    },
    draw(d, s) {
      let t = `<path d="${d}" fill="${pt(s.fill)}"`;
      if (s.fill) { if (s.fo < 1) t += ` fill-opacity="${s.fo}"`; if (s.fr) t += ' fill-rule="evenodd"'; }
      if (s.stroke) {
        t += ` stroke="${pt(s.stroke)}" stroke-width="${s.w}" stroke-linecap="${CAP[s.cap]}" stroke-linejoin="${JOIN[s.join]}"`;
        if (s.so < 1) t += ` stroke-opacity="${s.so}"`; if (s.ml !== 4) t += ` stroke-miterlimit="${s.ml}"`;
        if (s.dash.length) t += ` stroke-dasharray="${s.dash.join(' ')}"` + (s.dof ? ` stroke-dashoffset="${s.dof}"` : '');
      }
      o.push(t + (s.a < 1 ? ` opacity="${s.a}"` : '') + '/>');
    },
    text(x, y, z, t, s) {
      const f = s.ft; o.push(`<text x="${x}" y="${y}" font-size="${z}" font-family="${FAM[f[0]]}" font-weight="${f[1] * 100}"${f[2] ? ' font-style="italic"' : ''} text-anchor="${ANCH[s.ta]}" fill="${pt(s.fill)}"${s.fo < 1 ? ` fill-opacity="${s.fo}"` : ''}${s.a < 1 ? ` opacity="${s.a}"` : ''}>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
    }
  };
}
function canvasB(ctx0) {
  let ctx = ctx0; const fr = [];
  const rgba = (c, o) => `rgba(${[1, 3, 5].map(i => parseInt(c.substr(i, 2), 16))},${o})`;
  // canvas only knows "pad": reflect/repeat are emulated by expanding the gradient over +-N periods
  function expand(g) {
    if (!g.spread) return { v: g.v, st: g.stops };
    const n = 6, st = [], rf = g.spread === 1, v = g.v;
    const rev = s => g.stops.slice().reverse().map(x => ({ ...x, o: 1 - x.o }));
    if (g.t === 'l') {
      const dx = v[2] - v[0], dy = v[3] - v[1];
      for (let t = -n; t <= n; t++) for (const s of (rf && (t & 1)) ? rev() : g.stops) st.push({ ...s, o: (t + n + s.o) / (2 * n + 1) });
      return { v: [v[0] - n * dx, v[1] - n * dy, v[2] + n * dx, v[3] + n * dy], st };
    }
    for (let t = 0; t <= n; t++) for (const s of (rf && (t & 1)) ? rev() : g.stops) st.push({ ...s, o: (t + s.o) / (n + 1) });
    return { v: [v[0], v[1], v[2] * (n + 1), v[3], v[4]], st };
  }
  const style = (c, f) => {
    if (!f || typeof f !== 'object') return f;
    const g = f.g, e = expand(g), v = e.v, x = g.t === 'l' ? c.createLinearGradient(v[0], v[1], v[2], v[3]) : c.createRadialGradient(v[3], v[4], 0, v[0], v[1], v[2]);
    e.st.forEach(s => x.addColorStop(Math.min(1, Math.max(0, s.o)), rgba(s.c, s.op))); return x;
  };
  const begin = () => { const c = document.createElement('canvas'); c.width = ctx.canvas.width; c.height = ctx.canvas.height; const x = c.getContext('2d'); x.setTransform(ctx.getTransform()); const L = { prev: ctx }; ctx = x; return L; };
  const end = (L, v) => { const o = ctx; ctx = L.prev; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = v; ctx.drawImage(o.canvas, 0, 0); ctx.restore(); };
  const sprops = (c, s) => { c.lineWidth = s.w; c.lineCap = CAP[s.cap]; c.lineJoin = JOIN[s.join]; c.miterLimit = s.ml; c.setLineDash(s.dash); c.lineDashOffset = s.dof; };
  function fillP(f, p, rule) {
    ctx.save(); let q = p;
    if (f && f.g && f.g.m) { ctx.transform(...f.g.m); q = new Path2D(); q.addPath(p, new DOMMatrix(f.g.m).inverse()); }
    ctx.fillStyle = style(ctx, f); ctx.fill(q, rule ? 'evenodd' : 'nonzero'); ctx.restore();
  }
  function strokeP(f, p, s) {
    if (!(f && f.g && f.g.m)) { ctx.strokeStyle = style(ctx, f); ctx.stroke(p); return; }
    // gradient with its own matrix: stroke a mask, then paint the transformed gradient through it
    const T = ctx.getTransform(), a = ctx.globalAlpha, o = document.createElement('canvas'); o.width = ctx.canvas.width; o.height = ctx.canvas.height;
    const c = o.getContext('2d'); c.setTransform(T); sprops(c, s); c.strokeStyle = '#000'; c.stroke(p);
    c.globalCompositeOperation = 'source-in'; c.setTransform(T); c.transform(...f.g.m); c.fillStyle = style(c, f); c.fillRect(-1e5, -1e5, 2e5, 2e5);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.drawImage(o, 0, 0); ctx.restore();
  }
  return {
    save() { ctx.save(); fr.push(null); },
    restore() { const f = fr.pop(); if (f) end(f.L, f.v); ctx.restore(); },
    tf: m => ctx.transform(...m),
    group(v) { if (fr.length) { fr[fr.length - 1] = { L: begin(), v }; } },
    clip(list) { const p = new Path2D(); list.forEach(i => p.addPath(new Path2D(i.d), new DOMMatrix(i.m))); ctx.clip(p, list[0].r ? 'evenodd' : 'nonzero'); },
    draw(d, s) {
      const p = new Path2D(d), lay = s.a < 1 && s.fill && s.stroke ? begin() : null, a = lay ? 1 : s.a;
      if (s.fill) { ctx.globalAlpha = a * s.fo; fillP(s.fill, p, s.fr); }
      if (s.stroke) { ctx.globalAlpha = a * s.so; sprops(ctx, s); strokeP(s.stroke, p, s); }
      if (lay) end(lay, s.a);
    },
    text(x, y, z, t, s) { const f = s.ft; ctx.globalAlpha = s.a * s.fo; ctx.font = `${f[2] ? 'italic ' : ''}${f[1] * 100} ${z}px ${FAM[f[0]]}`; ctx.textAlign = ['start', 'center', 'end'][s.ta]; ctx.fillStyle = style(ctx, s.fill) || '#000'; ctx.fillText(t, x, y); }
  };
}
const load = x => typeof x !== 'string' ? x : /^[a-z][a-z0-9+.-]*:\/\//i.test(x.trim()) || /^(QVG:)?[0-9A-Z\-.$*:]+$/.test(x.trim()) ? decode(x) : parse(x);
/** source text | payload | program -> SVG string */
function toSVG(x) {
  const P = load(x), B = svgB(); run(P, B);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${P.w} ${P.h}" width="${P.w}" height="${P.h}">${B.defs.length ? '<defs>' + B.defs.join('') + '</defs>' : ''}${B.o.join('')}</svg>`;
}
/** draw onto a <canvas> (resized to `width` px wide, keeps aspect) */
function toCanvas(x, canvas, width) {
  const P = load(x), s = width ? width / P.w : 1;
  canvas.width = Math.round(P.w * s); canvas.height = Math.round(P.h * s);
  const ctx = canvas.getContext('2d'); ctx.scale(s, s); run(P, canvasB(ctx)); return canvas;
}

const QVG = { parse, stringify, optimize, encode, compile: encode, decode, toSVG, toCanvas, info, toURL, fromURL, norm, q12, SEG, OPS: OPS.map(o => o[0]), version: 4 };
if (typeof module !== 'undefined' && module.exports) module.exports = QVG; else root.QVG = QVG;
})(typeof self !== 'undefined' ? self : this);
