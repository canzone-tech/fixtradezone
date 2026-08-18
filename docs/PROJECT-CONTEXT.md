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
- Client HTML is Template 001 / initial visual baseline, not permanent hardcoded production UI.
- Landing page is template-based.
- Template and content/configuration are separate.
- Admin can change templates, themes, sections, order, visibility, content, media, CTAs, navigation, SEO/meta, etc.
- CMS supports draft/publish and versioning.
- Public frontend renders published configuration.
- Admin panel is modular/template-based.

## Timeline
- Production-ready v1: 12–14 weeks.
- Internal target: 12 weeks.
- Client-facing committed timeline: 14 weeks including contingency.
- Major milestones require client review/approval.

