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
  RBAC_READ: 'rbac.read',
  RBAC_MANAGE: 'rbac.manage',
} as const;

export const SYSTEM_PERMISSIONS = [
  {
    code: PERMISSIONS.DASHBOARD_READ,
    description: 'View administration dashboard and market data',
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
    code: PERMISSIONS.RBAC_READ,
    description: 'View roles and permissions',
  },
  {
    code: PERMISSIONS.RBAC_MANAGE,
    description: 'Manage roles and role permissions',
  },
] as const;
