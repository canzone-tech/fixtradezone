# V1 Public Landing / CMS / Template Release

Status: development implementation on `feature/v1-closeout-release-gaps`.
Final local acceptance remains intentionally pending until the Founder starts the
module-by-module Postman gate.

## Architecture

- MySQL is the only FixTradeZone application database for this release.
- Public landing layout is a code-owned `DARK_NEO_V1` template using the same
  FixTradeZone Dark Neo design tokens as the dashboards.
- Content is separate from layout and is stored as structured JSON revisions.
- No raw HTML editor or `dangerouslySetInnerHTML` path exists.
- Email templates are structured/plain-text content templates with server-side
  variable allowlists.
- Public rendering uses only the current publication pointer. Invalid or
  unavailable public content fails closed to the code-versioned safe default.

## Versioning and publication

Migration `0029_v1_content_cms_templates` introduces immutable content revisions
and the dedicated `content.read`, `content.manage`, and `content.publish`
permissions.

Migration `0030_content_publication_pointer` adds one explicit live-publication
pointer per content key. Publishing a draft creates its first publication state.
Selecting an already-published historical revision changes only the pointer;
the historical revision payload and original publication metadata are not edited.

This provides deterministic rollback without turning an old published revision
back into a draft.

## Administration

`/templates` is available to ADMIN/SUPER_ADMIN according to the dedicated
content permissions.

The workspace provides:

- structured public landing fields;
- landing revision history;
- immutable draft creation;
- publish and historical rollback selection;
- managed email-template selection;
- email revision history;
- whitelisted template-variable visibility;
- plain-text email draft creation and publication.

All write APIs remain protected by the existing admin BFF/session origin checks,
backend JWT authentication, permission enforcement, DTO validation and audit
logging.

## Public landing

`/` is the public marketing entry point and no longer redirects to `/login`.

The page reuses FixTradeZone Dark Neo tokens and exposes:

- account operations;
- referral visibility;
- transparent simulated activity;
- security/governance messaging;
- configurable CTAs and SEO metadata;
- a prominent simulated-activity disclosure.

The page never represents simulated activity as real exchange execution or
real/guaranteed/withdrawable trading profit.

## Acceptance hold

Do not treat source CI as final runtime acceptance.

After all release development is zero-pending, local acceptance must still run
in the locked order:

1. pull/verify branch, HEAD, status and migration state;
2. `prisma migrate deploy` only;
3. backend/admin build, lint, typecheck and tests;
4. Postman module/API acceptance one module at a time;
5. browser/UI acceptance;
6. financial SQL/ledger proof for financial modules;
7. PR to `main` only after every local gate is GREEN.

Never touch or stage `backups/`.
