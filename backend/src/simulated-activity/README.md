# SIM-01 backend boundary

This module implements display-only simulated trade activity under the locked contract in `docs/SIMULATED-TRADE-ACTIVITY-LOCK.md`.

- Events are deterministic, immutable and idempotent per subscription/policy/local-date/slot.
- Simulation never posts wallet, ledger, reward, cap, commission or deposit money.
- Policy publication is SUPER_ADMIN-only and activates on a safe local calendar-day boundary.
- Worker execution requires both the explicit infrastructure opt-in and Platform Operations `AUTOMATIC` mode.
- Reconciliation calls the same authoritative generator as the worker and cannot inject arbitrary outcomes or percentages.
