# Trade Activity portal boundary

The ADMIN and USER workspaces present the feature as **Trade Activity** / **Daily Trades** while continuing to consume the authenticated legacy `simulated-activity` BFF/API routes internally.

- ADMIN navigation uses `Trade Activity`; USER navigation uses `Daily Trades`.
- Legacy `/simulated-trades` and `/user/simulated-activity` browser routes redirect to the client-facing routes.
- Every major surface clearly states that Trade Activity is system-generated and does **not** represent external market execution.
- Historical event times render using each event's immutable policy timezone snapshot.
- SUPER_ADMIN may manage versioned policy configuration, including trades/day and minimum trade gap; permissioned ADMIN users may read/reconcile without editing history.
- The default draft target is five trades per ACTIVE subscription with a 240-minute minimum gap. The UI explains that this requires a sufficiently wide timing window.
- USER pages expose no Buy, Sell, Close or other external-execution controls.
- No Trade Activity result is presented as wallet money or as broker/exchange-realized profit, and the module itself has `financialEffect: NONE`.

Internal identifiers remain `simulated_*` / `simulated_activity.*` intentionally for backwards compatibility and immutable-history stability.
