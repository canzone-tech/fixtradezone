# FixTradeZone — PWA Strategy

Status: LOCKED

FixTradeZone v1 uses the existing responsive Next.js application as the single installable Progressive Web App (PWA) surface for both ADMIN and USER routes.

## Locked rules

- The complete Next.js application is the PWA surface: login, ADMIN and USER routes share one manifest and one root-scoped service worker.
- Flutter/native mobile is deferred unless a concrete native-only requirement appears later.
- The same Next.js same-origin BFF remains the browser/PWA boundary.
- Access and refresh tokens remain in HttpOnly/SameSite cookies and are not exposed to browser JavaScript.
- NestJS remains authentication, authorization and business-logic authority.
- Mobile browser compatibility is mandatory before PWA installation; PWA must not be used to hide unresolved browser/BFF defects.
- Sensitive authenticated/business responses are network-authoritative. Service-worker caching must not make stale authentication, authorization, package, deposit, ledger, commission or other mutable business state appear current.
- Offline support is limited to explicitly safe static assets and explicit offline/error UX where appropriate.
- Mobile/tablet browser use is install-gated where the platform exposes installability. Installed standalone mode is the intended mobile experience.
- Browsers do not permit silent forced installation. A user gesture is required by the platform. FixTradeZone therefore uses the strongest supported install-required UX: a blocking mobile install screen, native install prompt when available, and explicit Add to Home Screen instructions where no programmatic prompt exists.
- Desktop browser access remains available for normal ADMIN/operator workflows.

## Why PWA first

The current Next.js responsive Dark Neo application, BFF session boundary and NestJS APIs can be reused without creating a second client codebase. This keeps v1 delivery and verification focused while supporting mobile installation and app-like behavior across ADMIN and USER flows.

## Service-worker security boundary

The root-scoped service worker may cache only explicitly approved static assets. It must not cache `/api/*`, authenticated page HTML, session/auth responses, package/deposit/ledger/commission/business JSON, or mutable financial/business state.

## Flutter decision

Flutter may be reconsidered in a future version only for requirements that materially need a native client, such as deeper platform APIs, stronger native biometric/keychain workflows, constrained background execution, or app-store-specific capabilities that cannot be delivered safely through the PWA.
