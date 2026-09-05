import * as Joi from 'joi';

const boolean = Joi.boolean().truthy('true').falsy('false');

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  TRUST_PROXY: Joi.string().max(255).default('loopback'),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql'] })
    .required(),

  MYSQL_HOST: Joi.string().hostname().required(),

  MYSQL_PORT: Joi.number().port().default(3306),

  MYSQL_DATABASE: Joi.string().min(1).required(),

  MYSQL_USER: Joi.string().min(1).required(),

  MYSQL_PASSWORD: Joi.string().required(),

  REDIS_HOST: Joi.string().hostname().default('127.0.0.1'),

  REDIS_PORT: Joi.number().port().default(6379),

  REDIS_PASSWORD: Joi.string().allow('').default(''),

  PUBLIC_APP_URL: Joi.string().uri().default('https://localhost:3001'),

  COMMUNICATION_EMAIL_MODE: Joi.string()
    .valid('CONSOLE', 'HTTP', 'SMTP')
    .default('CONSOLE'),

  COMMUNICATION_EMAIL_FROM: Joi.string()
    .email()
    .default('no-reply@fixtradezone.local'),

  COMMUNICATION_EMAIL_HTTP_URL: Joi.string().uri().allow('').default(''),

  COMMUNICATION_EMAIL_HTTP_BEARER_TOKEN: Joi.string().allow('').default(''),

  COMMUNICATION_EMAIL_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(120_000)
    .default(10_000),

  SMTP_HOST: Joi.when('COMMUNICATION_EMAIL_MODE', {
    is: 'SMTP',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').default(''),
  }),

  SMTP_PORT: Joi.number().port().default(587),

  SMTP_SECURE: boolean.default(false),

  SMTP_REQUIRE_TLS: boolean.default(true),

  SMTP_REJECT_UNAUTHORIZED: boolean.default(true),

  SMTP_USER: Joi.string().allow('').default(''),

  SMTP_PASSWORD: Joi.string().allow('').default(''),

  SMTP_FROM_EMAIL: Joi.string().email().allow('').default(''),

  SMTP_FROM_NAME: Joi.string().max(120).allow('').default('FixTradeZone'),

  EMAIL_VERIFICATION_TTL_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(1440)
    .default(30),

  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(10)
    .max(3600)
    .default(60),

  PASSWORD_RESET_TTL_MINUTES: Joi.number()
    .integer()
    .min(5)
    .max(180)
    .default(30),

  PASSWORD_RESET_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(10)
    .max(3600)
    .default(60),

  REWARD_WORKER_ENABLED: boolean.default(false),

  REWARD_WORKER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(60_000),

  SIMULATED_ACTIVITY_WORKER_ENABLED: boolean.default(false),

  SIMULATED_ACTIVITY_WORKER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(60_000),

  INTERNAL_TRADING_WORKER_ENABLED: boolean.default(false),

  INTERNAL_TRADING_WORKER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(60_000),

  INTERNAL_TRADING_WORKER_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100),

  CAPTCHA_HMAC_SECRET: Joi.string().min(32).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
})
  .custom((value: Record<string, unknown>, helpers) => {
    const emailMode = readString(value.COMMUNICATION_EMAIL_MODE, 'CONSOLE');

    if (emailMode === 'SMTP') {
      const user = readString(value.SMTP_USER).trim();
      const password = readString(value.SMTP_PASSWORD).trim();

      if (Boolean(user) !== Boolean(password)) {
        return helpers.error('any.custom', {
          message: 'SMTP_USER and SMTP_PASSWORD must be configured together',
        });
      }

      const smtpFrom = readString(value.SMTP_FROM_EMAIL).trim();
      const legacyFrom = readString(value.COMMUNICATION_EMAIL_FROM).trim();
      if (!smtpFrom && !legacyFrom) {
        return helpers.error('any.custom', {
          message:
            'SMTP_FROM_EMAIL or COMMUNICATION_EMAIL_FROM is required in SMTP mode',
        });
      }
    }

    if (
      emailMode === 'HTTP' &&
      !readString(value.COMMUNICATION_EMAIL_HTTP_URL).trim()
    ) {
      return helpers.error('any.custom', {
        message: 'COMMUNICATION_EMAIL_HTTP_URL is required in HTTP mode',
      });
    }

    if (value.NODE_ENV === 'production') {
      if (emailMode === 'CONSOLE') {
        return helpers.error('any.custom', {
          message:
            'COMMUNICATION_EMAIL_MODE must use SMTP or HTTP in production',
        });
      }

      const publicAppUrl = readString(value.PUBLIC_APP_URL);
      try {
        const parsed = new URL(publicAppUrl);
        if (
          parsed.protocol !== 'https:' ||
          ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
        ) {
          return helpers.error('any.custom', {
            message: 'PUBLIC_APP_URL must be a public HTTPS URL in production',
          });
        }
      } catch {
        return helpers.error('any.custom', {
          message: 'PUBLIC_APP_URL must be a valid URL in production',
        });
      }

      if (emailMode === 'SMTP' && value.SMTP_REJECT_UNAUTHORIZED === false) {
        return helpers.error('any.custom', {
          message: 'SMTP_REJECT_UNAUTHORIZED cannot be false in production',
        });
      }

      for (const key of [
        'MYSQL_PASSWORD',
        'CAPTCHA_HMAC_SECRET',
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
      ]) {
        if (readString(value[key]).includes('REPLACE_ME')) {
          return helpers.error('any.custom', {
            message: `${key} still contains a placeholder value`,
          });
        }
      }
    }

    return value;
  })
  .unknown(true);
