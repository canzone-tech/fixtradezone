# FixTradeZone Protected Portal UI Design Lock

Status: **FOUNDER LOCKED**

Applies to: **SUPER_ADMIN, ADMIN and USER protected workspaces**.

## Permanent visual reference

The approved visual baseline is the **Referral Commission Control** screen.

All protected pages must use the same visual language:

- page canvas: very dark navy
- primary card / hero / workspace surface: `linear-gradient(145deg, rgba(8, 23, 53, 0.94), rgba(4, 13, 36, 0.97))`
- primary surface border: `rgba(74, 129, 206, 0.26)`
- primary surface radius: `18px`
- primary surface inset treatment: `inset 0 0 26px rgba(0, 112, 255, 0.04)`
- primary accent: cyan / teal
- primary text: off-white
- secondary text: muted blue-grey
- controls: dark navy, restrained blue border, cyan focus state
- tables: compact finance-console hierarchy
- gradients must remain restrained; no page-specific purple, green, orange or unrelated palette may replace the shared surface language

The implementation authority is `admin/src/styles/universal-ui.scss`.

## Architecture rule

Page-level CSS is allowed only for page-specific layout, responsive structure and unique component geometry.

Page-level CSS must **not** redefine:

- the protected portal card/hero/workspace background palette
- global surface borders
- global card radius language
- global typography palette
- global form-control theme
- global table theme
- global focus treatment

Legacy page-level palette declarations may remain temporarily while pages are migrated, but the universal stylesheet is authoritative and must override them.

## Role consistency

SUPER_ADMIN, ADMIN and USER pages must look like parts of the same FixTradeZone product. Role and permission differences may change data, controls and navigation access, but must not create a different visual theme.

## Shared readability and typography

Readability is a shared platform rule, not a page-specific preference. **SUPER_ADMIN, ADMIN and USER protected pages must use the same stronger typography floor.** Auth screens use the same readability layer where the same semantic elements appear.

The shared readability authority is `admin/src/styles/fixtradezone-readability.scss`.

Locked direction:

- secondary text and technical copy: minimum `13px`, normally semibold
- form labels: minimum `14px`, semibold
- table headers: minimum `13px`, bold
- table cells and protected body copy: minimum `14px`, medium weight
- form controls: minimum `15px`
- protected sidebar navigation: `15px`, semibold
- shared platform-promise detail copy: `14px`, semibold
- role-specific pages must not shrink important operational text below the shared readability floor

This typography layer may increase readability without changing the Founder-locked navy/cyan palette, card geometry or financial-console hierarchy.

## Shared platform promise

The protected dashboard for **SUPER_ADMIN, ADMIN and USER must render the same shared platform promise** from one reusable component. Role-specific wording is not permitted.

Locked copy:

> **Built for what’s next.**
>
> AI-powered insights and intelligent automation.
>
> Enterprise-grade security by design.
>
> Smarter support, powered by AI.

Implementation authority for the wording is `admin/src/components/brand/platform-promise.tsx`. The component must inherit the protected portal surface language; it must not introduce a role-specific palette or role-specific copy.

## Change control

This design baseline is permanent. Do not alter the locked palette or pattern during normal module development, refactors or acceptance fixes.

A change to this baseline requires **explicit Founder approval** and must be recorded in repository documentation before implementation.

## Public pages

Public/marketing pages may use their own composition where required, but they must remain FixTradeZone-branded and do not override the protected portal design authority above.
