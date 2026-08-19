export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_STATUS_MANAGE: 'users.status.manage',
  USERS_ROLES_MANAGE: 'users.roles.manage',
  RBAC_READ: 'rbac.read',
  RBAC_MANAGE: 'rbac.manage',
} as const;

export const SYSTEM_PERMISSIONS = [
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
    code: PERMISSIONS.RBAC_READ,
    description: 'View roles and permissions',
  },
  {
    code: PERMISSIONS.RBAC_MANAGE,
    description: 'Manage roles and role permissions',
  },
] as const;
