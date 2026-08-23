import { ConflictException, ForbiddenException } from '@nestjs/common';
import { attachAuthSessionId, type AuthenticatedUser } from '../auth/auth-user';
import { PasswordService } from '../auth/password.service';
import { RbacBootstrapService } from '../auth/rbac-bootstrap.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from './users.service';

const ACTOR_SESSION_ID = 'actor-session-id';

interface AuditCreateArgs {
  data: {
    actorUserId: string;
    action: string;
    entityId: string;
    [key: string]: unknown;
  };
}

interface FindActiveArgs {
  where: {
    actorUserId: string;
    actorSessionId: string;
    activeKey: string;
    endedAt: null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface UpdateImpersonationArgs {
  where: {
    id: string;
  };
  data: {
    activeKey: null;
    endReason: string;
    [key: string]: unknown;
  };
}

function makeActor(): AuthenticatedUser {
  return attachAuthSessionId(
    {
      id: 'actor-id',
      email: 'admin@fixtradezone.com',
      username: 'admin',
      phone: null,
      firstName: 'Platform',
      lastName: 'Admin',
      status: 'ACTIVE',
      createdAt: new Date(),
      lastLoginAt: new Date(),
      roles: ['ADMIN', 'USER'],
      permissions: ['users.impersonate'],
    },
    ACTOR_SESSION_ID,
  );
}

function makeTarget(
  overrides: {
    id?: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'PENDING';
    roles?: string[];
  } = {},
) {
  const roles = overrides.roles ?? ['USER'];

  return {
    id: overrides.id ?? 'subject-id',
    email: 'user@example.com',
    username: 'user',
    phone: null,
    firstName: 'Test',
    lastName: 'User',
    status: overrides.status ?? 'ACTIVE',
    createdAt: new Date(),
    lastLoginAt: null,
    roles: roles.map((name) => ({
      role: {
        name,
        status: 'ACTIVE' as const,
        permissions: [],
      },
    })),
  };
}

describe('UsersService impersonation security', () => {
  const transaction = {
    impersonationSession: {
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    impersonationSession: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordService = {
    hash: jest.fn(),
  };

  const rbacBootstrapService = {
    ensureDefaultUserRole: jest.fn(),
  };

  const tokenService = {
    issueImpersonationToken: jest.fn(),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    service = new UsersService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
      tokenService as unknown as TokenService,
    );
  });

  it('refuses self impersonation', async () => {
    const actor = makeActor();

    prisma.user.findUnique.mockResolvedValue(
      makeTarget({
        id: actor.id,
      }),
    );

    await expect(
      service.startImpersonation(actor.id, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tokenService.issueImpersonationToken).not.toHaveBeenCalled();
  });

  it('refuses inactive user impersonation', async () => {
    const actor = makeActor();

    prisma.user.findUnique.mockResolvedValue(
      makeTarget({
        status: 'SUSPENDED',
      }),
    );

    await expect(
      service.startImpersonation('subject-id', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tokenService.issueImpersonationToken).not.toHaveBeenCalled();
  });

  it('refuses administrator impersonation', async () => {
    const actor = makeActor();

    prisma.user.findUnique.mockResolvedValue(
      makeTarget({
        roles: ['USER', 'ADMIN'],
      }),
    );

    await expect(
      service.startImpersonation('subject-id', actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tokenService.issueImpersonationToken).not.toHaveBeenCalled();
  });

  it('refuses a second active impersonation for the same admin session', async () => {
    const actor = makeActor();

    prisma.user.findUnique.mockResolvedValue(makeTarget());

    prisma.impersonationSession.updateMany.mockResolvedValue({
      count: 0,
    });

    prisma.impersonationSession.findFirst.mockResolvedValue({
      id: 'existing-impersonation-id',
    });

    await expect(
      service.startImpersonation('subject-id', actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tokenService.issueImpersonationToken).not.toHaveBeenCalled();
  });

  it('creates an impersonation session and audit event', async () => {
    const actor = makeActor();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    prisma.user.findUnique.mockResolvedValue(makeTarget());

    prisma.impersonationSession.updateMany.mockResolvedValue({
      count: 0,
    });

    prisma.impersonationSession.findFirst.mockResolvedValue(null);

    tokenService.issueImpersonationToken.mockResolvedValue({
      impersonationToken: 'signed-token',
      expiresAt,
      expiresIn: 1800,
    });

    transaction.impersonationSession.create.mockResolvedValue({
      id: 'impersonation-id',
      createdAt: new Date(),
      expiresAt,
    });

    transaction.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.startImpersonation('subject-id', actor, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(tokenService.issueImpersonationToken).toHaveBeenCalledWith(
      {
        id: 'subject-id',
      },
      actor.id,
      ACTOR_SESSION_ID,
      expect.any(String),
    );

    expect(transaction.impersonationSession.create).toHaveBeenCalled();

    const auditCreateMock = transaction.auditLog.create as jest.MockedFunction<
      (args: AuditCreateArgs) => unknown
    >;

    const startAuditCall: AuditCreateArgs | undefined =
      auditCreateMock.mock.calls[0]?.[0];

    expect(startAuditCall).toMatchObject({
      data: {
        actorUserId: actor.id,
        action: 'IMPERSONATION_START',
        entityId: 'subject-id',
      },
    });

    expect(result.impersonationToken).toBe('signed-token');
    expect(result.expiresIn).toBe(1800);
  });

  it('ends only the current actor session impersonation and audits the return', async () => {
    const actor = makeActor();

    prisma.impersonationSession.findFirst.mockResolvedValue({
      id: 'impersonation-id',
      subjectUserId: 'subject-id',
      subject: {
        email: 'user@example.com',
      },
    });

    transaction.impersonationSession.update.mockResolvedValue({
      id: 'impersonation-id',
    });

    transaction.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.stopImpersonation(actor, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    const findFirstMock = prisma.impersonationSession
      .findFirst as jest.MockedFunction<(args: FindActiveArgs) => unknown>;

    const findActiveCall: FindActiveArgs | undefined =
      findFirstMock.mock.calls[0]?.[0];

    expect(findActiveCall).toMatchObject({
      where: {
        actorUserId: actor.id,
        actorSessionId: ACTOR_SESSION_ID,
        activeKey: ACTOR_SESSION_ID,
        endedAt: null,
      },
    });

    const updateSessionMock = transaction.impersonationSession
      .update as jest.MockedFunction<
      (args: UpdateImpersonationArgs) => unknown
    >;

    const updateSessionCall: UpdateImpersonationArgs | undefined =
      updateSessionMock.mock.calls[0]?.[0];

    expect(updateSessionCall).toMatchObject({
      where: {
        id: 'impersonation-id',
      },
      data: {
        activeKey: null,
        endReason: 'ACTOR_RETURN',
      },
    });

    const stopAuditCreateMock = transaction.auditLog
      .create as jest.MockedFunction<(args: AuditCreateArgs) => unknown>;

    const stopAuditCall: AuditCreateArgs | undefined =
      stopAuditCreateMock.mock.calls[0]?.[0];

    expect(stopAuditCall).toMatchObject({
      data: {
        actorUserId: actor.id,
        action: 'IMPERSONATION_STOP',
        entityId: 'subject-id',
      },
    });

    expect(result.impersonationId).toBe('impersonation-id');
  });

  it('returns safely when no impersonation is active', async () => {
    const actor = makeActor();

    prisma.impersonationSession.findFirst.mockResolvedValue(null);

    const result = await service.stopImpersonation(actor);

    expect(result).toEqual({
      message: 'No active impersonation session.',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
