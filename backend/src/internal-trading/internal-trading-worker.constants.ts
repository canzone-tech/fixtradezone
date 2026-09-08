export const INTERNAL_TRADING_WORKER_DEFAULT_INTERVAL_MS = 60_000;

export const INTERNAL_TRADING_WORKER_DEFAULT_BATCH_SIZE = 100;

export const INTERNAL_TRADING_WORKER_LOCK_KEY =
  'fixtradezone:internal-trading:worker';

export const INTERNAL_TRADING_WORKER_CURSOR_KEY =
  'fixtradezone:internal-trading:worker:cursor';

export const INTERNAL_TRADING_WORKER_MIN_LOCK_TTL_MS = 15 * 60_000;

export const INTERNAL_TRADING_WORKER_CURSOR_TTL_MS = 7 * 24 * 60 * 60_000;
