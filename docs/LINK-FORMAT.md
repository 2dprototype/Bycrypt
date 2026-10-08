# Bycrypt link format

```
<prefix><payload>?SEK                       legacy link (the original format, always valid)
<prefix><payload>?SEK~xSxExK                + extended codes
<prefix><payload>?SEK~xSxExK~k=v&k=v       + public parameters (readable before unlocking)
<prefix>_?SEK~xSxExK~...#<payload>          privacy mode (xE=2): ciphertext only in the #fragment
```

## Compatibility contract

1. **S, E, K are frozen.** Codes `0`-`3` (S), `0`-`2` (E), `0`-`4` (K) keep their meaning forever.
2. The legacy parser reads only characters 0-2 of the query, so everything after the first `~` is invisible to old
   versions. A link that uses no extended feature is **byte-identical** to the original format (no `~`).
3. `_` in an extended slot means "inherit the legacy slot".
4. Every extended code also writes the nearest legacy code, so older decrypters degrade to something usable:
   - extended scan types (xS 4-8) write legacy S = 0 (text) or 3 (download for *file*);
   - puzzle key methods write K = 0 (password box) or 1 (PIN box) and the canonical key string can be typed by hand;
   - *Passkey* and *Key file* write K = `_` (nothing usable in old versions - they need the new decrypter).
5. Unknown extended codes fall back to the legacy slot. If nothing usable remains the page says
   "needs a newer version" instead of staying blank.

## Extended codes

| xS | meaning | legacy S | | xE | meaning |
|---|---|---|---|---|---|
| 4 | Wi-Fi (`WIFI:T:WPA;S:..;P:..;;`) | 0 | | `_`/0 | legacy CryptoJS AES (passphrase mode) |
| 5 | contact (vCard 3.0) | 0 | | 1 | PBKDF2-SHA256 + AES-256-GCM |
| 6 | link list (`Title \| url` per line) | 0 | | 2 | same, payload in `#fragment` |
| 7 | Markdown note | 0 | | | |
| 8 | file (`BYCFILE:name:mime:base64`) | 3 | | | |

| xK | method | legacy K | canonical key string |
|---|---|---|---|
| 0-4 | alphanumeric, PIN, pattern, location, fingerprint | same | unchanged from the original |
| 5 | icon sequence | 0 | `star-key-moon-heart` (slugs of PALETTE_V1) |
| 6 | picture hotspots | 0 | `h8:12.37.5` (grid size, cell = row*g+col) |
| 7 | grid pattern | 0 | `p5:0.1.7.12` |
| 8 | secret tile order | 0 | `t3:4.1.0.8.3.2.7.6.5` |
| 9 | melody | 0 | `C4-E4-G4-C5` |
| a | tap rhythm | 0 | `S.S_L` (S/L press, `.`/`_` short/long pause) |
| b | riddle | 0 | normalised answers joined by `|` |
| c | dial lock | 1 | digits |
| d | composite | 0 | parts joined by `+` |
| e | passkey (WebAuthn PRF) | `_` | `prf:<hex>` |
| g | key file | `_` | `file:<sha256 hex>` |

## Parameters (after the second `~`, URL-encoded, never secret)

`t` title, `n` message, `h` hint, `m` max attempts (soft, per device); method parameters: `img`, `g`, `n`,
`k`, `s`, `w`, `q0..q2`, `cid`, `ps`; composite: `cm` (member codes) and `p<i>.<name>` per member.

## Enhanced payload (xE 1/2)

```
blob      = 0x01 | iterations/1000 (u16 BE) | salt(16) | iv(12) | AES-256-GCM(ciphertext+tag)   AAD = first 3 bytes
container = 0x02 | count | (len u16 BE | blob)...      several keys (decoy); order is shuffled
plaintext = flags (bit0: raw deflate) | UTF-8 JSON {v, d, nb?, ex?}
key       = PBKDF2-HMAC-SHA256(NFKC(canonical key string), salt, iterations)   default 200,000
```

## Frozen assets

`PALETTE_V1` (64 slugs, `js/icons.js`), the procedural pictures `1..8` and `shuffleSeeded()` (`js/scenes.js`)
define canonical key strings. `tests/golden.json` holds their digests and `node tests/run.js` fails if they change.
