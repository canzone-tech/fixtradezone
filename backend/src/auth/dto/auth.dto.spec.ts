import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { ValidationError, ValidatorOptions } from 'class-validator';
import { LoginDto } from './login.dto';
import { LogoutDto } from './logout.dto';
import { RefreshTokenDto } from './refresh-token.dto';
import { RegisterDto } from './register.dto';

const validationOptions: ValidatorOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
};

async function validatePayload<T extends object>(
  dtoClass: ClassConstructor<T>,
  payload: Record<string, unknown>,
): Promise<{ dto: T; errors: ValidationError[] }> {
  const dto = plainToInstance(dtoClass, payload);
  const errors = await validate(dto, validationOptions);

  return { dto, errors };
}

describe('Auth DTOs', () => {
  it('normalizes and accepts a valid registration payload', async () => {
    const password = ' SecurePassword123! ';
    const { dto, errors } = await validatePayload(RegisterDto, {
      email: '  User@Example.COM ',
      password,
      username: '  Trader.One ',
      phone: ' +919876543210 ',
      firstName: ' Prashant ',
      lastName: ' Shukla ',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      email: 'user@example.com',
      password,
      username: 'trader.one',
      phone: '+919876543210',
      firstName: 'Prashant',
      lastName: 'Shukla',
    });
  });

  it('rejects short registration passwords', async () => {
    const { errors } = await validatePayload(RegisterDto, {
      email: 'user@example.com',
      password: 'TooShort1!',
    });

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('rejects invalid usernames, phone numbers, and extra fields', async () => {
    const { errors } = await validatePayload(RegisterDto, {
      email: 'user@example.com',
      password: 'SecurePassword123!',
      username: 'invalid username',
      phone: '9876543210',
      role: 'ADMIN',
    });

    expect(errors.some((error) => error.property === 'username')).toBe(true);
    expect(errors.some((error) => error.property === 'phone')).toBe(true);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('normalizes login email without applying registration password policy', async () => {
    const { dto, errors } = await validatePayload(LoginDto, {
      email: ' USER@EXAMPLE.COM ',
      password: 'x',
    });

    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
    expect(dto.password).toBe('x');
  });

  it('accepts JWT-shaped refresh and logout tokens', async () => {
    const refreshToken =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidHlwZSI6InJlZnJlc2gifQ.c2lnbmF0dXJl';

    const refresh = await validatePayload(RefreshTokenDto, { refreshToken });
    const logout = await validatePayload(LogoutDto, { refreshToken });

    expect(refresh.errors).toHaveLength(0);
    expect(logout.errors).toHaveLength(0);
  });

  it('rejects malformed refresh tokens', async () => {
    const { errors } = await validatePayload(RefreshTokenDto, {
      refreshToken: 'not-a-jwt',
    });

    expect(errors.some((error) => error.property === 'refreshToken')).toBe(
      true,
    );
  });
});
