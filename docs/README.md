# FixTradeZone Documentation

These documents are the persistent project source of truth used to continue development across chat sessions, ChatGPT Work, and Codex.

## Start Here
1. `CURRENT-STATE.md` — exact current implementation state and next actions.
2. `WORK-CODEX-OPERATING-BRIEF.md` — canonical Work/Codex/normal-Chat handoff, delivery workflow, current MLM checkpoint, and fallback rules.
3. `PROJECT-CONTEXT.md` — product requirements and locked rules.
4. `ARCHITECTURE.md` — system and technology architecture.
5. `DECISIONS.md` — locked architecture decisions / ADRs.
6. `DATABASE.md` — database design and migration state.
7. `SECURITY.md` — security standards.
8. `API-CONTRACT.md` — API/testing conventions.
9. `ROADMAP.md` — phase-by-phase roadmap.
10. `LOCAL-VERIFICATION.md` — locked repository-wide local verification and delivery gate.
11. `LOCAL-VERIFY-AUTH-ADMIN.md` — required local gate for the current auth/admin slice.
12. `MLM-BUSINESS-RULES.md` — canonical numbered MLM/package decision record.
13. `PACKAGES-PLAN-FOUNDATION.md` — Founder-approved PKG-01 implementation contract.
14. `LOCAL-VERIFY-PACKAGES.md` — required migration/Postman/SQL backend gate before package UI work.
15. `CHANGELOG.md` — session and milestone history.

## Rule
Any material architecture, security, business-rule, continuity, or delivery-process decision should be reflected in these documents before the codebase moves forward.

The repository and committed `docs/` are the permanent source of truth. ChatGPT Work, Codex, and normal Chat are execution interfaces and may be interchanged without changing the delivery gates.
