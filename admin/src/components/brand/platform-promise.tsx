export const PLATFORM_PROMISE = {
  headline: "Built for what’s next.",
  points: [
    "AI-powered insights and intelligent automation.",
    "Enterprise-grade security by design.",
    "Smarter support, powered by AI.",
  ],
} as const;

export default function PlatformPromise() {
  return (
    <section
      className="ftz-panel ftz-platform-promise"
      aria-label="FixTradeZone platform promise"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
        alignItems: "center",
        margin: "var(--ftz-page-gap) 0 0",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        <span
          style={{
            color: "var(--ftz-primary)",
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "0.1em",
          }}
        >
          FIXTRADEZONE INTELLIGENCE
        </span>
        <strong style={{ color: "var(--ftz-copy)", fontSize: "20px" }}>
          {PLATFORM_PROMISE.headline}
        </strong>
      </div>

      <div
        className="ftz-platform-promise-points"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "10px 16px",
        }}
      >
        {PLATFORM_PROMISE.points.map((point) => (
          <span
            key={point}
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
              color: "var(--ftz-copy-muted)",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            <b aria-hidden="true" style={{ color: "var(--ftz-primary)" }}>
              ◆
            </b>
            {point}
          </span>
        ))}
      </div>
    </section>
  );
}
