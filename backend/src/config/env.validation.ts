import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(3000),

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
    .valid('CONSOLE', 'HTTP')
    .default('CONSOLE'),

  COMMUNICATION_EMAIL_FROM: Joi.string()
    .email()
    .default('no-reply@fixtradezone.local'),

  COMMUNICATION_EMAIL_HTTP_URL: Joi.string().uri().allow('').default(''),

  COMMUNICATION_EMAIL_HTTP_BEARER_TOKEN: Joi.string()
    .allow('')
    .default(''),

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

  REWARD_WORKER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),

  REWARD_WORKER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(60_000),

  SIMULATED_ACTIVITY_WORKER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),

  SIMULATED_ACTIVITY_WORKER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(60_000),

  INTERNAL_TRADING_WORKER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),

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
}).unknown(true);
