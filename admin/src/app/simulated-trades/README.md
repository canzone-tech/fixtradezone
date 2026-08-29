# SIM-01 portal boundary

The ADMIN and USER simulated-activity workspaces render display-only simulation data from the authenticated BFF routes.

- Every major surface labels the data `SIMULATED RESULTS — NOT REAL TRADING`.
- Historical event times render using each event's immutable simulation-policy timezone snapshot.
- SUPER_ADMIN may manage versioned policy configuration; permissioned ADMIN users may read/reconcile without editing history.
- USER pages expose no Buy, Sell, Close or other real-trade controls.
- No simulated result is presented as wallet money, withdrawable profit, reward, cap or commission income.
