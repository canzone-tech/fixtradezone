import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_IDLE_LOCK_MINUTES,
  SecurityConfigService,
} from './security-config.service';

const superAdmin: AuthenticatedUser = {
  id: 'super-admin-id',
  email: 'founder@example.com',
  username: 'founder',
  phone: null,
  firstName: 'Founder',
  lastName: 'Admin',
  status: 'ACTIVE',
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: ['SUPER_ADMIN', 'USER'],
  permissions: [],
};

const admin: AuthenticatedUser = {
  ...superAdmin,
  id: 'admin-id',
  email: 'admin@example.com',
  roles: ['ADMIN', 'USER'],
};

describe('SecurityConfigService', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();
  const auditCreate = jest.fn();

  const transaction = {
    systemSecurityConfig: {
      findUnique,
      upsert,
    },
    auditLog: {
      create: auditCreate,
    },
  };

  const transactionMock = jest.fn(
    async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );

  const prisma = {
    systemSecurityConfig: {
      findUnique,
    },
    $transaction: transactionMock,
  } as unknown as PrismaService;

  let service: SecurityConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new SecurityConfigService(prisma);
  });

  it('returns secure defaults when configuration row is missing', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(service.get()).resolves.toEqual({
      fullUserImpersonationEnabled: false,
      idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES,
      updatedAt: null,
    });
  });

  it('allows SUPER_ADMIN to update both settings and audits the change', async () => {
    const updatedAt = new Date();

    findUnique.mockResolvedValueOnce({
      id: 1,
      fullUserImpersonationEnabled: false,
      idleLockMinutes: 5,
      updatedAt,
    });

    upsert.mockResolvedValueOnce({
      id: 1,
      fullUserImpersonationEnabled: true,
      idleLockMinutes: 15,
      updatedAt,
    });

    auditCreate.mockResolvedValueOnce({
      id: 'audit-id',
    });

    const result = await service.update(
      {
        fullUserImpersonationEnabled: true,
        idleLockMinutes: 15,
      },
      superAdmin,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    );

    expect(result).toEqual({
      message: 'Security configuration updated.',
      fullUserImpersonationEnabled: true,
      idleLockMinutes: 15,
      updatedAt,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      create: {
        id: 1,
        fullUserImpersonationEnabled: true,
        idleLockMinutes: 15,
        updatedByUserId: superAdmin.id,
      },
      update: {
        fullUserImpersonationEnabled: true,
        idleLockMinutes: 15,
        updatedByUserId: superAdmin.id,
      },
    });

    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('preserves unspecified settings during partial update', async () => {
    const updatedAt = new Date();

    findUnique.mockResolvedValueOnce({
      id: 1,
      fullUserImpersonationEnabled: true,
      idleLockMinutes: 10,
      updatedAt,
    });

    upsert.mockResolvedValueOnce({
      id: 1,
      fullUserImpersonationEnabled: true,
      idleLockMinutes: 20,
      updatedAt,
    });

    auditCreate.mockResolvedValueOnce({
      id: 'audit-id',
    });

    await service.update(
      {
        idleLockMinutes: 20,
      },
      superAdmin,
    );

    expect(upsert).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      create: {
        id: 1,
        fullUserImpersonationEnabled: true,
        idleLockMinutes: 20,
        updatedByUserId: superAdmin.id,
      },
      update: {
        fullUserImpersonationEnabled: true,
        idleLockMinutes: 20,
        updatedByUserId: superAdmin.id,
      },
    });
  });

  it('rejects non-SUPER_ADMIN configuration changes', async () => {
    await expect(
      service.update(
        {
          idleLockMinutes: 10,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejects an empty configuration update', async () => {
    await expect(service.update({}, superAdmin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([0, 121, 1.5])(
    'rejects invalid idle lock value %s',
    async (idleLockMinutes) => {
      await expect(
        service.update(
          {
            idleLockMinutes,
          },
          superAdmin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
