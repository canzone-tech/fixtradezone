"use client";

import { useId, useMemo } from "react";

export interface LiveActivityPoint {
  label: string;
  value: number;
}

interface LiveActivityChartProps {
  title: string;
  description: string;
  points: LiveActivityPoint[];
  valueLabel?: string;
}

export default function LiveActivityChart({
  title,
  description,
  points,
  valueLabel = "events",
}: LiveActivityChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const chart = useMemo(() => {
    const safePoints = points.map((point) => ({
      ...point,
      value: Number.isFinite(point.value) ? Math.max(0, point.value) : 0,
    }));
    const max = Math.max(1, ...safePoints.map((point) => point.value));
    const width = 700;
    const height = 150;
    const padX = 12;
    const padY = 14;
    const usableWidth = width - padX * 2;
    const usableHeight = height - padY * 2;
    const denominator = Math.max(1, safePoints.length - 1);
    const coordinates = safePoints.map((point, index) => ({
      ...point,
      x: padX + (usableWidth * index) / denominator,
      y: padY + usableHeight - (point.value / max) * usableHeight,
    }));
    const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
    const area =
      coordinates.length > 0
        ? `${padX},${height - padY} ${line} ${width - padX},${height - padY}`
        : "";
    const total = safePoints.reduce((sum, point) => sum + point.value, 0);

    return { width, height, coordinates, line, area, total };
  }, [points]);

  return (
    <div className="ftz-live-chart">
      <div className="ftz-live-chart-head">
        <div>
          <small>{description}</small>
          <strong>{title}</strong>
        </div>
        <span className="ftz-live-chart-badge">
          LIVE · {chart.total} {valueLabel}
        </span>
      </div>

      {chart.coordinates.length === 0 ? (
        <div className="ftz-live-chart-empty">No live activity is available yet.</div>
      ) : (
        <div className="ftz-live-chart-plot">
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-label={`${title}: ${chart.total} ${valueLabel}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ftz-primary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--ftz-primary)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polygon points={chart.area} fill={`url(#${gradientId})`} />
            <polyline className="ftz-live-chart-line" points={chart.line} />
            {chart.coordinates.map((point) => (
              <circle
                className="ftz-live-chart-dot"
                cx={point.x}
                cy={point.y}
                r="4"
                key={`${point.label}-${point.x}`}
              >
                <title>{`${point.label}: ${point.value} ${valueLabel}`}</title>
              </circle>
            ))}
          </svg>
          <div
            className="ftz-live-chart-labels"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))` }}
          >
            {points.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
