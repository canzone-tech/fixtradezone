# FixTradeZone — PWA Strategy

Status: LOCKED

FixTradeZone v1 uses the existing responsive Next.js USER portal as the single mobile-capable client and progressively enhances it into an installable Progressive Web App (PWA).

## Locked rules

- USER portal is PWA-first for v1.
- Flutter/native mobile is deferred unless a concrete native-only requirement appears later.
- The same Next.js same-origin BFF remains the browser/PWA boundary.
- Access and refresh tokens remain in HttpOnly/SameSite cookies and are not exposed to browser JavaScript.
- NestJS remains authentication, authorization and business-logic authority.
- Mobile browser compatibility is mandatory before PWA installation; PWA must not be used to hide unresolved browser/BFF defects.
- Sensitive authenticated/business responses are network-authoritative. Service-worker caching must not make stale authentication, authorization, package, deposit, ledger, commission or other mutable business state appear current.
- Offline support is limited to safe static assets/application shell and explicit offline/error UX where appropriate.
- ADMIN remains a responsive web application; installable PWA focus is the USER portal.

## Why PWA first

The current Next.js USER portal, responsive Dark Neo shell, BFF session boundary and NestJS APIs can be reused without creating a second client codebase. This keeps v1 delivery and verification focused while still supporting mobile installation and app-like behavior.

## Flutter decision

Flutter may be reconsidered in a future version only for requirements that materially need a native client, such as deeper platform APIs, stronger native biometric/keychain workflows, constrained background execution, or app-store-specific capabilities that cannot be delivered safely through the PWA.

## Current mobile compatibility note

The mobile-only login security-challenge loading issue is a separate compatibility defect and must be resolved at the browser/BFF layer before PWA enablement is considered complete.
