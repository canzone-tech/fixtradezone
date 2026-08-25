# FixTradeZone — Local HTTPS + USER PWA Verification

## Scope

This guide is for trusted local/LAN development only. Production TLS is terminated by the production web/reverse-proxy platform and must use a publicly trusted certificate.

The USER portal is the PWA surface. ADMIN remains responsive web. NestJS stays bound to the local backend boundary and the Next.js BFF remains the browser-facing authentication/session boundary.

## 1. Install a local certificate authority

Ubuntu 24.04:

```bash
sudo apt update
sudo apt install -y mkcert libnss3-tools
mkcert -install
```

`mkcert -install` creates a development CA and installs it in the local desktop trust store. Never commit the generated CA, certificate or private key.

## 2. Generate the local HTTPS certificate

From the repository root, first inspect current LAN IPv4 addresses:

```bash
hostname -I
```

Create the ignored certificate directory:

```bash
cd ~/FixTradeZone
mkdir -p admin/certs
```

Generate a certificate covering localhost and the current trusted LAN IPv4 addresses. Example for the current development machine:

```bash
cd ~/FixTradeZone/admin
mkcert \
  -cert-file certs/fixtradezone.local.pem \
  -key-file certs/fixtradezone.local-key.pem \
  localhost 127.0.0.1 ::1 192.168.31.84 192.168.31.50
```

Both generated files end in `.pem` and are ignored by `admin/.gitignore`.

If the LAN address changes to an address not present in the certificate SAN list, regenerate the certificate with the new address before testing HTTPS from another device.

## 3. Trust the development CA on the test phone/tablet

Find the local CA directory:

```bash
mkcert -CAROOT
```

Copy only `rootCA.pem` from that directory to the trusted test device through a private local transfer. Do not commit it or publish it.

Install/trust that CA on the test device using the operating system certificate/profile settings. This is required for a real secure context on a LAN IP. A browser warning that is merely bypassed is not accepted for PWA verification.

After local testing is finished, the CA can be removed from the device trust store.

## 4. Run the application

Backend remains local:

```bash
cd ~/FixTradeZone
npm --prefix backend run start:dev
```

In a second terminal start Next.js HTTPS:

```bash
cd ~/FixTradeZone
npm --prefix admin run dev:https
```

The USER portal can then be opened on the trusted device using an address included in the certificate, for example:

```text
https://192.168.31.84:3001/user/dashboard
```

Do not expose NestJS port 3000 to the LAN merely for browser/PWA use. Next.js BFF continues to call `API_BASE_URL=http://127.0.0.1:3000` server-side.

## 5. PWA boundary

The install manifest is `/user-manifest.webmanifest` with scope `/user/` and start URL `/user/dashboard`.

The service worker is `/sw.js` and is registered only from the nested `/user/*` layout with scope `/user/`.

The service worker intentionally does **not** cache:

- `/api/*`
- authentication/session responses
- package/deposit/ledger/commission/business JSON
- protected page HTML/navigation
- mutable financial/business state

Only explicitly listed static brand assets are cacheable. Sensitive state remains network-authoritative.

## 6. Browser acceptance

On desktop and one real mobile device:

1. Open the HTTPS USER portal with no certificate warning.
2. Confirm login/session flow works through the same-origin Next.js BFF.
3. Confirm `/user/packages` and existing USER routes remain responsive.
4. Confirm DevTools/Application shows `user-manifest.webmanifest`.
5. Confirm service worker `/sw.js` is active with scope ending in `/user/`.
6. Confirm browser installation/Add to Home Screen is offered where supported.
7. Launch the installed PWA and confirm it opens `/user/dashboard` in standalone mode.
8. Disable network and confirm sensitive/auth/business data is not falsely served as fresh application state.
9. Restore network and confirm normal session/API behavior resumes.

## 7. Automated gate

After pulling the PWA/HTTPS changes:

```bash
cd ~/FixTradeZone
npm run verify:local
```

Do not treat the PWA slice as accepted until the automated gate and the real-device HTTPS/PWA checks are green.
