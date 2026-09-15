# FixTradeZone — SITE-MODE-01 Platform Mode Control

Status: **ACCEPTED / LOCAL POSTMAN + BROWSER + FINAL LOCAL GATES GREEN**  
Accepted date: **2026-09-15**  
Feature branch: `feature/site-mode-control`  
Accepted code checkpoint before this documentation commit: `62e098cb7384a7a543c409081d763dc6378cf139`

## Purpose

SITE-MODE-01 provides one authoritative Platform Mode switch for public availability,
authenticated access and the master operations profile. The mode switch does not
replace existing package, deposit, commission, reward, trading or accounting
business rules; it controls when those existing systems operate automatically or
under controlled/manual conditions.

The platform timezone remains locked to **UTC**.

## Locked mode matrix

| Platform Mode | Public application | Registration | Login/access | Operations profile |
| --- | --- | --- | --- | --- |
| `LIVE` | Available | Enabled | Public authenticated access | `AUTOMATIC` |
| `TESTING` | Coming Soon screen | Disabled | Approved ACTIVE testers + `SUPER_ADMIN` | `CONTROLLED_MANUAL` |
| `MAINTENANCE` | Maintenance screen | Disabled | `SUPER_ADMIN` only | `CONTROLLED_MANUAL` |

Additional rules:

- TESTING and MAINTENANCE pause automatic processing.
- Ordinary manual recovery is locked while LIVE.
- While LIVE, `SUPER_ADMIN` may explicitly unlock a short audited emergency
  recovery window for **5–60 minutes** and may lock it again immediately.
- Mode changes reset emergency-recovery state.
- Only ACTIVE users may be added to the TESTING allowlist.
- Tester membership does not grant access in MAINTENANCE.

## Backend authority

Public endpoint:

- `GET /public/site-mode`

`SUPER_ADMIN` endpoints:

- `GET /admin/settings/site-mode`
- `PATCH /admin/settings/site-mode`
- `GET /admin/settings/site-mode/testers`
- `POST /admin/settings/site-mode/testers`
- `DELETE /admin/settings/site-mode/testers/:userId`
- `POST /admin/settings/site-mode/emergency-recovery/unlock`
- `POST /admin/settings/site-mode/emergency-recovery/lock`

The public response exposes the authoritative mode, operations profile, optional
message/launch time, server time, public-application availability, registration
availability and login-access policy.

Mode changes are server-authoritative and synchronize:

- `LIVE` -> `operationsMode = AUTOMATIC`
- `TESTING` / `MAINTENANCE` -> `operationsMode = CONTROLLED_MANUAL`
- `AUTOMATIC` -> deposit posting `AUTO_ON_APPROVAL`
- `CONTROLLED_MANUAL` -> deposit posting `MANUAL_RECONCILIATION`

The legacy independent operations mutation is intentionally disabled. Attempts to
change operations mode through the old operations configuration path are rejected
with guidance to use `/admin/settings/site-mode`.

Registration and authenticated access are also enforced by the backend. Frontend
gating is an additional UX layer and is not the security authority.

## Persistence

Migration: `0044_site_mode_control`

It adds the Platform Mode fields to `system_operations_config`:

- `siteMode`
- `modeMessage`
- `launchAt`
- `recoveryUnlockedUntil`
- `recoveryReason`

It also creates `site_mode_testers`, keyed by user ID, with optional audit note and
creator metadata. Existing `CONTROLLED_MANUAL` installations are mapped to TESTING
when the migration is applied; AUTOMATIC installations remain LIVE.

All mode changes, tester changes and emergency-recovery actions are audited.
Historical financial/accounting records remain unchanged by Platform Mode.

## Frontend behavior

The single Next.js application under `admin/` implements the public and protected
mode UX:

- public `/` is server-gated by the authoritative public Site Mode status;
- LIVE renders the normal public landing page;
- TESTING renders Coming Soon;
- MAINTENANCE renders the Maintenance page;
- public mode-fetch failure is fail-closed;
- `/register` is available only in LIVE;
- `/login` remains reachable so authorized TESTING/MAINTENANCE recovery identities
  can authenticate, with a visible mode banner when not LIVE;
- ADMIN and USER shells display the TESTING/MAINTENANCE banner;
- `/settings/operations` is retained as the stable route but now presents the
  authoritative **Platform Mode Control** surface;
- the control surface contains LIVE / TESTING / MAINTENANCE cards, audit reason,
  public message, optional UTC launch/return time, public preview, tester access,
  emergency recovery and audit-log access;
- the shared locked navy/cyan universal UI remains the visual authority.

## Accepted local verification

### API / Postman

Backend SITE-MODE-01 API acceptance was completed locally before frontend browser
acceptance. Accepted behavior included:

- LIVE public/admin status;
- LIVE -> TESTING transition and automatic pause;
- TESTING public/admin readback;
- tester-list baseline;
- authoritative derived access/registration policy.

These accepted API tests are not to be repeated unless a later failure specifically
requires targeted diagnosis.

### Browser acceptance

Local browser acceptance was completed mode-by-mode:

**TESTING**

- public `/` -> Coming Soon;
- `/register` blocked;
- `/login` reachable with TESTING banner;
- ordinary ACTIVE user blocked before tester approval;
- tester added by `SUPER_ADMIN` -> same user successfully entered USER workspace;
- TESTING banner visible in USER workspace;
- tester removed -> same user blocked again;
- tester count restored to `0`;
- emergency recovery remained unavailable/inactive outside LIVE;
- cross-device checks on the local network also passed.

**MAINTENANCE**

- public `/` -> Maintenance page;
- `/register` blocked;
- ordinary user blocked with `SUPER_ADMIN`-only policy;
- `SUPER_ADMIN` retained recovery/admin access;
- MAINTENANCE banner visible in protected admin UI;
- emergency recovery remained inactive outside LIVE.

**LIVE**

- mode changed to `LIVE · AUTOMATIC`;
- normal public landing restored;
- registration restored;
- normal user login/access restored;
- TESTING/MAINTENANCE banners disappeared;
- emergency recovery unlocked for a 5-minute audited window and then locked again;
- tester count remained `0`.

Final accepted runtime state:

```text
siteMode: LIVE
operationsMode: AUTOMATIC
recoveryActive: false
testerCount: 0
```

### Final local repository gates

At accepted code checkpoint `62e098cb7384a7a543c409081d763dc6378cf139`:

```text
Branch: feature/site-mode-control
Prisma migrations: 44
Database schema: up to date
Admin platform-time verification: GREEN (UTC locked)
Admin lint: GREEN
Admin typecheck: GREEN
Admin production build: GREEN
```

The only local untracked paths were:

```text
?? backups/
?? postman/__pycache__/
```

Both paths are protected and must remain untouched/untracked.

## Delivery lock

- MySQL is the authoritative FixTradeZone database.
- Never use `prisma migrate dev`.
- Never reset the database.
- Use forward migrations only with `prisma migrate deploy`.
- Do not repeat accepted SITE-MODE-01 Postman/browser tests unless a new failure
  requires a targeted retest.
- Do not alter the locked Site Mode matrix without explicit product approval.
- PR to `main` only after repository documentation is committed, remote CI/checks
  are reviewed, the documentation head is pulled locally with fast-forward only,
  and the final worktree remains clean except for the two protected untracked paths.
