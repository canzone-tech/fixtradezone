# FixTradeZone — Project Context

## Project Role
- Assistant role: Chief Architect (CA).
- Production-ready code is the default standard.
- Never sacrifice architecture, security, data integrity, scalability, maintainability, validation, auditability, or financial safety for speed.
- Development is step-by-step and milestone-based.
- ChatGPT Work with the connected GitHub repository is approved for inspection and controlled repository changes.
- The GitHub repository and `docs/` are the persistent source of truth across sessions.
- Avoid unnecessary detours, duplicated services/databases, or time-wasting commands.
- Prefer cohesive multi-file milestones when several directly related files can be reviewed and delivered together.
- Locked delivery flow: local feature branch -> automated checks -> relevant Postman/API verification -> push -> pull request -> green CI -> review -> merge.
- Build API and the corresponding minimal admin screen in the same vertical slice.
- Optimize v1 for a fast, focused launch; do not build a "seven wonders" platform before go-live.

## Locked Product Rules
- Users do not perform real trades in FixTradeZone.
- Simulated trade activity may show configurable daily simulated trades (example: 5/day), configurable wins/losses, assets, ranges, and timing.
- Simulated results must always be clearly labeled and never represented as real trading.
- Multiple USDT TRC20 deposit accounts are managed by admin.
- Users never select a deposit account; backend randomly assigns one active account per deposit request.
- The assigned wallet address and QR are shown to the user.
- User submits TXID manually after payment.
- Deposit becomes PENDING until an authorized admin manually verifies and APPROVES or REJECTS.
- TXID submission never automatically credits the balance.
- Duplicate TXID reuse must be prevented.
- Wallet private keys and seed phrases are never stored.

## Landing Page / CMS
- Ronel React is the public landing visual reference and must be ported to Next.js; its Vite dependencies and template backend are not production sources.
- FixTradeZone uses its own locked dark neon design system for admin and user dashboards; no third-party dashboard template is used.
- Third-party template license provenance must be resolved before production asset reuse.
- Landing page is template-based.
- Template and content/configuration are separate.
- V1 exposes only launch-critical content controls.
- Full template/theme/section reordering, versioning, and broad CMS configurability move to v2.
- Public frontend renders published configuration.
- Admin panel is modular/template-based.

## Timeline
- Production-ready v1: 12–14 weeks.
- Internal target: 12 weeks.
- Client-facing committed timeline: 14 weeks including contingency.
- Major milestones require client review/approval.
