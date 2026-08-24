# Global Project Delivery Standard

This is the default delivery workflow for all future software projects unless the Founder explicitly overrides it for a specific project.

## 1. Production-ready by default
- Do not trade away security, validation, data integrity, auditability, maintainability, scalability, or financial safety for speed.
- Keep architecture deliberate and avoid unnecessary infrastructure, duplicate services, or speculative scope.

## 2. Focused vertical slices
Deliver one focused module/API slice at a time:
1. confirm the contract and business rules;
2. implement the smallest production-ready slice;
3. run the relevant local module gate;
4. run the repository-wide local gate;
5. if database changes exist, apply them explicitly and run the milestone/database gate;
6. verify changed APIs locally with Postman/manual API testing;
7. update persistent project documentation/current state;
8. open a PR to main only after all local gates are green.

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
- Apply migrations explicitly and locally before API sign-off.
- Inspect and repair failed migrations rather than blindly retrying or marking them applied.
- Do not reset a real application database as routine recovery.
- Do not use development migration workflows that require extra/shadow databases unless explicitly approved for that project.

## 7. API-first local verification
For modules exposing APIs:
- verify locally first;
- use Postman/manual requests for success, authorization, validation, conflict/idempotency, and important negative cases;
- only after Postman/manual API verification is green move to the next module or PR preparation.

## 8. PR discipline
- Work on a feature branch.
- No PR to main until local code gate, database gate when relevant, and Postman/manual API gate are green.
- Keep meaningful milestones committed and pushed so work is recoverable across sessions.

## 9. Failure handling
- Stop at the first failing layer.
- Fix the actual failing layer; never bypass or disable the check to get green output.
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

This workflow is the default for future projects unless explicitly changed by the Founder.
