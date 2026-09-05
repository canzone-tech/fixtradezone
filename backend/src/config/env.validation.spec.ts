import { envValidationSchema } from './env.validation';

function productionEnv(): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL:
      'mysql://fixtradezone:database-secret@db.example.com:3306/fixtradezone',
    MYSQL_HOST: 'db.example.com',
    MYSQL_PORT: 3306,
    MYSQL_DATABASE: 'fixtradezone',
    MYSQL_USER: 'fixtradezone',
    MYSQL_PASSWORD: 'database-secret',
    PUBLIC_APP_URL: 'https://app.fixtradezone.example',
    COMMUNICATION_EMAIL_MODE: 'SMTP',
    COMMUNICATION_EMAIL_FROM: 'no-reply@fixtradezone.example',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_REQUIRE_TLS: true,
    SMTP_REJECT_UNAUTHORIZED: true,
    SMTP_USER: 'mailer',
    SMTP_PASSWORD: 'smtp-secret',
    CAPTCHA_HMAC_SECRET: 'c'.repeat(32),
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'r'.repeat(32),
  };
}

describe('envValidationSchema release guardrails', () => {
  it('accepts a production SMTP configuration that requires TLS', () => {
    const result = envValidationSchema.validate(productionEnv());

    expect(result.error).toBeUndefined();
  });

  it('rejects plaintext SMTP in production', () => {
    const result = envValidationSchema.validate({
      ...productionEnv(),
      SMTP_SECURE: false,
      SMTP_REQUIRE_TLS: false,
    });

    expect(result.error).toBeDefined();
  });

  it('rejects a migration/runtime database target mismatch', () => {
    const result = envValidationSchema.validate({
      ...productionEnv(),
      DATABASE_URL:
        'mysql://fixtradezone:database-secret@other-db.example.com:3306/fixtradezone',
    });

    expect(result.error).toBeDefined();
  });

  it('rejects placeholder SMTP credentials in production', () => {
    const result = envValidationSchema.validate({
      ...productionEnv(),
      SMTP_PASSWORD: 'REPLACE_ME_SMTP_PASSWORD',
    });

    expect(result.error).toBeDefined();
  });

  it('rejects placeholder HTTP email tokens in production', () => {
    const result = envValidationSchema.validate({
      ...productionEnv(),
      COMMUNICATION_EMAIL_MODE: 'HTTP',
      COMMUNICATION_EMAIL_HTTP_URL: 'https://mailer.example.com/send',
      COMMUNICATION_EMAIL_HTTP_BEARER_TOKEN: 'REPLACE_ME_EMAIL_TOKEN',
    });

    expect(result.error).toBeDefined();
  });
});
