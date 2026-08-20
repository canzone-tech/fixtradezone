import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  beforeAll(async () => {
    await service.onModuleInit();
  });

  it('hashes and verifies a password with Argon2id', async () => {
    const password = 'SecurePassword123!';
    const passwordHash = await service.hash(password);

    expect(passwordHash).not.toBe(password);
    expect(passwordHash).toContain('$argon2id$');
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const passwordHash = await service.hash('SecurePassword123!');

    await expect(
      service.verify(passwordHash, 'WrongPassword123!'),
    ).resolves.toBe(false);
  });

  it('validates known credentials through the authentication path', async () => {
    const password = 'SecurePassword123!';
    const passwordHash = await service.hash(password);

    await expect(
      service.verifyForAuthentication(passwordHash, password),
    ).resolves.toBe(true);
  });

  it('performs dummy verification for an unknown account', async () => {
    await expect(
      service.verifyForAuthentication(null, 'SecurePassword123!'),
    ).resolves.toBe(false);
  });

  it('rejects a corrupted stored hash without exposing an internal error', async () => {
    await expect(
      service.verifyForAuthentication('not-an-argon2-hash', 'password'),
    ).resolves.toBe(false);
  });
});
