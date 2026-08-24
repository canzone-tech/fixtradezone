interface FixTradeZoneBrandProps {
  portalLabel?: "ADMIN PORTAL" | "USER PORTAL" | "SECURE PORTAL";
  className?: string;
}

export default function FixTradeZoneBrand({
  portalLabel,
  className,
}: FixTradeZoneBrandProps) {
  const label = portalLabel
    ? `FixTradeZone ${portalLabel}`
    : "FixTradeZone";

  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 620 110"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient
          id="ftzCanonicalBrand"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop offset="0" stopColor="#22f2df" />
          <stop offset=".55" stopColor="#35b8ff" />
          <stop offset="1" stopColor="#8b55ff" />
        </linearGradient>

        <filter
          id="ftzCanonicalGlow"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="3" result="blur" />

          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        transform="translate(10 10)"
        fill="none"
        stroke="url(#ftzCanonicalBrand)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ftzCanonicalGlow)"
      >
        <path
          d="
            M45 4
            L82 25
            V66
            L45 87
            L8 66
            V25
            Z
          "
        />

        <path d="M25 28H65" />
        <path d="M25 28V67" />
        <path d="M25 47H56" />
        <path d="M60 47L76 31" />
        <path d="M60 47L76 63" />
      </g>

      <text
        x="118"
        y="53"
        fill="#f1fbff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="38"
        fontWeight="800"
        letterSpacing="1"
      >
        FIXTRADEZONE
      </text>

      {portalLabel ? (
        <text
          x="120"
          y="82"
          fill="#65e9dc"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="17"
          fontWeight="600"
          letterSpacing="4"
        >
          {portalLabel}
        </text>
      ) : null}
    </svg>
  );
}
