import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from './auth-user';
import type { PasswordService } from './password.service';
import { ReauthenticationService } from './reauthentication.service';

const user: AuthenticatedUser = {
  id: 'actor-id',
  email: 'actor@example.com',
  username: 'actor',
  phone: null,
  firstName: 'Actor',
  lastName: 'User',
  status: 'ACTIVE',
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: ['ADMIN', 'USER'],
  permissions: [],
};

describe('ReauthenticationService', () => {
  const findUnique = jest.fn();
  const auditCreate = jest.fn();
  const verifyForAuthentication = jest.fn();

  const prisma = {
    user: {
      findUnique,
    },
    auditLog: {
      create: auditCreate,
    },
  } as unknown as PrismaService;

  const passwordService = {
    verifyForAuthentication,
  } as unknown as PasswordService;

  let service: ReauthenticationService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ReauthenticationService(prisma, passwordService);
  });

  it('reauthenticates an ACTIVE user with the correct password', async () => {
    findUnique.mockResolvedValueOnce({
      id: user.id,
      status: 'ACTIVE',
      passwordHash: 'stored-hash',
    });

    verifyForAuthentication.mockResolvedValueOnce(true);

    const result = await service.reauthenticate(
      user,
      {
        password: 'CorrectPassword123!',
      },
      {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    );

    expect(result.reauthenticated).toBe(true);
    expect(result.reauthenticatedAt).toBeInstanceOf(Date);

    expect(verifyForAuthentication).toHaveBeenCalledWith(
      'stored-hash',
      'CorrectPassword123!',
    );

    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects an incorrect password', async () => {
    findUnique.mockResolvedValueOnce({
      id: user.id,
      status: 'ACTIVE',
      passwordHash: 'stored-hash',
    });

    verifyForAuthentication.mockResolvedValueOnce(false);

    await expect(
      service.reauthenticate(user, {
        password: 'WrongPassword',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects an inactive account even with a matching password', async () => {
    findUnique.mockResolvedValueOnce({
      id: user.id,
      status: 'SUSPENDED',
      passwordHash: 'stored-hash',
    });

    verifyForAuthentication.mockResolvedValueOnce(true);

    await expect(
      service.reauthenticate(user, {
        password: 'CorrectPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('uses timing-safe verification when the account no longer exists', async () => {
    findUnique.mockResolvedValueOnce(null);

    verifyForAuthentication.mockResolvedValueOnce(false);

    await expect(
      service.reauthenticate(user, {
        password: 'Anything',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(verifyForAuthentication).toHaveBeenCalledWith(null, 'Anything');
  });
});
