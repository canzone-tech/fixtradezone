export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard.read',
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_STATUS_MANAGE: 'users.status.manage',
  USERS_ROLES_MANAGE: 'users.roles.manage',
  USERS_IMPERSONATE: 'users.impersonate',
  REFERRALS_SPONSOR_MANAGE: 'referrals.sponsor.manage',
  PACKAGES_READ: 'packages.read',
  PACKAGES_DRAFT_MANAGE: 'packages.draft.manage',
  DEPOSIT_ACCOUNTS_READ: 'deposits.accounts.read',
  DEPOSIT_ACCOUNTS_MANAGE: 'deposits.accounts.manage',
  DEPOSITS_READ: 'deposits.read',
  DEPOSITS_REVIEW: 'deposits.review',
  WALLETS_READ: 'wallets.read',
  LEDGER_READ: 'ledger.read',
  LEDGER_POST: 'ledger.post',
  SUBSCRIPTIONS_READ: 'subscriptions.read',
  SUBSCRIPTIONS_ACTIVATE: 'subscriptions.activate',
  COMMISSIONS_READ: 'commissions.read',
  COMMISSIONS_PLAN_MANAGE: 'commissions.plan.manage',
  COMMISSIONS_RECONCILE: 'commissions.reconcile',
  REWARDS_READ: 'rewards.read',
  REWARDS_RECONCILE: 'rewards.reconcile',
  SIMULATED_ACTIVITY_READ: 'simulated_activity.read',
  SIMULATED_ACTIVITY_RECONCILE: 'simulated_activity.reconcile',
  RBAC_READ: 'rbac.read',
  RBAC_MANAGE: 'rbac.manage',
} as const;

export const SYSTEM_PERMISSIONS = [
  {
    code: PERMISSIONS.DASHBOARD_READ,
    description: 'View administration dashboard and operational data',
  },
  {
    code: PERMISSIONS.USERS_READ,
    description: 'View users and user details',
  },
  {
    code: PERMISSIONS.USERS_CREATE,
    description: 'Create platform users',
  },
  {
    code: PERMISSIONS.USERS_STATUS_MANAGE,
    description: 'Activate, suspend, block, and unblock users',
  },
  {
    code: PERMISSIONS.USERS_ROLES_MANAGE,
    description: 'Assign and remove permitted user roles',
  },
  {
    code: PERMISSIONS.USERS_IMPERSONATE,
    description: 'Temporarily access an eligible user account for support',
  },
  {
    code: PERMISSIONS.REFERRALS_SPONSOR_MANAGE,
    description: 'Assign and exceptionally reassign referral sponsors',
  },
  {
    code: PERMISSIONS.PACKAGES_READ,
    description: 'View package plan versions and draft package terms',
  },
  {
    code: PERMISSIONS.PACKAGES_DRAFT_MANAGE,
    description: 'Create and edit package plan drafts',
  },
  {
    code: PERMISSIONS.DEPOSIT_ACCOUNTS_READ,
    description: 'View configured deposit payment rails and receiving accounts',
  },
  {
    code: PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE,
    description:
      'Create and manage deposit payment rails and receiving accounts',
  },
  {
    code: PERMISSIONS.DEPOSITS_READ,
    description: 'View deposit requests and payment review state',
  },
  {
    code: PERMISSIONS.DEPOSITS_REVIEW,
    description: 'Approve or reject submitted deposit payments',
  },
  {
    code: PERMISSIONS.WALLETS_READ,
    description: 'View USER wallet totals and accounting bucket balances',
  },
  {
    code: PERMISSIONS.LEDGER_READ,
    description: 'View immutable accounting transactions and entries',
  },
  {
    code: PERMISSIONS.LEDGER_POST,
    description: 'Post or reconcile eligible approved deposits into accounting',
  },
  {
    code: PERMISSIONS.SUBSCRIPTIONS_READ,
    description: 'View USER package subscriptions and activation history',
  },
  {
    code: PERMISSIONS.SUBSCRIPTIONS_ACTIVATE,
    description:
      'Reconcile eligible approved and accounted deposits into package activation',
  },
  {
    code: PERMISSIONS.COMMISSIONS_READ,
    description:
      'View referral commission plans, events and reconciliation state',
  },
  {
    code: PERMISSIONS.COMMISSIONS_PLAN_MANAGE,
    description: 'Create, edit and publish versioned referral commission plans',
  },
  {
    code: PERMISSIONS.COMMISSIONS_RECONCILE,
    description:
      'Reconcile package subscriptions into referral commission events',
  },
  {
    code: PERMISSIONS.REWARDS_READ,
    description:
      'View package reward events, cap state and package lifecycle progress',
  },
  {
    code: PERMISSIONS.REWARDS_RECONCILE,
    description:
      'Reconcile due package rewards through the authoritative reward engine',
  },
  {
    code: PERMISSIONS.SIMULATED_ACTIVITY_READ,
    description:
      'View simulated trade activity policies, events and generator health',
  },
  {
    code: PERMISSIONS.SIMULATED_ACTIVITY_RECONCILE,
    description:
      'Run idempotent simulated activity reconciliation for eligible subscriptions',
  },
  {
    code: PERMISSIONS.RBAC_READ,
    description: 'View roles and permissions',
  },
  {
    code: PERMISSIONS.RBAC_MANAGE,
    description: 'Manage roles and role permissions',
  },
] as const;
