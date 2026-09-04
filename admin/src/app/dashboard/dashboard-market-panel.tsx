"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./dashboard-market.module.css";

type MarketSymbol =
  | "BTCUSDT"
  | "ETHUSDT"
  | "BNBUSDT"
  | "SOLUSDT"
  | "XRPUSDT"
  | "DOGEUSDT";

type MarketInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

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

interface MarketOverview {
  source: "BINANCE_SPOT_PUBLIC_MARKET_DATA";
  quoteAsset: "USDT";
  asOf: string;
  markets: MarketTicker[];
  unavailableSymbols: MarketSymbol[];
  message?: string;
}

interface MarketCandle {
  openTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: string;
}

interface MarketHistory {
  source: "BINANCE_SPOT_PUBLIC_MARKET_DATA";
  symbol: MarketSymbol;
  interval: MarketInterval;
  asOf: string;
  candles: MarketCandle[];
  message?: string;
}

const SYMBOLS: Array<{ value: MarketSymbol; label: string }> = [
  { value: "BTCUSDT", label: "BTC/USDT" },
  { value: "ETHUSDT", label: "ETH/USDT" },
  { value: "BNBUSDT", label: "BNB/USDT" },
  { value: "SOLUSDT", label: "SOL/USDT" },
  { value: "XRPUSDT", label: "XRP/USDT" },
  { value: "DOGEUSDT", label: "DOGE/USDT" },
];

const INTERVALS: Array<{ value: MarketInterval; label: string }> = [
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
];

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function compact(value: string, maxFraction = 6): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxFraction,
  }).format(numeric);
}

function compactPrice(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  const maximumFractionDigits = numeric >= 100 ? 2 : numeric >= 1 ? 4 : 6;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: numeric >= 100 ? 2 : 0,
    maximumFractionDigits,
  }).format(numeric);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DashboardMarketPanel() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [history, setHistory] = useState<MarketHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<MarketSymbol>("BTCUSDT");
  const [interval, setInterval] = useState<MarketInterval>("1h");
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      try {
        const response = await fetch("/api/admin/dashboard/market", {
          cache: "no-store",
        });
        const payload = await readJson<MarketOverview>(response);

        if (!mounted) return;
        if (!response.ok || !payload) {
          setOverviewError(
            payload?.message ?? "Live market data is temporarily unavailable.",
          );
          return;
        }

        setOverview(payload);
        setOverviewError(null);
      } catch {
        if (mounted) {
          setOverviewError("Live market data is temporarily unavailable.");
        }
      }
    }

    void loadOverview();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      setLoadingHistory(true);
      setHistoryError(null);

      try {
        const query = new URLSearchParams({
          symbol,
          interval,
          limit: "24",
        });
        const response = await fetch(
          `/api/admin/dashboard/market/history?${query.toString()}`,
          { cache: "no-store" },
        );
        const payload = await readJson<MarketHistory>(response);

        if (!mounted) return;
        if (!response.ok || !payload) {
          setHistory(null);
          setHistoryError(
            payload?.message ?? "Historical market data is temporarily unavailable.",
          );
          return;
        }

        setHistory(payload);
      } catch {
        if (mounted) {
          setHistory(null);
          setHistoryError("Historical market data is temporarily unavailable.");
        }
      } finally {
        if (mounted) setLoadingHistory(false);
      }
    }

    void loadHistory();

    return () => {
      mounted = false;
    };
  }, [symbol, interval]);

  const recentCandles = useMemo(
    () => history?.candles.slice(-8).reverse() ?? [],
    [history],
  );

  return (
    <article className={`ftz-panel ${styles.panel}`}>
      <div className={styles.header}>
        <div>
          <h3>Live Spot Market</h3>
          <p>
            Public reference data only. Market prices do not represent FixTradeZone
            execution or user trading activity.
          </p>
        </div>
        <span className={styles.source}>
          <i className="iconoir-globe" /> Binance public spot data
        </span>
      </div>

      {overview ? (
        <>
          <div className={styles.tickers}>
            {overview.markets.map((market) => {
              const change = Number(market.change24hPercent);
              const positive = Number.isFinite(change) && change >= 0;

              return (
                <div className={styles.ticker} key={market.pair}>
                  <div className={styles.tickerTop}>
                    <strong>{market.pair}</strong>
                    <span className={positive ? styles.positive : styles.negative}>
                      {positive ? "+" : ""}
                      {compact(market.change24hPercent, 2)}%
                    </span>
                  </div>
                  <strong className={styles.price}>
                    {compactPrice(market.price)} USDT
                  </strong>
                  <div className={styles.range}>
                    <span>H {compactPrice(market.high24h)}</span>
                    <span>L {compactPrice(market.low24h)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {overview.unavailableSymbols.length > 0 ? (
            <div className={styles.warning}>
              Some symbols are temporarily unavailable: {overview.unavailableSymbols.join(", ")}.
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.empty}>
          {overviewError ?? "Loading live market reference data…"}
        </div>
      )}

      <div className={styles.historyHeader}>
        <div>
          <h4>Recent candles</h4>
          <p>Latest completed/reference candles from the selected public market.</p>
        </div>

        <div className={styles.controls}>
          <label>
            Pair
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value as MarketSymbol)}
            >
              {SYMBOLS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Interval
            <select
              value={interval}
              onChange={(event) => setInterval(event.target.value as MarketInterval)}
            >
              {INTERVALS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loadingHistory && !history ? (
        <div className={styles.empty}>Loading market history…</div>
      ) : historyError ? (
        <div className={styles.empty}>{historyError}</div>
      ) : recentCandles.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Close</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {recentCandles.map((candle) => (
                <tr key={`${candle.openTime}-${candle.closeTime}`}>
                  <td>{formatTime(candle.openTime)}</td>
                  <td>{compactPrice(candle.open)}</td>
                  <td>{compactPrice(candle.high)}</td>
                  <td>{compactPrice(candle.low)}</td>
                  <td>{compactPrice(candle.close)}</td>
                  <td>{compact(candle.volume, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.empty}>No market history is available.</div>
      )}
    </article>
  );
}
