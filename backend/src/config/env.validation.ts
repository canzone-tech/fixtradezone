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

  REWARD_WORKER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true),

  REWARD_WORKER_INTERVAL_MS: Joi.number()
    .integer()
    .min(10_000)
    .max(3_600_000)
    .default(60_000),

  CAPTCHA_HMAC_SECRET: Joi.string().min(32).required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
}).unknown(true);
