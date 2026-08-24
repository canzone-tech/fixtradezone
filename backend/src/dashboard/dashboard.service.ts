import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MARKET_SYMBOLS, type MarketSymbol } from './dashboard.constants';
import type { MarketHistoryQueryDto } from './dto/market-history-query.dto';

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
}

interface MarketTicker {
  symbol: string;
  pair: string;
  price: string;
  change24hPercent: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume24h: string;
}

export interface MarketOverview {
  source: 'BINANCE_SPOT_PUBLIC_MARKET_DATA';
  quoteAsset: 'USDT';
  asOf: string;
  markets: MarketTicker[];
  unavailableSymbols: MarketSymbol[];
}

function isBinanceTicker(value: unknown): value is BinanceTicker {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.symbol === 'string' &&
    typeof record.lastPrice === 'string' &&
    typeof record.priceChangePercent === 'string' &&
    typeof record.highPrice === 'string' &&
    typeof record.lowPrice === 'string' &&
    typeof record.volume === 'string' &&
    typeof record.quoteVolume === 'string'
  );
}

@Injectable()
export class DashboardService {
  private readonly baseUrl = 'https://data-api.binance.vision';

  private marketCache:
    | {
        expiresAt: number;
        value: MarketOverview;
      }
    | undefined;

  private async fetchJson(url: string): Promise<unknown> {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Upstream HTTP ${response.status}`);
      }

      return (await response.json()) as unknown;
    } catch {
      throw new ServiceUnavailableException(
        'Live market data is temporarily unavailable.',
      );
    }
  }

  async getMarketOverview(): Promise<MarketOverview> {
    const now = Date.now();

    if (this.marketCache && this.marketCache.expiresAt > now) {
      return this.marketCache.value;
    }

    const results = await Promise.allSettled(
      MARKET_SYMBOLS.map(async (symbol) => {
        const payload = await this.fetchJson(
          `${this.baseUrl}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
        );

        if (!isBinanceTicker(payload)) {
          throw new Error('Invalid market data payload.');
        }

        const baseAsset = symbol.replace(/USDT$/, '');

        return {
          symbol: baseAsset,
          pair: `${baseAsset}/USDT`,
          price: payload.lastPrice,
          change24hPercent: payload.priceChangePercent,
          high24h: payload.highPrice,
          low24h: payload.lowPrice,
          volume24h: payload.volume,
          quoteVolume24h: payload.quoteVolume,
        } satisfies MarketTicker;
      }),
    );

    const markets: MarketTicker[] = [];
    const unavailableSymbols: MarketSymbol[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        markets.push(result.value);
      } else {
        unavailableSymbols.push(MARKET_SYMBOLS[index]);
      }
    });

    if (markets.length === 0) {
      throw new ServiceUnavailableException(
        'Live market data is temporarily unavailable.',
      );
    }

    const value: MarketOverview = {
      source: 'BINANCE_SPOT_PUBLIC_MARKET_DATA',
      quoteAsset: 'USDT',
      asOf: new Date().toISOString(),
      markets,
      unavailableSymbols,
    };

    this.marketCache = {
      value,
      expiresAt: now + 10_000,
    };

    return value;
  }

  async getMarketHistory(query: MarketHistoryQueryDto) {
    const payload = await this.fetchJson(
      `${this.baseUrl}/api/v3/klines?symbol=${encodeURIComponent(query.symbol)}&interval=${encodeURIComponent(query.interval)}&limit=${query.limit}`,
    );

    if (!Array.isArray(payload)) {
      throw new ServiceUnavailableException(
        'Historical market data is temporarily unavailable.',
      );
    }

    const candles = payload
      .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 7)
      .map((row) => ({
        openTime: new Date(Number(row[0])).toISOString(),
        open: String(row[1]),
        high: String(row[2]),
        low: String(row[3]),
        close: String(row[4]),
        volume: String(row[5]),
        closeTime: new Date(Number(row[6])).toISOString(),
      }));

    return {
      source: 'BINANCE_SPOT_PUBLIC_MARKET_DATA',
      symbol: query.symbol,
      interval: query.interval,
      asOf: new Date().toISOString(),
      candles,
    };
  }
}
