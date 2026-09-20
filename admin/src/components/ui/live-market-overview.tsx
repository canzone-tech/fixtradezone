"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./live-market-overview.module.css";

export type LiveMarketSymbol =
  | "BTCUSDT"
  | "ETHUSDT"
  | "BNBUSDT"
  | "SOLUSDT";

export type LiveMarketInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

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
  unavailableSymbols: LiveMarketSymbol[];
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
  symbol: LiveMarketSymbol;
  interval: LiveMarketInterval;
  asOf: string;
  candles: MarketCandle[];
  message?: string;
}

interface LiveMarketOverviewProps {
  overviewUrl: string;
  historyUrl: string;
}

interface ParsedCandle extends MarketCandle {
  openValue: number;
  highValue: number;
  lowValue: number;
  closeValue: number;
  volumeValue: number;
}

const SYMBOLS: Array<{
  value: LiveMarketSymbol;
  label: string;
  short: string;
}> = [
  { value: "BTCUSDT", label: "BTC/USDT", short: "BTC" },
  { value: "ETHUSDT", label: "ETH/USDT", short: "ETH" },
  { value: "BNBUSDT", label: "BNB/USDT", short: "BNB" },
  { value: "SOLUSDT", label: "SOL/USDT", short: "SOL" },
];

const INTERVALS: Array<{ value: LiveMarketInterval; label: string }> = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function compact(value: string | number, maxFraction = 6): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxFraction,
  }).format(numeric);
}

function compactPrice(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  const maximumFractionDigits =
    numeric >= 1000 ? 2 : numeric >= 100 ? 3 : numeric >= 1 ? 4 : 6;

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: numeric >= 1000 ? 2 : 0,
    maximumFractionDigits,
  }).format(numeric);
}

function utcClock(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(11, 19)} UTC`;
}

function axisTime(value: string, interval: LiveMarketInterval): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (interval === "1d") {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function parseCandles(candles: MarketCandle[]): ParsedCandle[] {
  return candles
    .map((candle) => ({
      ...candle,
      openValue: Number(candle.open),
      highValue: Number(candle.high),
      lowValue: Number(candle.low),
      closeValue: Number(candle.close),
      volumeValue: Number(candle.volume),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.openValue) &&
        Number.isFinite(candle.highValue) &&
        Number.isFinite(candle.lowValue) &&
        Number.isFinite(candle.closeValue) &&
        Number.isFinite(candle.volumeValue),
    );
}

function CandlestickChart({
  candles,
  interval,
  pair,
}: {
  candles: MarketCandle[];
  interval: LiveMarketInterval;
  pair: string;
}) {
  const chart = useMemo(() => {
    const parsed = parseCandles(candles);
    if (parsed.length === 0) return null;

    const width = 1120;
    const height = 455;
    const left = 18;
    const right = 92;
    const top = 22;
    const priceBottom = 320;
    const volumeTop = 350;
    const volumeBottom = 420;
    const plotWidth = width - left - right;
    const priceHeight = priceBottom - top;
    const volumeHeight = volumeBottom - volumeTop;

    const rawLow = Math.min(...parsed.map((candle) => candle.lowValue));
    const rawHigh = Math.max(...parsed.map((candle) => candle.highValue));
    const rawRange = Math.max(rawHigh - rawLow, Math.abs(rawHigh) * 0.0001, 1e-8);
    const priceLow = rawLow - rawRange * 0.06;
    const priceHigh = rawHigh + rawRange * 0.06;
    const priceRange = priceHigh - priceLow;
    const maxVolume = Math.max(1, ...parsed.map((candle) => candle.volumeValue));
    const slot = plotWidth / parsed.length;
    const bodyWidth = Math.max(3, Math.min(13, slot * 0.62));

    const yForPrice = (value: number) =>
      top + ((priceHigh - value) / priceRange) * priceHeight;

    const priceTicks = Array.from({ length: 6 }, (_, index) => {
      const ratio = index / 5;
      const value = priceHigh - priceRange * ratio;
      return {
        value,
        y: top + priceHeight * ratio,
      };
    });

    const timeIndexes = Array.from(
      new Set([
        0,
        Math.floor((parsed.length - 1) * 0.2),
        Math.floor((parsed.length - 1) * 0.4),
        Math.floor((parsed.length - 1) * 0.6),
        Math.floor((parsed.length - 1) * 0.8),
        parsed.length - 1,
      ]),
    );

    return {
      parsed,
      width,
      height,
      left,
      right,
      top,
      priceBottom,
      volumeTop,
      volumeBottom,
      plotWidth,
      maxVolume,
      slot,
      bodyWidth,
      yForPrice,
      priceTicks,
      timeIndexes,
    };
  }, [candles]);

  if (!chart) {
    return <div className={styles.empty}>No candle data is available.</div>;
  }

  return (
    <div className={styles.chartScroller}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={`${pair} ${interval} candlestick chart with volume`}
      >
        <rect
          x="0"
          y="0"
          width={chart.width}
          height={chart.height}
          rx="14"
          className={styles.chartBackground}
        />

        {chart.priceTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={chart.left}
              x2={chart.width - chart.right}
              y1={tick.y}
              y2={tick.y}
              className={styles.gridLine}
            />
            <text
              x={chart.width - chart.right + 12}
              y={tick.y + 4}
              className={styles.axisLabel}
            >
              {compactPrice(tick.value)}
            </text>
          </g>
        ))}

        <line
          x1={chart.left}
          x2={chart.width - chart.right}
          y1={chart.volumeTop - 10}
          y2={chart.volumeTop - 10}
          className={styles.volumeDivider}
        />

        {chart.parsed.map((candle, index) => {
          const x = chart.left + chart.slot * index + chart.slot / 2;
          const openY = chart.yForPrice(candle.openValue);
          const closeY = chart.yForPrice(candle.closeValue);
          const highY = chart.yForPrice(candle.highValue);
          const lowY = chart.yForPrice(candle.lowValue);
          const positive = candle.closeValue >= candle.openValue;
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(1.6, Math.abs(closeY - openY));
          const volumeHeight =
            (candle.volumeValue / chart.maxVolume) *
            (chart.volumeBottom - chart.volumeTop);

          return (
            <g key={`${candle.openTime}-${index}`}>
              <title>{`${candle.openTime} · O ${compactPrice(candle.openValue)} · H ${compactPrice(candle.highValue)} · L ${compactPrice(candle.lowValue)} · C ${compactPrice(candle.closeValue)} · Vol ${compact(candle.volumeValue, 4)}`}</title>
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                className={positive ? styles.wickUp : styles.wickDown}
              />
              <rect
                x={x - chart.bodyWidth / 2}
                y={bodyTop}
                width={chart.bodyWidth}
                height={bodyHeight}
                rx="1"
                className={positive ? styles.candleUp : styles.candleDown}
              />
              <rect
                x={x - chart.bodyWidth / 2}
                y={chart.volumeBottom - volumeHeight}
                width={chart.bodyWidth}
                height={Math.max(1, volumeHeight)}
                rx="1"
                className={positive ? styles.volumeUp : styles.volumeDown}
              />
            </g>
          );
        })}

        {chart.timeIndexes.map((index) => {
          const candle = chart.parsed[index];
          const x = chart.left + chart.slot * index + chart.slot / 2;
          return (
            <text
              x={x}
              y={chart.height - 12}
              textAnchor="middle"
              className={styles.timeLabel}
              key={`${candle.openTime}-${index}-label`}
            >
              {axisTime(candle.openTime, interval)}
            </text>
          );
        })}

        <text
          x={chart.left}
          y={chart.volumeTop + 8}
          className={styles.volumeLabel}
        >
          VOLUME
        </text>
      </svg>
    </div>
  );
}

export default function LiveMarketOverview({
  overviewUrl,
  historyUrl,
}: LiveMarketOverviewProps) {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [history, setHistory] = useState<MarketHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<LiveMarketSymbol>("BTCUSDT");
  const [interval, setInterval] = useState<LiveMarketInterval>("1h");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      try {
        const response = await fetch(overviewUrl, {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
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
  }, [overviewUrl, refreshKey]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      setLoading(true);
      setHistoryError(null);

      try {
        const query = new URLSearchParams({
          symbol,
          interval,
          limit: "72",
        });
        const response = await fetch(`${historyUrl}?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const payload = await readJson<MarketHistory>(response);

        if (!mounted) return;
        if (!response.ok || !payload) {
          setHistory(null);
          setHistoryError(
            payload?.message ?? "Market candles are temporarily unavailable.",
          );
          return;
        }

        setHistory(payload);
      } catch {
        if (mounted) {
          setHistory(null);
          setHistoryError("Market candles are temporarily unavailable.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      mounted = false;
    };
  }, [historyUrl, interval, refreshKey, symbol]);

  const selected = SYMBOLS.find((item) => item.value === symbol) ?? SYMBOLS[0];
  const selectedTicker =
    overview?.markets.find((market) => market.pair === selected.label) ?? null;
  const latestCandle =
    history && history.candles.length > 0
      ? history.candles[history.candles.length - 1]
      : null;
  const change = Number(selectedTicker?.change24hPercent ?? "0");
  const positiveChange = Number.isFinite(change) && change >= 0;
  const updatedAt = history?.asOf ?? overview?.asOf ?? null;

  return (
    <section className={styles.panel} aria-label="Live public market overview">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>LIVE PUBLIC MARKET</span>
          <h3>Market Overview</h3>
          <p>
            Fresh Binance Spot reference data. This panel never drives FixTradeZone
            trade results, earnings, wallets, ledger entries or commissions.
          </p>
        </div>

        <div className={styles.headerActions}>
          <span className={styles.source}>
            <i className="iconoir-globe" /> Binance Spot
          </span>
          <span className={styles.updated}>
            Updated {utcClock(updatedAt)}
          </span>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => setRefreshKey((value) => value + 1)}
            aria-label="Refresh live market data"
          >
            <i className="iconoir-refresh" />
            Refresh
          </button>
        </div>
      </header>

      <div className={styles.symbolTabs} role="tablist" aria-label="Market pair">
        {SYMBOLS.map((option) => {
          const ticker = overview?.markets.find(
            (market) => market.pair === option.label,
          );
          const optionChange = Number(ticker?.change24hPercent ?? "0");
          const optionPositive = Number.isFinite(optionChange) && optionChange >= 0;
          const active = option.value === symbol;

          return (
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.symbolTab} ${active ? styles.symbolTabActive : ""}`}
              onClick={() => setSymbol(option.value)}
              key={option.value}
            >
              <span>{option.short}</span>
              <strong>{ticker ? `${compactPrice(ticker.price)} USDT` : "—"}</strong>
              <small className={optionPositive ? styles.positive : styles.negative}>
                {ticker
                  ? `${optionPositive ? "+" : ""}${compact(ticker.change24hPercent, 2)}%`
                  : "loading"}
              </small>
            </button>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.marketIdentity}>
          <strong>{selected.label}</strong>
          <span>Spot · Binance public market</span>
        </div>

        <div className={styles.intervalTabs} aria-label="Candle timeframe">
          {INTERVALS.map((option) => (
            <button
              type="button"
              className={interval === option.value ? styles.intervalActive : ""}
              onClick={() => setInterval(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.quoteRow}>
        <div className={styles.lastPrice}>
          <small>LAST</small>
          <strong>
            {selectedTicker
              ? `${compactPrice(selectedTicker.price)} USDT`
              : latestCandle
                ? `${compactPrice(latestCandle.close)} USDT`
                : "—"}
          </strong>
          {selectedTicker ? (
            <span className={positiveChange ? styles.positive : styles.negative}>
              {positiveChange ? "+" : ""}
              {compact(selectedTicker.change24hPercent, 2)}% · 24h
            </span>
          ) : null}
        </div>

        <div className={styles.ohlc}>
          <span>
            <small>O</small>
            <b>{latestCandle ? compactPrice(latestCandle.open) : "—"}</b>
          </span>
          <span>
            <small>H</small>
            <b>{latestCandle ? compactPrice(latestCandle.high) : "—"}</b>
          </span>
          <span>
            <small>L</small>
            <b>{latestCandle ? compactPrice(latestCandle.low) : "—"}</b>
          </span>
          <span>
            <small>C</small>
            <b>{latestCandle ? compactPrice(latestCandle.close) : "—"}</b>
          </span>
          <span>
            <small>VOL</small>
            <b>{latestCandle ? compact(latestCandle.volume, 4) : "—"}</b>
          </span>
        </div>
      </div>

      {overviewError && !overview ? (
        <div className={styles.warning}>{overviewError}</div>
      ) : null}

      {overview?.unavailableSymbols.length ? (
        <div className={styles.warning}>
          Temporarily unavailable: {overview.unavailableSymbols.join(", ")}.
        </div>
      ) : null}

      {loading && !history ? (
        <div className={styles.empty}>Loading fresh market candles…</div>
      ) : historyError ? (
        <div className={styles.empty}>{historyError}</div>
      ) : history?.candles.length ? (
        <CandlestickChart
          candles={history.candles}
          interval={interval}
          pair={selected.label}
        />
      ) : (
        <div className={styles.empty}>No market candles are available.</div>
      )}

      <footer className={styles.footer}>
        <span>
          <i className="iconoir-shield-check" /> Reference-only market data
        </span>
        <span>Pair/timeframe changes and Refresh request fresh upstream data.</span>
      </footer>
    </section>
  );
}
