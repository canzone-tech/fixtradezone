# FixTradeZone Platform Time — UTC Lock

Status: LOCKED

## Platform standard

FixTradeZone uses **UTC** as the single operational platform-time standard.

- Admin and USER operational timestamps render in UTC.
- New platform scheduling/configuration uses UTC.
- SUPER_ADMIN cannot change the platform timezone away from UTC.
- Browser/device locale or host timezone must not change operational timestamp meaning.
- Absolute database timestamps remain absolute instants and are not shifted by this lock.

## Historical snapshot immutability

This lock does **not** rewrite historical financial or trading schedule snapshots.

Existing records may contain an immutable `timezoneSnapshot` such as `Asia/Kolkata`. That value records the scheduling policy under which the historical event/state was created and must remain unchanged for auditability.

UI must distinguish such values as **Schedule timezone snapshot** rather than presenting them as the current platform timezone.

## Internal Trading

Internal Trading history uses the event's immutable absolute `scheduledAt` timestamp for operational display.

Trade History must show:

- `UTC Date`
- `Time (UTC)`
- `Day / Slot`

The displayed UTC date/time must be calculated from `scheduledAt`. The historical `localTradeDate` must not be relabeled as UTC.

Existing internal-trading policy/state timezone snapshots are immutable. A previously published policy may therefore continue to show `Asia/Kolkata` as its **Schedule timezone snapshot**. New policies published after the UTC platform lock snapshot UTC through the platform configuration.

## Operations configuration

`system_operations_config.platformTimezone` is normalized to `UTC` by forward migration `0038_platform_timezone_utc`.

Only this mutable singleton platform setting is normalized. Migration 0038 does not backfill or rewrite historical event, policy, subscription, financial, or settlement timezone snapshots.

The Operations UI exposes UTC as a read-only platform standard while leaving the independent operations mode (`AUTOMATIC` / `CONTROLLED_MANUAL`) configurable according to existing RBAC and audit rules.

## Engineering guardrails

- Use `admin/src/lib/platform-time.ts` for operational date/time display.
- Do not use browser-local `toLocaleDateString`, `toLocaleTimeString`, or direct `Intl.DateTimeFormat` in feature UI code.
- Admin CI verifies the centralized formatter and asserts that `DEFAULT_PLATFORM_TIMEZONE` remains `UTC`.
- Backend operations mutations reject non-UTC platform timezone values.
- Never alter immutable historical timestamps merely to make their old snapshot timezone match UTC.
