import type { AuthenticatedUser } from './auth-user';
import { ImpersonationController } from './impersonation.controller';
import type { ImpersonationPrincipal } from './impersonation.types';
import type { SecurityConfigService } from '../security-config/security-config.service';

const subject: AuthenticatedUser = {
  id: 'subject-id',
  email: 'user@example.com',
  username: 'user',
  phone: null,
  firstName: 'Test',
  lastName: 'User',
  status: 'ACTIVE',
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: ['USER'],
  permissions: [],
};

const principal: ImpersonationPrincipal = {
  user: subject,
  impersonation: {
    id: 'impersonation-id',
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    actor: {
      id: 'actor-id',
      email: 'admin@example.com',
    },
  },
};

describe('ImpersonationController', () => {
  const getConfig = jest.fn();

  const securityConfigService = {
    get: getConfig,
  } as unknown as SecurityConfigService;

  let controller: ImpersonationController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new ImpersonationController(securityConfigService);
  });

  it('reports FULL mode with configured idle policy', async () => {
    getConfig.mockResolvedValueOnce({
      fullUserImpersonationEnabled: true,
      idleLockMinutes: 15,
      updatedAt: null,
    });

    const result = await controller.getSession({
      user: principal,
    });

    expect(result.impersonation.accessMode).toBe('FULL');

    expect(result.sessionPolicy.idleLockMinutes).toBe(15);

    expect(result.user.id).toBe(subject.id);

    expect(result.impersonation.actor.id).toBe('actor-id');
  });

  it('reports LIMITED mode immediately when full access is disabled', async () => {
    getConfig.mockResolvedValueOnce({
      fullUserImpersonationEnabled: false,
      idleLockMinutes: 5,
      updatedAt: null,
    });

    const result = await controller.getSession({
      user: principal,
    });

    expect(result.impersonation.accessMode).toBe('LIMITED');

    expect(result.sessionPolicy.idleLockMinutes).toBe(5);
  });
});
