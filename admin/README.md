# FixTradeZone Admin

Minimal Next.js admin foundation for the fast v1 rollout.

## Current slice

- administrator login through the NestJS API
- HttpOnly access and refresh cookies managed by Next.js route handlers
- automatic refresh-token rotation when the access token expires
- protected dashboard shell with ADMIN-role enforcement
- logout with server-side refresh-session revocation
- strict HttpOnly cookies, response-shape validation, cross-site request rejection, and security headers
- FixTradeZone admin UI uses the locked dark neon FixTradeZone design system

No business metrics are mocked. Users, packages, deposits, audit views, and CMS controls remain disabled until their API slices are implemented and locally verified.

## Local setup

```bash
cp .env.example .env.local
npm ci
npm run dev -- --port 3001
```

The NestJS API must be running at the `API_BASE_URL` configured in `.env.local`.

## Quality checks

```bash
npm run lint
npm run build
```

The reviewed `package-lock.json` is committed and must remain in sync with `package.json`.
