# FixTradeZone — Local HTTPS + Full-App PWA Verification

## Scope

This guide is for trusted local/LAN development only. Production TLS is terminated by the production web/reverse-proxy platform and must use a publicly trusted certificate.

The complete Next.js application is the PWA surface. Login, ADMIN and USER routes share one manifest and one root-scoped service worker. NestJS stays bound to the local backend boundary and the Next.js BFF remains the browser-facing authentication/session boundary.

## 1. Install a local certificate authority

Ubuntu 24.04:

```bash
sudo apt update
sudo apt install -y mkcert libnss3-tools
mkcert -install
```

Never commit the generated CA, certificate or private key.

## 2. Generate the local HTTPS certificate

Inspect current LAN IPv4 addresses:

```bash
hostname -I
```

Create the ignored certificate directory and generate a certificate covering localhost and the current trusted LAN IPv4 addresses:

```bash
cd ~/FixTradeZone
mkdir -p admin/certs
cd admin
mkcert \
  -cert-file certs/fixtradezone.local.pem \
  -key-file certs/fixtradezone.local-key.pem \
  localhost 127.0.0.1 ::1 192.168.31.84 192.168.31.50
```

If the LAN address changes to an address not present in the certificate SAN list, regenerate the certificate before device testing.

## 3. Trust the development CA on the test phone/tablet

Find the local CA directory:

```bash
mkcert -CAROOT
```

Copy only `rootCA.pem` from that directory to the trusted test device through a private local transfer. Never transfer or publish `rootCA-key.pem`.

Install/trust the CA using the device operating-system certificate/profile settings. A browser warning that is merely bypassed is not accepted for PWA verification.

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

Open an address included in the certificate, for example:

```text
https://192.168.31.84:3001/login
```

Do not expose NestJS port 3000 to the LAN merely for browser/PWA use. Next.js BFF continues to call `API_BASE_URL=http://127.0.0.1:3000` server-side.

## 5. PWA boundary

The install manifest is `/manifest.webmanifest` with scope `/` and start URL `/`.

The service worker is `/sw.js`, registered from the root application layout with scope `/`.

The service worker intentionally does **not** cache:

- `/api/*`
- authentication/session responses
- package/deposit/ledger/commission/business JSON
- protected page HTML/navigation
- mutable financial/business state

Only explicitly listed static brand assets are cacheable. Sensitive state remains network-authoritative.

## 6. Mobile/tablet install-required behavior

Browsers do not allow silent forced PWA installation. User interaction is required by the platform.

FixTradeZone therefore uses the strongest supported mobile install flow:

1. Normal mobile/tablet browser mode shows a blocking FixTradeZone install screen.
2. Chromium/Android uses the browser's native install prompt when `beforeinstallprompt` is available.
3. iPhone/iPad shows Add to Home Screen instructions because iOS does not expose the same programmatic install prompt.
4. Once launched in installed standalone mode, the blocking gate is removed.
5. Desktop browser access remains available for ADMIN/operator workflows.

## 7. Browser and installed-app acceptance

On desktop and at least one real mobile device:

1. Open HTTPS with no certificate warning.
2. Confirm `/manifest.webmanifest` loads and has root scope `/`.
3. Confirm service worker `/sw.js` is active with root scope `/`.
4. Confirm mobile normal-browser mode shows the install-required screen.
5. Install FixTradeZone and relaunch from the installed icon.
6. Confirm the installed app can reach login, ADMIN routes for ADMIN/SUPER_ADMIN accounts, and USER routes for USER accounts using the same PWA shell.
7. Confirm login/session flow works through the same-origin Next.js BFF.
8. Confirm ADMIN and USER routes remain responsive.
9. Disable network and confirm sensitive/auth/business state is not falsely served as fresh data.
10. Restore network and confirm normal session/API behavior resumes.

## 8. Automated gate

After pulling the full-app PWA changes:

```bash
cd ~/FixTradeZone
npm run verify:local
```

Do not treat the PWA slice as accepted until the automated gate and the real-device HTTPS/PWA checks are green.
