# Bycrypt

**Bycrypt** is a tool for generating encrypted QR codes with password protection. Encrypt any text, redirect URLs, account details, or downloadable content into a QR code that can only be decrypted with the correct password/PIN/pattern/location/fingerprint.

## Features

- **Multiple password types**: Alphanumeric, PIN, Pattern lock, Location hash, Fingerprint (WebAuthn)
- **Responsive**: Works on desktop and mobile devices
- **Customizable**: QR colors, labels, icons, and background
- **Client‑side**: Everything runs in your browser — no server required
- **Export**: Download QR codes as PNG images

## Quick Start

1. Visit [https://bycrypt.pages.dev/](https://bycrypt.pages.dev/)
2. Click **New** to create an encrypted QR code
3. Choose your password type and enter your secret data
4. Generate and download the QR code
5. Scan it with any QR reader to get a link
6. Open the link and enter your password to reveal the data

## Project Structure

```
├── index.html          # Main entry point
├── css/                # Stylesheets
├── js/                 # Application logic
│   ├── main.js         # Router setup
│   ├── New.js          # QR generator
│   ├── Decrypter.js    # QR decrypter
│   ├── Home.js         # Home page
│   └── func.js         # Utilities
├── lib/                # Third-party libraries
└── res/                # Icons and favicon
```

## Dependencies

- **QRCode.js** – QR code generation
- **Crypto‑JS** – AES encryption/decryption
- **pako** – Data compression
- **OpenLayers** – Location maps
- **PatternLock** – Pattern lock UI

## License
[MIT](LICENSE)

Developed by [2DPrototype](https://github.com/2dprototype)