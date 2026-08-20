"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/auth";

type SparklineProps = {
  values: number[];
  tone: "green" | "blue" | "orange" | "purple" | "cyan";
};

const marketTicker = [
  { coin: "BTC", pair: "BTC/USDT", price: "$67,452.21", change: "+2.45%", tone: "orange" },
  { coin: "ETH", pair: "ETH/USDT", price: "$3,512.48", change: "+2.18%", tone: "blue" },
  { coin: "BNB", pair: "BNB/USDT", price: "$598.16", change: "+3.21%", tone: "orange" },
  { coin: "SOL", pair: "SOL/USDT", price: "$145.91", change: "+4.12%", tone: "purple" },
  { coin: "XRP", pair: "XRP/USDT", price: "$0.5214", change: "+1.18%", tone: "dark" },
  { coin: "DOGE", pair: "DOGE/USDT", price: "$0.1287", change: "+5.34%", tone: "gold" },
];

const metrics = [
  {
    label: "Total Users",
    value: "1,482",
    change: "12.5%",
    detail: "vs last 30 days",
    icon: "iconoir-community",
    tone: "cyan",
    spark: [8, 10, 9, 12, 13, 18, 22, 21, 27],
  },
  {
    label: "Active Packages",
    value: "8",
    change: "2",
    detail: "new this month",
    icon: "iconoir-box",
    tone: "blue",
    spark: [5, 7, 6, 8, 10, 9, 12, 15, 17],
  },
  {
    label: "Total Deposits",
    value: "$56,230.50",
    change: "18.7%",
    detail: "vs last 30 days",
    icon: "iconoir-wallet",
    tone: "orange",
    spark: [4, 6, 7, 11, 9, 13, 16, 22, 26],
  },
  {
    label: "Total Payouts",
    value: "$24,120.80",
    change: "14.3%",
    detail: "vs last 30 days",
    icon: "iconoir-coins-swap",
    tone: "purple",
    spark: [4, 5, 7, 8, 6, 10, 12, 15, 19],
  },
  {
    label: "Simulated Trades",
    value: "156",
    change: "Today: 5",
    detail: "completed",
    icon: "iconoir-graph-up",
    tone: "cyan",
    spark: [8, 6, 10, 12, 9, 14, 11, 17, 21],
  },
] as const;

const activity = [
  ["iconoir-user-plus", "New user registered", "john.doe@example.com", "10:24 AM", "cyan"],
  ["iconoir-box", "New package created", "Premium Pro Package", "09:58 AM", "blue"],
  ["iconoir-bitcoin-circle", "New deposit received", "BTC · $1,250.00", "09:42 AM", "orange"],
  ["iconoir-coins-swap", "Payout processed", "USDT · $980.00", "08:15 AM", "green"],
  ["iconoir-graph-up", "Simulated trade completed", "ETH/USDT · WIN · +2.45%", "08:55 AM", "blue"],
  ["iconoir-lock", "Role updated", "ADMIN role permissions modified", "08:30 AM", "purple"],
] as const;

const transactions = [
  ["TXN-9846215", "Deposit", "james.wilson@example.com", "BTC", "$1,250.00", "Completed", "10:22 AM"],
  ["TXN-9846214", "Payout", "sarah.johnson@example.com", "USDT", "$980.00", "Completed", "10:15 AM"],
  ["TXN-9846213", "Deposit", "michael.brown@example.com", "ETH", "$750.50", "Completed", "10:10 AM"],
  ["TXN-9846212", "Deposit", "david.martinez@example.com", "BNB", "$620.00", "Pending", "10:05 AM"],
  ["TXN-9846211", "Payout", "emma.davis@example.com", "USDT", "$1,100.00", "Completed", "10:01 AM"],
] as const;

const tradingSeries = {
  deposits: [12, 18, 21, 31, 44, 52, 48, 60, 56, 66, 58, 79],
  payouts: [5, 7, 11, 18, 24, 31, 28, 36, 32, 39, 35, 48],
  users: [3, 5, 8, 11, 14, 19, 16, 20, 18, 22, 20, 27],
};

function Sparkline({ values, tone }: SparklineProps) {
  const width = 90;
  const height = 36;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className={`ftz-spark ftz-spark-${tone}`} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function linePath(values: number[], width: number, height: number) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function TradingChart() {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState(7);
  const width = 620;
  const height = 180;
  const count = tradingSeries.deposits.length;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setHoverIndex(Math.round(ratio * (count - 1)));
  };

  const hoverX = (hoverIndex / (count - 1)) * width;

  return (
    <div className="ftz-chart-wrap">
      <svg
        ref={ref}
        className="ftz-trading-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
      >
        <defs>
          <linearGradient id="depositFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#18f1b1" stopOpacity=".20" />
            <stop offset="100%" stopColor="#18f1b1" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="0"
            x2={width}
            y1={(height / 3) * line}
            y2={(height / 3) * line}
            className="ftz-chart-grid"
          />
        ))}

        <path
          d={`${linePath(tradingSeries.deposits, width, height)} L ${width} ${height} L 0 ${height} Z`}
          fill="url(#depositFill)"
        />
        <path d={linePath(tradingSeries.deposits, width, height)} className="ftz-chart-line is-green" />
        <path d={linePath(tradingSeries.payouts, width, height)} className="ftz-chart-line is-purple" />
        <path d={linePath(tradingSeries.users, width, height)} className="ftz-chart-line is-blue" />

        <line x1={hoverX} x2={hoverX} y1="0" y2={height} className="ftz-chart-crosshair" />
      </svg>

      <div
        className="ftz-chart-tooltip"
        style={{ left: `${Math.min(Math.max((hoverIndex / (count - 1)) * 100, 12), 78)}%` }}
      >
        <strong>May {String(10 + hoverIndex).padStart(2, "0")}, 2026</strong>
        <span><i className="dot green" /> Deposits <b>${(tradingSeries.deposits[hoverIndex] * 420).toLocaleString()}</b></span>
        <span><i className="dot purple" /> Payouts <b>${(tradingSeries.payouts[hoverIndex] * 390).toLocaleString()}</b></span>
        <span><i className="dot blue" /> Users <b>{tradingSeries.users[hoverIndex] * 58}</b></span>
      </div>

      <div className="ftz-chart-months">
        <span>May 01</span><span>May 05</span><span>May 10</span><span>May 15</span><span>May 20</span><span>May 25</span><span>May 30</span>
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          user?: AdminUser;
        };

        if (!response.ok || !payload.user) {
          router.replace("/login");
          return;
        }

        if (mounted) setUser(payload.user);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const displayName = useMemo(() => {
    if (!user) return "Super Admin";
    return (
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      "Super Admin"
    );
  }, [user]);

  if (loading) {
    return (
      <div className="ftz-dashboard-loading">
        <span />
        <p>Loading secure workspace…</p>
      </div>
    );
  }

  return (
    <div className="ftz-dashboard">
      <div className="ftz-market-ticker" aria-label="Market preview data">
        {marketTicker.map((item) => (
          <div className="ftz-market-item" key={item.coin}>
            <span className={`ftz-coin ftz-coin-${item.tone}`}>{item.coin[0]}</span>
            <div>
              <strong>{item.pair}</strong>
              <small>{item.price}</small>
            </div>
            <b>{item.change}</b>
            <Sparkline values={[5, 8, 6, 10, 14, 11, 17, 16, 20]} tone="green" />
          </div>
        ))}
      </div>

      <div className="ftz-dashboard-layout">
        <section className="ftz-dashboard-primary">
          <section className="ftz-hero">
            <div className="ftz-hero-copy">
              <span className="ftz-secure-pill">
                <i className="iconoir-shield-check" /> Secure Workspace
              </span>
              <h2>Welcome back, {displayName}! 👋</h2>
              <p>Monitor, manage and grow FixTradeZone with real-time insights.</p>
              <div className="ftz-hero-meta">
                <span><i className="iconoir-clock" /> Last login: Today, 10:24 AM</span>
                <span><i className="iconoir-map-pin" /> IP: 192.168.1.101</span>
              </div>
            </div>
            <div className="ftz-hero-art" aria-hidden="true" />
          </section>

          <section className="ftz-metric-grid">
            {metrics.map((metric) => (
              <article className={`ftz-metric-card is-${metric.tone}`} key={metric.label}>
                <div className="ftz-metric-icon">
                  <i className={metric.icon} />
                </div>
                <div className="ftz-metric-copy">
                  <small>{metric.label}</small>
                  <strong>{metric.value}</strong>
                  <span><b>↑ {metric.change}</b> {metric.detail}</span>
                </div>
                <Sparkline values={[...metric.spark]} tone={metric.tone} />
              </article>
            ))}
          </section>

          <section className="ftz-mid-grid">
            <article className="ftz-panel ftz-trading-panel">
              <div className="ftz-panel-heading">
                <div>
                  <h3>Trading Overview</h3>
                  <div className="ftz-legend">
                    <span><i className="dot green" /> Deposits</span>
                    <span><i className="dot purple" /> Payouts</span>
                    <span><i className="dot blue" /> Users</span>
                  </div>
                </div>
                <button type="button">This Month <i className="iconoir-nav-arrow-down" /></button>
              </div>

              <TradingChart />

              <div className="ftz-chart-stats">
                <div><small>Total Deposits</small><strong>$56,230.50</strong><span>↑ 18.7%</span></div>
                <div><small>Total Payouts</small><strong>$24,120.80</strong><span className="purple">↑ 14.3%</span></div>
                <div><small>Total Users</small><strong>1,482</strong><span>↑ 12.5%</span></div>
                <div><small>New Users</small><strong>185</strong><span className="orange">↑ 9.4%</span></div>
              </div>
            </article>

            <div className="ftz-stack">
              <article className="ftz-panel ftz-deposit-panel">
                <h3>Deposits Overview</h3>
                <div className="ftz-deposit-body">
                  <div className="ftz-donut">
                    <div><strong>$56,230.50</strong><small>Total Deposits</small></div>
                  </div>
                  <div className="ftz-deposit-legend">
                    <span><i className="btc" /> BTC <b>35.8%</b><em>$20,165.20</em></span>
                    <span><i className="usdt" /> USDT <b>28.4%</b><em>$15,955.90</em></span>
                    <span><i className="eth" /> ETH <b>18.7%</b><em>$10,512.40</em></span>
                    <span><i className="bnb" /> BNB <b>9.8%</b><em>$5,507.60</em></span>
                    <span><i className="other" /> Other <b>7.3%</b><em>$4,219.00</em></span>
                  </div>
                </div>
              </article>

              <article className="ftz-panel ftz-users-package">
                <h3>Users & Packages</h3>
                <div className="ftz-users-package-grid">
                  <div><small>Total Users</small><strong>1,482</strong><span>↑ 12.5%</span></div>
                  <div><small>Active Packages</small><strong>8</strong><span>↑ 2 new</span></div>
                </div>
                <div className="ftz-popular-package">
                  <i className="iconoir-crown" />
                  <div><small>Popular Package</small><strong>Premium Pro Package</strong><span>42.5% of Total Users</span></div>
                </div>
              </article>
            </div>
          </section>

          <article className="ftz-panel ftz-transactions-panel">
            <div className="ftz-panel-heading">
              <h3>Recent Transactions</h3>
              <button type="button">View all</button>
            </div>

            <div className="ftz-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>TX ID</th><th>Type</th><th>User</th><th>Asset</th><th>Amount</th><th>Status</th><th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((row) => (
                    <tr key={row[0]}>
                      <td>{row[0]}</td>
                      <td className={row[1] === "Deposit" ? "positive" : "muted"}>{row[1]}</td>
                      <td>{row[2]}</td>
                      <td><span className="ftz-mini-coin">{row[3][0]}</span> {row[3]}</td>
                      <td>{row[4]}</td>
                      <td><span className={`ftz-status ${row[5] === "Pending" ? "pending" : "complete"}`}>{row[5]}</span></td>
                      <td>{row[6]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <aside className="ftz-dashboard-side">
          <article className="ftz-panel ftz-referral-card">
            <h3>Referral Metrics</h3>
            <div className="ftz-referral-top">
              <div className="ftz-referral-icon"><i className="iconoir-community" /></div>
              <div><small>Total Referrals</small><strong>320</strong><span>↑ 8.15% vs last 30 days</span></div>
            </div>
            <div className="ftz-referral-split">
              <div><small>Active Referrals</small><strong>188</strong><span>58.8% of total</span></div>
              <div><small>Referral Commissions</small><strong>$1,230.00</strong><span>↑ 24.5%</span></div>
            </div>
          </article>

          <article className="ftz-panel ftz-activity-panel">
            <div className="ftz-panel-heading">
              <h3>Recent Activity</h3>
              <button type="button">View all</button>
            </div>
            <div className="ftz-activity-list">
              {activity.map(([icon, title, subtitle, time, tone]) => (
                <div className="ftz-activity-row" key={`${title}-${time}`}>
                  <span className={`ftz-activity-icon is-${tone}`}><i className={icon} /></span>
                  <div><strong>{title}</strong><small>{subtitle}</small></div>
                  <time>{time}</time>
                </div>
              ))}
            </div>
          </article>

          <article className="ftz-grow-card">
            <div>
              <h3>Grow Your Platform</h3>
              <p>Track performance, engage users and maximize your revenue.</p>
              <button type="button">Explore Insights <i className="iconoir-arrow-right" /></button>
            </div>
            <div className="ftz-grow-art">
              <span>₿</span><i className="iconoir-rocket" />
            </div>
          </article>
        </aside>
      </div>

      <p className="ftz-demo-note">
        Dashboard values are preview data for UI development. Simulated Trade Activity is simulated only.
      </p>
    </div>
  );
}
