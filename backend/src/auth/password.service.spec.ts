import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

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
});
