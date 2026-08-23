export const AUTH_SESSION_ID: unique symbol = Symbol('AUTH_SESSION_ID');

export const AUTH_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  phone: true,
  firstName: true,
  lastName: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
          status: true,
          permissions: {
            select: {
              permission: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface AuthUserRecord {
  id: string;
  email: string | null;
  username: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'PENDING';
  createdAt: Date;
  lastLoginAt: Date | null;
  roles: Array<{
    role: {
      name: string;
      status: 'ACTIVE' | 'INACTIVE';
      permissions: Array<{
        permission: {
          code: string;
        };
      }>;
    };
  }>;
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  username: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  status: AuthUserRecord['status'];
  createdAt: Date;
  lastLoginAt: Date | null;
  roles: string[];
  permissions: string[];
  [AUTH_SESSION_ID]?: string;
}

export function attachAuthSessionId(
  user: AuthenticatedUser,
  sessionId: string,
): AuthenticatedUser {
  Object.defineProperty(user, AUTH_SESSION_ID, {
    value: sessionId,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return user;
}

export function getAuthSessionId(user: AuthenticatedUser): string | undefined {
  return user[AUTH_SESSION_ID];
}

export function toAuthenticatedUser(user: AuthUserRecord): AuthenticatedUser {
  const activeRoles = user.roles.filter(
    (userRole) => userRole.role.status === 'ACTIVE',
  );

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    roles: activeRoles.map((userRole) => userRole.role.name),
    permissions: [
      ...new Set(
        activeRoles.flatMap((userRole) =>
          userRole.role.permissions.map(
            (rolePermission) => rolePermission.permission.code,
          ),
        ),
      ),
    ],
  };
}
