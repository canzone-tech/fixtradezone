export const MARKET_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
] as const;

export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];

export const MARKET_INTERVALS = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
] as const;

export type MarketInterval = (typeof MARKET_INTERVALS)[number];
