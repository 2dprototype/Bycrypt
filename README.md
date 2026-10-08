# Bycrypt

Bycrypt generates encrypted QR codes. Scan the code, open the link, unlock it with a password, a puzzle, your
location or a passkey, and the hidden data appears.

* Live: https://bycrypt.web.app (or https://bycrypt.pages.dev)
* Run locally: `node dev-server.js` then open http://localhost:8080 (single-page app with history routing)

## What's new

**Fully backward compatible.** Every link made by any earlier version still opens, and legacy-mode links are
byte-identical to the original format. See `docs/LINK-FORMAT.md`.

* **Scan types:** text, redirect, account, download (original) plus Wi-Fi, contact card, link list, Markdown note, small file.
* **Unlock methods:** alphanumeric, PIN, pattern, location, fingerprint (original) plus icon sequence, picture hotspots,
  grid pattern, secret tile order, melody, tap rhythm, riddle, dial lock, composite (2-3 combined), passkey (WebAuthn PRF), key file.
* **Modes:** *Legacy-compatible* (opens in every version) or *Enhanced* (PBKDF2 + AES-GCM, compression,
  not-before / expiry, decoy key, privacy mode that keeps the ciphertext out of server logs).
* **Tools:** batch sheet generator (printable, CSV), link inspector, SVG/PNG export with quiet zone, offline PWA,
  password generator and strength meter, unlock-page title/message/hint, soft attempt limit.
* **Fixes:** fingerprint links made at first registration (SHA-256) and later (MD5) both open; location tolerates
  grid edges; Redirect no longer runs `javascript:` / `data:` links and asks before leaving; secure random passwords;
  unknown link codes show a clear message instead of a blank page.

Icons are local SVGs in the Feather style (no emoji, no CDN). The map for the Location method loads
`ol@10.3.1` from jsDelivr and is optional (coordinates can be typed).

## Tests

```
node tests/run.js            # core: legacy <-> new compatibility in both directions, crypto, helpers (no browser)
python3 tests/ui_smoke.py    # browser: pages load (needs: pip install playwright && playwright install chromium)
python3 tests/ui_e2e.py      # browser: every key method create -> open -> unlock, legacy fixtures, fingerprint, passkey
python3 tests/ui_e2e2.py     # browser: Enhanced, scan types, safety, batch, inspector, exports
```

`tests/legacy/` holds frozen copies of the original code used as the reference.

## Security notes

A QR code contains the ciphertext, so anyone holding it can guess keys offline. Strength depends on the key's
entropy (the creator shows an estimate). Legacy mode uses CryptoJS passphrase encryption (fast to guess);
Enhanced mode slows each guess with PBKDF2. Not-before/expiry, attempt limits and decoys are enforced in the
viewer's browser and are soft barriers. A decoy link reveals, to anyone who analyses its structure, that a
second sealed item exists.
