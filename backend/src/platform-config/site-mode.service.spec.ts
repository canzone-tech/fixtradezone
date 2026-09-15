import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { SiteModeService } from './site-mode.service';

function user(roles: string[] = ['USER']): AuthenticatedUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'tester@example.com',
    username: 'tester',
    phone: null,
    firstName: 'Test',
    lastName: 'User',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
    lastLoginAt: null,
    roles,
    permissions: [],
  };
}

function row(siteMode: 'LIVE' | 'TESTING' | 'MAINTENANCE') {
  return {
    platformTimezone: 'UTC',
    operationsMode:
      siteMode === 'LIVE' ? 'AUTOMATIC' : 'CONTROLLED_MANUAL',
    siteMode,
    modeMessage: null,
    launchAt: null,
    recoveryUnlockedUntil: null,
    recoveryReason: null,
    updatedAt: new Date('2026-09-15T00:00:00.000Z'),
  };
}

describe('SiteModeService access policy', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: SiteModeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SiteModeService(prisma as unknown as PrismaService);
  });

  it('exposes LIVE as public with automatic operations and registration enabled', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([row('LIVE')]);

    await expect(service.getPublicStatus()).resolves.toMatchObject({
      siteMode: 'LIVE',
      operationsMode: 'AUTOMATIC',
      publicApplicationAvailable: true,
      registrationEnabled: true,
      loginAccess: 'PUBLIC',
    });
  });

  it('blocks public registration while TESTING is active', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([row('TESTING')]);

    await expect(service.assertRegistrationAllowed()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('allows an allowlisted user in TESTING mode', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([row('TESTING')])
      .mockResolvedValueOnce([{ allowed: 1 }]);

    await expect(service.assertAuthenticatedAccess(user())).resolves.toBe(
      undefined,
    );
  });

  it('blocks a normal user in MAINTENANCE and always allows SUPER_ADMIN', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([row('MAINTENANCE')])
      .mockResolvedValueOnce([row('MAINTENANCE')]);

    await expect(service.assertAuthenticatedAccess(user())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.assertAuthenticatedAccess(user(['SUPER_ADMIN'])),
    ).resolves.toBe(undefined);
  });

  it('locks manual recovery in LIVE unless SUPER_ADMIN has an active recovery window', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([row('LIVE')])
      .mockResolvedValueOnce([
        {
          ...row('LIVE'),
          recoveryUnlockedUntil: new Date(Date.now() + 60_000),
          recoveryReason: 'recover stuck item',
        },
      ]);

    await expect(
      service.assertManualOperationAllowed(user(['ADMIN'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertManualOperationAllowed(user(['SUPER_ADMIN'])),
    ).resolves.toBe(undefined);
  });
});
