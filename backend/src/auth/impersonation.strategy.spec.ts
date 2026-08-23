import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { ImpersonationStrategy } from './impersonation.strategy';

describe('ImpersonationStrategy', () => {
  const configService = {
    get: jest.fn().mockReturnValue('access-secret-with-at-least-32-characters'),
  };

  const prisma = {
    impersonationSession: {
      findUnique: jest.fn(),
    },
  };

  const actor = {
    id: 'actor-id',
    email: 'admin@fixtradezone.com',
    username: 'admin',
    phone: null,
    firstName: 'FixTradeZone',
    lastName: 'Admin',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    lastLoginAt: new Date('2026-08-21T00:00:00.000Z'),
    roles: [
      {
        role: {
          name: 'ADMIN',
          status: 'ACTIVE' as const,
          permissions: [
            {
              permission: {
                code: 'users.impersonate',
              },
            },
          ],
        },
      },
      {
        role: {
          name: 'USER',
          status: 'ACTIVE' as const,
          permissions: [],
        },
      },
    ],
  };

  const subject = {
    id: 'subject-id',
    email: 'user@example.com',
    username: 'user',
    phone: null,
    firstName: 'Test',
    lastName: 'User',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    lastLoginAt: null,
    roles: [
      {
        role: {
          name: 'USER',
          status: 'ACTIVE' as const,
          permissions: [],
        },
      },
    ],
  };

  const validSession = {
    id: 'impersonation-id',
    actorUserId: actor.id,
    subjectUserId: subject.id,
    actorSessionId: 'actor-session-id',
    activeKey: 'actor-session-id',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    endedAt: null,
    createdAt: new Date(),
    actor,
    subject,
    actorSession: {
      id: 'actor-session-id',
      userId: actor.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
    },
  };

  const payload = {
    sub: subject.id,
    type: 'impersonation' as const,
    iid: 'impersonation-id',
    act: actor.id,
    asid: 'actor-session-id',
  };

  let strategy: ImpersonationStrategy;

  beforeEach(() => {
    jest.clearAllMocks();

    strategy = new ImpersonationStrategy(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('returns the live subject identity for a valid impersonation session', async () => {
    prisma.impersonationSession.findUnique.mockResolvedValue(validSession);

    await expect(strategy.validate(payload)).resolves.toMatchObject({
      user: {
        id: subject.id,
        email: subject.email,
        roles: ['USER'],
      },
      impersonation: {
        id: 'impersonation-id',
        actor: {
          id: actor.id,
        },
      },
    });
  });

  it('rejects malformed non-impersonation payloads before database lookup', async () => {
    await expect(
      strategy.validate({
        ...payload,
        type: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.impersonationSession.findUnique).not.toHaveBeenCalled();
  });

  it('rejects impersonation when the original administrator session is revoked', async () => {
    prisma.impersonationSession.findUnique.mockResolvedValue({
      ...validSession,
      actorSession: {
        ...validSession.actorSession,
        revokedAt: new Date(),
      },
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects impersonation when ADMIN loses users.impersonate authority', async () => {
    prisma.impersonationSession.findUnique.mockResolvedValue({
      ...validSession,
      actor: {
        ...actor,
        roles: actor.roles.map((userRole) => ({
          role: {
            ...userRole.role,
            permissions: [],
          },
        })),
      },
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an administrator subject even if a stale session exists', async () => {
    prisma.impersonationSession.findUnique.mockResolvedValue({
      ...validSession,
      subject: {
        ...subject,
        roles: [
          ...subject.roles,
          {
            role: {
              name: 'ADMIN',
              status: 'ACTIVE' as const,
              permissions: [],
            },
          },
        ],
      },
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an ended impersonation session', async () => {
    prisma.impersonationSession.findUnique.mockResolvedValue({
      ...validSession,
      activeKey: null,
      endedAt: new Date(),
    });

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
