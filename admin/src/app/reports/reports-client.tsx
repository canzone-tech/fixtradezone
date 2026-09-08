"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/closeout/closeout.module.css";
import {
  formatPlatformDateTime,
  getRuntimePlatformTimezone,
  platformLocalDateTimeToIso,
} from "@/lib/platform-time";

interface CurrencyMetrics {
  currency: string;
  total: number;
  [key: string]: number | string;
}

interface LedgerCurrencyRow {
  currency: string;
  transactionCount: number;
  debitTotal: string;
  creditTotal: string;
  balanced: boolean;
}

interface ReportOverview {
  generatedAt: string;
  window: { from: string | null; toExclusive: string | null };
  currencies: string[];
  users: Record<string, number>;
  deposits: Record<string, number | string>;
  subscriptions: Record<string, number | string>;
  commissions: Record<string, number | string>;
  rewards: Record<string, number | string>;
  payouts: Record<string, number | string>;
  financialByCurrency: {
    deposits: CurrencyMetrics[];
    subscriptions: CurrencyMetrics[];
    commissions: CurrencyMetrics[];
    rewards: CurrencyMetrics[];
    payouts: CurrencyMetrics[];
  };
  ledger: {
    transactionCount: number;
    debitTotal: string;
    creditTotal: string;
    balanced: boolean;
    byCurrency: LedgerCurrencyRow[];
  };
  currentUserWalletBalances: Array<{
    bucket: string;
    currency: string;
    balance: string;
  }>;
  message?: string;
}

async function readReport(response: Response): Promise<ReportOverview> {
  const payload = (await response.json().catch(() => null)) as
    | ReportOverview
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? "Could not load reports.");
  }

  return payload;
}

function label(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

function looksMoney(key: string): boolean {
  return /(amount|value|debitTotal|creditTotal|balance)$/i.test(key);
}

function displayValue(
  key: string,
  value: number | string,
  currency?: string,
): string {
  if (looksMoney(key) && currency) return `${value} ${currency}`;
  return String(value);
}

function csvEscape(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(report: ReportOverview): string {
  const lines: string[] = ["section,currency,metric,value"];
  const operationalSections: Array<[
    string,
    Record<string, number | string | boolean>,
  ]> = [
    ["users", report.users],
    ["deposits", report.deposits],
    ["subscriptions", report.subscriptions],
    ["commissions", report.commissions],
    ["rewards", report.rewards],
    ["payouts", report.payouts],
  ];

  for (const [section, values] of operationalSections) {
    for (const [metric, value] of Object.entries(values)) {
      if (looksMoney(metric)) continue;
      lines.push(
        [csvEscape(section), csvEscape(""), csvEscape(metric), csvEscape(value)].join(
          ",",
        ),
      );
    }
  }

  for (const [section, rows] of Object.entries(report.financialByCurrency)) {
    for (const row of rows) {
      for (const [metric, value] of Object.entries(row)) {
        if (metric === "currency") continue;
        lines.push(
          [
            csvEscape(section),
            csvEscape(row.currency),
            csvEscape(metric),
            csvEscape(value),
          ].join(","),
        );
      }
    }
  }

  for (const row of report.ledger.byCurrency) {
    for (const [metric, value] of Object.entries(row)) {
      if (metric === "currency") continue;
      lines.push(
        [
          csvEscape("ledger"),
          csvEscape(row.currency),
          csvEscape(metric),
          csvEscape(value),
        ].join(","),
      );
    }
  }

  for (const wallet of report.currentUserWalletBalances) {
    lines.push(
      [
        csvEscape("wallet"),
        csvEscape(wallet.currency),
        csvEscape(wallet.bucket),
        csvEscape(wallet.balance),
      ].join(","),
    );
  }

  return lines.join("\n");
}

function MetricSection({
  title,
  values,
  currency,
  hideMoney = false,
}: {
  title: string;
  values: Record<string, number | string>;
  currency?: string;
  hideMoney?: boolean;
}) {
  const entries = Object.entries(values).filter(
    ([key]) => !(hideMoney && looksMoney(key)),
  );

  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      <div className={styles.grid}>
        {entries.map(([key, value]) => (
          <div className={styles.metric} key={key}>
            <small>{label(key)}</small>
            <strong>{displayValue(key, value, currency)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinancialCurrencySection({
  title,
  rows,
}: {
  title: string;
  rows: CurrencyMetrics[];
}) {
  if (rows.length === 0) return null;

  return (
    <section className={styles.card}>
      <h2>{title} by currency</h2>
      <div className={styles.grid}>
        {rows.flatMap((row) =>
          Object.entries(row)
            .filter(([key]) => key !== "currency" && key !== "total")
            .map(([key, value]) => (
              <div className={styles.metric} key={`${row.currency}:${key}`}>
                <small>
                  {row.currency} · {label(key)}
                </small>
                <strong>{displayValue(key, value, row.currency)}</strong>
              </div>
            )),
        )}
      </div>
    </section>
  );
}

export default function ReportsClient() {
  const router = useRouter();
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (reportQuery: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/reports/overview${reportQuery}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        setReport(await readReport(response));
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load reports.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load("");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  function runReport() {
    const params = new URLSearchParams();
    const timezone = getRuntimePlatformTimezone();

    if (from) {
      const fromIso = platformLocalDateTimeToIso(from, timezone);
      if (!fromIso) {
        setError(`Invalid From time for platform timezone ${timezone}.`);
        return;
      }
      params.set("from", fromIso);
    }

    if (to) {
      const toIso = platformLocalDateTimeToIso(to, timezone);
      if (!toIso) {
        setError(`Invalid To time for platform timezone ${timezone}.`);
        return;
      }
      params.set("to", toIso);
    }

    const value = params.toString();
    void load(value ? `?${value}` : "");
  }

  function exportCsv() {
    if (!report) return;

    const blob = new Blob([makeCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fixtradezone-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const singleCurrency = report?.currencies.length === 1 ? report.currencies[0] : undefined;
  const mixedCurrency = (report?.currencies.length ?? 0) > 1;

  return (
    <div className={styles.page}>
      {error ? (
        <FlashMessage
          message={error}
          type="error"
          onClose={() => setError(null)}
        />
      ) : null}

      <section className={styles.hero}>
        <p className={styles.eyebrow}>RPT-01 / READ-ONLY REPORTS</p>
        <h1>Operational & Financial Reports</h1>
        <p>
          Read-only aggregate reporting over existing accounting and operational
          records. This workspace never posts ledger entries or changes balances.
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.field}>
            <label htmlFor="report-from">From</label>
            <input
              id="report-from"
              className={styles.input}
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="report-to">To (exclusive)</label>
            <input
              id="report-to"
              className={styles.input}
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={runReport}
            disabled={loading}
          >
            {loading ? "Loading…" : "Run report"}
          </button>
          <button
            className={styles.buttonSecondary}
            type="button"
            onClick={exportCsv}
            disabled={!report}
          >
            Export CSV
          </button>
        </div>
        <p className={styles.meta}>
          Filter inputs use configured platform timezone {getRuntimePlatformTimezone()}.
          The To value is exclusive.
        </p>
      </section>

      {report ? (
        <>
          <section className={styles.card}>
            <div className={styles.notificationHeader}>
              <div>
                <p className={styles.eyebrow}>Ledger Control</p>
                <h2>
                  <span
                    className={
                      report.ledger.balanced
                        ? styles.statusGood
                        : styles.statusBad
                    }
                  >
                    {report.ledger.balanced ? "BALANCED" : "OUT OF BALANCE"}
                  </span>
                </h2>
              </div>
              <span className={styles.meta}>
                Generated {formatPlatformDateTime(report.generatedAt)}
              </span>
            </div>
            <div className={styles.grid}>
              <div className={styles.metric}>
                <small>Transactions</small>
                <strong>{report.ledger.transactionCount}</strong>
              </div>
              {report.ledger.byCurrency.map((row) => (
                <div className={styles.metric} key={row.currency}>
                  <small>{row.currency} ledger</small>
                  <strong>
                    {row.debitTotal} / {row.creditTotal} {row.currency}
                  </strong>
                  <span
                    className={row.balanced ? styles.statusGood : styles.statusBad}
                  >
                    {row.balanced ? "Balanced" : "Out of balance"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {mixedCurrency ? (
            <section className={styles.card}>
              <p className={styles.eyebrow}>Currency Control</p>
              <h2>Mixed-currency report window</h2>
              <p>
                Monetary values are shown per currency/asset below. Cross-currency
                amounts are never added together into a misleading money total.
              </p>
            </section>
          ) : null}

          <MetricSection title="Users" values={report.users} />
          <MetricSection
            title="Deposits"
            values={report.deposits}
            currency={singleCurrency}
            hideMoney={mixedCurrency}
          />
          <MetricSection
            title="Subscriptions"
            values={report.subscriptions}
            currency={singleCurrency}
            hideMoney={mixedCurrency}
          />
          <MetricSection
            title="Referral Commissions"
            values={report.commissions}
            currency={singleCurrency}
            hideMoney={mixedCurrency}
          />
          <MetricSection
            title="Rewards"
            values={report.rewards}
            currency={singleCurrency}
            hideMoney={mixedCurrency}
          />
          <MetricSection
            title="Payouts"
            values={report.payouts}
            currency={singleCurrency}
            hideMoney={mixedCurrency}
          />

          <FinancialCurrencySection
            title="Deposits"
            rows={report.financialByCurrency.deposits}
          />
          <FinancialCurrencySection
            title="Subscriptions"
            rows={report.financialByCurrency.subscriptions}
          />
          <FinancialCurrencySection
            title="Referral commissions"
            rows={report.financialByCurrency.commissions}
          />
          <FinancialCurrencySection
            title="Rewards"
            rows={report.financialByCurrency.rewards}
          />
          <FinancialCurrencySection
            title="Payouts"
            rows={report.financialByCurrency.payouts}
          />

          <section className={styles.card}>
            <h2>Current USER wallet balances</h2>
            {report.currentUserWalletBalances.length === 0 ? (
              <div className={styles.empty}>No USER wallet balances.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Bucket</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.currentUserWalletBalances.map((row) => (
                      <tr key={`${row.currency}:${row.bucket}`}>
                        <td>{row.currency}</td>
                        <td>{row.bucket}</td>
                        <td>
                          {row.balance} {row.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : loading ? (
        <section className={styles.card}>
          <div className={styles.empty}>Loading report…</div>
        </section>
      ) : null}
    </div>
  );
}
