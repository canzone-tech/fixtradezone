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
    >
      <div className="ftz-platform-promise-copy">
        <span className="ftz-platform-promise-kicker">
          FIXTRADEZONE INTELLIGENCE
        </span>
        <strong className="ftz-platform-promise-headline">
          {PLATFORM_PROMISE.headline}
        </strong>
      </div>

      <div className="ftz-platform-promise-points">
        {PLATFORM_PROMISE.points.map((point) => (
          <span className="ftz-platform-promise-point" key={point}>
            <b aria-hidden="true">◆</b>
            {point}
          </span>
        ))}
      </div>
    </section>
  );
}
