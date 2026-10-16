"use client";

import type { CSSProperties } from "react";

export type HistoryPeriod = "1d" | "2d" | "7d" | "30d" | "custom" | "all";

export interface HistoryQuery {
  period: HistoryPeriod;
  fromDate: string;
  toDate: string;
  page: number;
  limit: number;
}

export const INITIAL_HISTORY_QUERY: HistoryQuery = {
  period: "2d",
  fromDate: "",
  toDate: "",
  page: 1,
  limit: 20,
};

export function historyQueryParams(query: HistoryQuery): URLSearchParams {
  const params = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });

  if (query.period === "custom") {
    if (query.fromDate) params.set("fromDate", query.fromDate);
    if (query.toDate) params.set("toDate", query.toDate);
  } else if (query.period !== "all") {
    params.set("days", query.period.slice(0, -1));
  }

  return params;
}

export default function HistoryControls({
  value,
  total,
  onChange,
}: {
  value: HistoryQuery;
  total: number;
  onChange: (query: HistoryQuery) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / value.limit));
  const page = Math.min(value.page, pages);

  const inputStyle: CSSProperties = {
    background: "#081934",
    border: "1px solid #25426a",
    borderRadius: 8,
    color: "#e4f2ff",
    font: "inherit",
    padding: "9px 10px",
  };
  const labelStyle: CSSProperties = {
    display: "grid",
    gap: 5,
    fontSize: 12,
  };
  const buttonStyle: CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
    padding: "7px 12px",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "end",
        gap: 12,
        margin: "16px 0",
      }}
    >
      <label style={labelStyle}>
        <span>Date range (UTC)</span>
        <select
          aria-label="History date range"
          style={inputStyle}
          value={value.period}
          onChange={(event) =>
            onChange({
              ...value,
              period: event.target.value as HistoryPeriod,
              page: 1,
            })
          }
        >
          <option value="1d">Last 1 day (UTC)</option>
          <option value="2d">Last 2 days (UTC)</option>
          <option value="7d">Last 7 days (UTC)</option>
          <option value="30d">Last 30 days (UTC)</option>
          <option value="custom">Custom dates</option>
          <option value="all">All history</option>
        </select>
      </label>
      {value.period === "custom" ? (
        <>
          <label style={labelStyle}>
            <span>From (UTC)</span>
            <input
              aria-label="History from date"
              style={inputStyle}
              type="date"
              max={value.toDate || undefined}
              value={value.fromDate}
              onChange={(event) =>
                onChange({ ...value, fromDate: event.target.value, page: 1 })
              }
            />
          </label>
          <label style={labelStyle}>
            <span>To (UTC)</span>
            <input
              aria-label="History to date"
              style={inputStyle}
              type="date"
              min={value.fromDate || undefined}
              value={value.toDate}
              onChange={(event) =>
                onChange({ ...value, toDate: event.target.value, page: 1 })
              }
            />
          </label>
        </>
      ) : null}
      <label style={labelStyle}>
        <span>Rows per page</span>
        <select
          aria-label="Rows per page"
          style={inputStyle}
          value={value.limit}
          onChange={(event) =>
            onChange({ ...value, limit: Number(event.target.value), page: 1 })
          }
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </label>
      <div
        role="navigation"
        aria-label="History pages"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginLeft: "auto",
        }}
      >
        <span style={{ color: "#9fbbdb", fontSize: 12 }}>
          {total ? (page - 1) * value.limit + 1 : 0}–
          {Math.min(page * value.limit, total)} of {total} · Page {page}/{pages}
        </span>
        <button
          type="button"
          style={buttonStyle}
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() =>
            onChange({ ...value, page: Math.max(1, page - 1) })
          }
        >
          ‹
        </button>
        <button
          type="button"
          style={buttonStyle}
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange({ ...value, page: page + 1 })}
        >
          ›
        </button>
      </div>
    </div>
  );
}
