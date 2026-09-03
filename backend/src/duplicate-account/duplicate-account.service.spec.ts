import { PrismaService } from '../database/prisma.service';
import { DuplicateAccountService } from './duplicate-account.service';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DEVICE_ID = '22222222-2222-4222-8222-222222222222';

describe('DuplicateAccountService', () => {
  const prisma = {
    systemDuplicateAccountConfig: {
      findUnique: jest.fn(),
    },
    duplicateAccountAllowlist: {
      findFirst: jest.fn(),
    },
    userDeviceInstallation: {
      findMany: jest.fn(),
    },
  };

  let service: DuplicateAccountService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.systemDuplicateAccountConfig.findUnique.mockResolvedValue({
      enforcementMode: 'OFF',
      deviceSignalEnabled: true,
      ipSignalEnabled: true,
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    });
    prisma.duplicateAccountAllowlist.findFirst.mockResolvedValue(null);
    prisma.userDeviceInstallation.findMany.mockResolvedValue([]);
    service = new DuplicateAccountService(prisma as unknown as PrismaService);
  });

  it('allows a first-seen device when enforcement is OFF', async () => {
    await expect(
      service.evaluateRegistration({
        deviceInstallationId: DEVICE_ID,
        context: { ipAddress: '127.0.0.1' },
      }),
    ).resolves.toMatchObject({
      enforcementMode: 'OFF',
      action: 'ALLOWED',
      blockRegistration: false,
      restrictAccount: false,
      matchedUserIds: [],
      deviceInstallationId: DEVICE_ID,
      ipAddress: '127.0.0.1',
    });
  });

  it.each([
    ['MONITOR', 'MONITORED', false, false],
    ['RESTRICT', 'RESTRICTED', false, true],
    ['BLOCK', 'BLOCKED', true, false],
  ] as const)(
    'applies %s when the device is already linked',
    async (enforcementMode, action, blockRegistration, restrictAccount) => {
      prisma.systemDuplicateAccountConfig.findUnique.mockResolvedValue({
        enforcementMode,
        deviceSignalEnabled: true,
        ipSignalEnabled: true,
        updatedAt: new Date('2026-09-03T00:00:00.000Z'),
      });
      prisma.userDeviceInstallation.findMany.mockResolvedValue([
        { userId: 'existing-user-id' },
      ]);

      await expect(
        service.evaluateRegistration({
          deviceInstallationId: DEVICE_ID,
          context: { ipAddress: '10.0.0.15' },
        }),
      ).resolves.toMatchObject({
        enforcementMode,
        action,
        blockRegistration,
        restrictAccount,
        matchedUserIds: ['existing-user-id'],
      });
    },
  );

  it('never treats IP alone as conclusive duplicate identity', async () => {
    prisma.systemDuplicateAccountConfig.findUnique.mockResolvedValue({
      enforcementMode: 'BLOCK',
      deviceSignalEnabled: true,
      ipSignalEnabled: true,
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    });

    const decision = await service.evaluateRegistration({
      deviceInstallationId: OTHER_DEVICE_ID,
      context: { ipAddress: '192.168.1.20' },
    });

    expect(decision).toMatchObject({
      action: 'ALLOWED',
      blockRegistration: false,
      restrictAccount: false,
      matchedUserIds: [],
      ipAddress: '192.168.1.20',
    });
  });

  it('bypasses enforcement for an allowlisted device installation', async () => {
    prisma.systemDuplicateAccountConfig.findUnique.mockResolvedValue({
      enforcementMode: 'BLOCK',
      deviceSignalEnabled: true,
      ipSignalEnabled: true,
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    });
    prisma.duplicateAccountAllowlist.findFirst.mockResolvedValueOnce({
      id: 'allow-id',
    });

    await expect(
      service.evaluateRegistration({
        deviceInstallationId: DEVICE_ID,
        context: { ipAddress: '127.0.0.1' },
      }),
    ).resolves.toMatchObject({
      enforcementMode: 'BLOCK',
      action: 'BYPASSED',
      bypassType: 'DEVICE_INSTALLATION_ID',
      blockRegistration: false,
      restrictAccount: false,
      matchedUserIds: [],
    });

    expect(prisma.userDeviceInstallation.findMany).not.toHaveBeenCalled();
  });

  it('bypasses enforcement for an allowlisted IP without making IP an identity signal', async () => {
    prisma.systemDuplicateAccountConfig.findUnique.mockResolvedValue({
      enforcementMode: 'BLOCK',
      deviceSignalEnabled: true,
      ipSignalEnabled: true,
      updatedAt: new Date('2026-09-03T00:00:00.000Z'),
    });
    prisma.duplicateAccountAllowlist.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ip-allow-id' });
    prisma.userDeviceInstallation.findMany.mockResolvedValue([
      { userId: 'existing-user-id' },
    ]);

    await expect(
      service.evaluateRegistration({
        deviceInstallationId: DEVICE_ID,
        context: { ipAddress: '127.0.0.1' },
      }),
    ).resolves.toMatchObject({
      action: 'BYPASSED',
      bypassType: 'IP_ADDRESS',
      blockRegistration: false,
      restrictAccount: false,
    });

    expect(prisma.userDeviceInstallation.findMany).not.toHaveBeenCalled();
  });

  it('normalizes IPv4-mapped request addresses for risk readback', async () => {
    const decision = await service.evaluateRegistration({
      deviceInstallationId: DEVICE_ID,
      context: { ipAddress: '::ffff:127.0.0.1' },
    });

    expect(decision.ipAddress).toBe('127.0.0.1');
  });
});
