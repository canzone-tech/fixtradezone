const DISPLAY_QUOTE_ASSETS = ["USDT", "USDC", "USD", "EUR", "BTC", "ETH", "BNB"] as const;

export function normalizeAssetSymbol(value: string): string {
  return value.trim().toUpperCase().replaceAll("/", "");
}

export function formatAssetSymbol(value: string): string {
  const normalized = normalizeAssetSymbol(value);

  for (const quote of DISPLAY_QUOTE_ASSETS) {
    if (normalized.length > quote.length && normalized.endsWith(quote)) {
      return `${normalized.slice(0, -quote.length)}/${quote}`;
    }
  }

  return normalized;
}

export function formatAssetSymbols(values: string[]): string[] {
  return values.map(formatAssetSymbol);
}
