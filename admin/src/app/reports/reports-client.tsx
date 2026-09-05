"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/closeout/closeout.module.css";
import { formatPlatformDateTime } from "@/lib/platform-time";

interface ReportOverview {
  generatedAt: string;
  window: { from: string | null; toExclusive: string | null };
  users: Record<string, number>;
  deposits: Record<string, number | string>;
  subscriptions: Record<string, number | string>;
  commissions: Record<string, number | string>;
  rewards: Record<string, number | string>;
  payouts: Record<string, number | string>;
  ledger: {
    transactionCount: number;
    debitTotal: string;
    creditTotal: string;
    balanced: boolean;
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

function displayValue(key: string, value: number | string): string {
  if (looksMoney(key)) return `${value} USDT`;
  return String(value);
}

function csvEscape(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(report: ReportOverview): string {
  const lines: string[] = ["section,metric,value"];
  const sections: Array<[
    string,
    Record<string, number | string | boolean>,
  ]> = [
    ["users", report.users],
    ["deposits", report.deposits],
    ["subscriptions", report.subscriptions],
    ["commissions", report.commissions],
    ["rewards", report.rewards],
    ["payouts", report.payouts],
    ["ledger", report.ledger],
  ];

  for (const [section, values] of sections) {
    for (const [metric, value] of Object.entries(values)) {
      lines.push(
        [csvEscape(section), csvEscape(metric), csvEscape(value)].join(","),
      );
    }
  }

  for (const wallet of report.currentUserWalletBalances) {
    lines.push(
      [
        csvEscape("wallet"),
        csvEscape(`${wallet.currency}:${wallet.bucket}`),
        csvEscape(wallet.balance),
      ].join(","),
    );
  }

  return lines.join("\n");
}

function MetricSection({
  title,
  values,
}: {
  title: string;
  values: Record<string, number | string>;
}) {
  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      <div className={styles.grid}>
        {Object.entries(values).map(([key, value]) => (
          <div className={styles.metric} key={key}>
            <small>{label(key)}</small>
            <strong>{displayValue(key, value)}</strong>
          </div>
        ))}
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

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [from, to]);

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
    void load("");
  }, [load]);

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
            onClick={() => void load(query)}
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
              <div className={styles.metric}>
                <small>Debit total</small>
                <strong>{report.ledger.debitTotal} USDT</strong>
              </div>
              <div className={styles.metric}>
                <small>Credit total</small>
                <strong>{report.ledger.creditTotal} USDT</strong>
              </div>
            </div>
          </section>

          <MetricSection title="Users" values={report.users} />
          <MetricSection title="Deposits" values={report.deposits} />
          <MetricSection title="Subscriptions" values={report.subscriptions} />
          <MetricSection
            title="Referral Commissions"
            values={report.commissions}
          />
          <MetricSection title="Rewards" values={report.rewards} />
          <MetricSection title="Payouts" values={report.payouts} />

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
                        <td>{row.balance}</td>
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
