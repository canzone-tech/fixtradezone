# Global Project Delivery Standard

This is the default delivery workflow for all future software projects unless the Founder explicitly overrides it for a specific project.

## 1. Production-ready by default
- Do not trade away security, validation, data integrity, auditability, maintainability, scalability, or financial safety for speed.
- Keep architecture deliberate and avoid unnecessary infrastructure, duplicate services, or speculative scope.

## 2. Focused vertical slices
Deliver one focused module/API slice at a time:
1. confirm the contract and business rules;
2. implement the production-ready backend/API foundation;
3. implement the matching frontend/BFF/UI integration for the same slice;
4. run automated backend and frontend code gates;
5. if database changes exist, apply them explicitly and verify migration status;
6. start integrated functional acceptance from the frontend/UI using explicit test cases;
7. use direct API/Postman checks only to isolate or debug a failing UI/business function, or where a security/negative case has no practical UI surface;
8. verify database/audit side effects where relevant;
9. run the repository-wide final milestone gate;
10. update persistent project documentation/current state;
11. open a PR to main only after the integrated local gate is green and the Founder explicitly approves it.

A backend-only API gate may be used as an intermediate development checkpoint, but it does not count as final module sign-off once a frontend exists for that slice.

Do not start the next milestone while the active vertical slice is still in implementation or acceptance.

## 3. Verification is read-only
Normal verification must not mutate source files or database state.

Typical read-only checks include:
- schema/config validation;
- formatting check mode;
- lint;
- typecheck;
- automated tests;
- production build;
- unstaged and staged diff checks;
- database migration status.

Generated files must be excluded from formatting/lint gates when they are owned by generators.

## 4. Write operations are explicit
Keep mutating commands separate from verification, including:
- formatter write/fix commands;
- lint autofix;
- code generation;
- database migration deployment;
- schema formatting tools that rewrite files;
- seed/bootstrap mutations.

Never hide a write operation inside a command named verify/check/status.

Feature-branch CI may apply and commit deterministic formatting or safe lint autofixes only when the workflow makes that mutation explicit, runs the full code gate on the resulting working tree, and never auto-writes `main` or a pull-request merge result.

## 5. Root one-command gate
Each project should provide a repository-root verification command such as:

```bash
npm run verify:local
```

It should orchestrate the appropriate backend/frontend/admin/app gates for that repository.

For database-backed milestones, provide a separate command such as:

```bash
npm run verify:milestone
```

that adds read-only database migration/status checks.

## 6. Database safety
- Apply migrations explicitly and locally before integrated module sign-off.
- Inspect and repair failed migrations rather than blindly retrying or marking them applied.
- Do not reset a real application database as routine recovery.
- Do not use development migration workflows that require extra/shadow databases unless explicitly approved for that project.

## 7. Frontend-first integrated local acceptance
For modules that expose APIs and have a frontend/UI surface, final local acceptance starts from the frontend rather than from a standalone Postman collection.

The Founder receives an explicit UI test case/checklist for the active milestone. The UI flow must verify, as applicable:
- loading and empty states;
- success paths;
- validation and important negative cases;
- authorization/RBAC behavior exposed by the UI;
- conflict/idempotency behavior;
- frontend/BFF requests reaching the intended backend endpoints;
- authenticated session behavior and token/session renewal where relevant;
- data created or changed in the UI being reflected correctly after reload/readback;
- responsive behavior for the supported protected/public UI surface.

If a UI function fails, isolate that function at its API boundary with Postman or an equivalent direct API check. Postman remains a support/debug and non-UI security testing tool; it is not the default starting point once a frontend exists.

After UI acceptance, verify database/audit side effects where the milestone changes persistent or financial state, then run the final repository milestone gate.

Do not move to the next module or PR preparation until this integrated gate is green.

## 8. PR discipline
- Work on a feature branch.
- No PR to main until automated code gates, database gate when relevant, frontend-first integrated acceptance, database/audit readback when relevant, and the final milestone gate are green.
- A PR requires explicit Founder approval.
- Backend and frontend work for the same vertical slice may use child branches, but final PR preparation happens only after they are integrated back into the slice branch and reverified together.
- Keep meaningful milestones committed and pushed so work is recoverable across sessions.

## 9. Failure handling
- Stop at the first failing layer.
- Fix the actual failing layer; never bypass or disable the check to get green output.
- Before handing a rerun back to the Founder, sweep adjacent files in the active milestone for the same class of problem so failures are not fixed one at a time unnecessarily.
- Prefer small, deterministic commands over large brittle shell scripts.
- Do not mix unrelated modules while diagnosing a failure.

## 10. Default project bootstrap
At project start, create/adapt these commands immediately:
- `verify:<module>` for major applications/modules as needed;
- `verify:local` at repository root;
- `verify:milestone` when database-backed milestones exist;
- `db:status` as read-only status;
- `db:deploy` as explicit write operation;
- formatting/check commands separated into write vs check modes.

Also define the integrated acceptance path early: backend and frontend are implemented as one vertical slice, automated gates run before handoff, and manual acceptance starts from the frontend with API tools used for isolation/debugging.

## 11. Global form guidance and feedback
All project UI surfaces must use shared form-feedback primitives instead of page-specific help/error presentation.

- **Guidance and constraints:** concise requirements that help the user before an action (allowed file types, maximum file size, address/network rules, format examples, destructive-action consequences) belong in the shared accessible field-help tooltip pattern.
- **Field validation errors:** validation failures caused by one specific field must render next to that field, remain visible without hover, use accessible error semantics, and connect to the control with `aria-invalid` / `aria-describedby` where practical. Do not hide actual errors only inside tooltips.
- **Page/API failures:** authentication failures, server errors, cross-field/business-rule conflicts, and operation-level failures use the shared flash/toast pattern rather than a custom page banner where a global primitive exists.
- **Success feedback:** use the shared success flash/toast pattern unless persistent confirmation is part of the page contract.
- **Accessibility:** help triggers must be keyboard focusable, expose an accessible label, and work on hover/focus/touch-capable interfaces. Critical instructions must never rely on hover alone.
- **Consistency:** modules must reuse `admin/src/components/ui` primitives. Do not create local tooltip/error components or duplicate styling unless the shared primitive cannot satisfy an explicitly approved requirement.

This workflow is the default for future projects unless explicitly changed by the Founder.
