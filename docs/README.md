# FixTradeZone Documentation

These documents are the persistent project source of truth used to continue development across chat sessions, ChatGPT Work, and Codex.

## Start Here
1. `CURRENT-STATE.md` — exact current implementation state and next actions.
2. `WORK-CODEX-OPERATING-BRIEF.md` — canonical Work/Codex/normal-Chat handoff and fallback rules.
3. `PROJECT-CONTEXT.md` — product requirements and locked rules.
4. `ARCHITECTURE.md` — system and technology architecture.
5. `DECISIONS.md` — locked architecture decisions / ADRs.
6. `DATABASE.md` — database design and migration state.
7. `SECURITY.md` — security standards.
8. `API-CONTRACT.md` — API/testing conventions and historical endpoint contracts.
9. `ROADMAP.md` — current phase-by-phase roadmap; later decisions here supersede older planning references.
10. `LOCAL-VERIFICATION.md` — locked repository-wide local verification and delivery gate.
11. `LOCAL-VERIFY-AUTH-ADMIN.md` — auth/admin local gate.
12. `MLM-BUSINESS-RULES.md` — canonical numbered MLM/package decision record.
13. `PACKAGES-PLAN-FOUNDATION.md` — Founder-approved PKG-01 implementation contract.
14. `LOCAL-VERIFY-PACKAGES.md` — PKG-01 local acceptance procedure.
15. `DEPOSITS-FOUNDATION.md` — locked DEP-01 USDT TRC20 receiving-account, deposit, TXID and manual-review contract.
16. `CHANGELOG.md` — session and milestone history.

## Current scope precedence

`CURRENT-STATE.md`, `ROADMAP.md`, `DECISIONS.md`, and the active module contract have precedence when an older historical document uses superseded planning language. In particular, FixTradeZone v1 has no AI Agents/trading-engine milestone; only a later explicitly labelled Simulated Trade Activity display is in scope.

## Rule
Any material architecture, security, business-rule, continuity, or delivery-process decision should be reflected in these documents before the codebase moves forward.

The repository and committed `docs/` are the permanent source of truth. ChatGPT Work, Codex, and normal Chat are execution interfaces and may be interchanged without changing the delivery gates.
