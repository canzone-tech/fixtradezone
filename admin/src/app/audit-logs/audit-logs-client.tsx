"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FlashMessage from "@/components/ui/flash-message";
import styles from "@/components/closeout/closeout.module.css";
import { formatPlatformDateTime } from "@/lib/platform-time";

const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "APPROVE",
  "REJECT",
  "SUSPEND",
  "ACTIVATE",
  "BLOCK",
  "UNBLOCK",
  "PASSWORD_CHANGE",
  "ROLE_CHANGE",
  "PERMISSION_CHANGE",
  "IMPERSONATION_START",
  "IMPERSONATION_STOP",
] as const;

interface AuditLogItem {
  id: string;
  actorUserId: string | null;
  actor: {
    id: string;
    username: string | null;
    email: string | null;
  } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  page: number;
  limit: number;
  total: number;
  auditLogs: AuditLogItem[];
  message?: string;
}

async function readPayload(response: Response): Promise<AuditLogsResponse> {
  const payload = (await response.json().catch(() => null)) as
    | AuditLogsResponse
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? "Could not load audit logs.");
  }

  return payload;
}

function actorLabel(item: AuditLogItem): string {
  if (!item.actor) return "SYSTEM / UNKNOWN";
  return item.actor.username || item.actor.email || item.actor.id;
}

function metadataText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function csvEscape(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AuditLogsClient() {
  const router = useRouter();
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function queryFor(pageNumber: number): string {
    const params = new URLSearchParams();
    params.set("page", String(pageNumber));
    params.set("limit", "50");
    if (action) params.set("action", action);
    if (entityType.trim()) params.set("entityType", entityType.trim());
    if (actorUserId.trim()) params.set("actorUserId", actorUserId.trim());
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    return `?${params.toString()}`;
  }

  const load = useCallback(
    async (requestQuery: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/audit-logs${requestQuery}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        setData(await readPayload(response));
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Could not load audit logs.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load("?page=1&limit=50");
  }, [load]);

  function runFilter() {
    setPage(1);
    void load(queryFor(1));
  }

  function resetFilters() {
    setPage(1);
    setAction("");
    setEntityType("");
    setActorUserId("");
    setSearch("");
    setFrom("");
    setTo("");
    void load("?page=1&limit=50");
  }

  function exportCsv() {
    if (!data) return;

    const lines = [
      "createdAt,actor,actorUserId,action,entityType,entityId,description,ipAddress,metadata",
      ...data.auditLogs.map((item) =>
        [
          csvEscape(item.createdAt),
          csvEscape(actorLabel(item)),
          csvEscape(item.actorUserId),
          csvEscape(item.action),
          csvEscape(item.entityType),
          csvEscape(item.entityId),
          csvEscape(item.description),
          csvEscape(item.ipAddress),
          csvEscape(metadataText(item.metadata)),
        ].join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fixtradezone-audit-logs-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

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
        <p className={styles.eyebrow}>AUDIT-01 / IMMUTABLE READBACK</p>
        <h1>Audit Logs</h1>
        <p>
          Read-only operational history for security, configuration, review,
          accounting and administration actions. Audit records cannot be edited
          or deleted from this workspace.
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="audit-action">Action</label>
            <select
              id="audit-action"
              className={styles.select}
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="audit-entity-type">Entity type</label>
            <input
              id="audit-entity-type"
              className={styles.input}
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="PayoutRequest"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="audit-actor">Actor user UUID</label>
            <input
              id="audit-actor"
              className={styles.input}
              value={actorUserId}
              onChange={(event) => setActorUserId(event.target.value)}
              placeholder="Optional exact UUID"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="audit-search">Search</label>
            <input
              id="audit-search"
              className={styles.input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Description, entity, actor"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="audit-from">From</label>
            <input
              id="audit-from"
              className={styles.input}
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="audit-to">To (exclusive)</label>
            <input
              id="audit-to"
              className={styles.input}
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className={styles.button}
            onClick={runFilter}
            disabled={loading}
          >
            {loading ? "Loading…" : "Apply filters"}
          </button>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={resetFilters}
            disabled={loading}
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={exportCsv}
            disabled={!data?.auditLogs.length}
          >
            Export page CSV
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.notificationHeader}>
          <div>
            <p className={styles.eyebrow}>Readback</p>
            <h2>Immutable events</h2>
          </div>
          <span className={styles.meta}>
            {data ? `${data.total} matching event(s)` : "Loading…"}
          </span>
        </div>

        {data?.auditLogs.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {data.auditLogs.map((item) => (
                  <tr key={item.id}>
                    <td>{formatPlatformDateTime(item.createdAt)}</td>
                    <td>
                      <strong>{actorLabel(item)}</strong>
                      {item.actorUserId ? (
                        <div className={styles.meta}>{item.actorUserId}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={styles.badge}>{item.action}</span>
                    </td>
                    <td>
                      <strong>{item.entityType}</strong>
                      {item.entityId ? (
                        <div className={styles.meta}>{item.entityId}</div>
                      ) : null}
                    </td>
                    <td>{item.description ?? "—"}</td>
                    <td>
                      <div className={styles.meta}>
                        IP: {item.ipAddress ?? "—"}
                      </div>
                      {item.metadata !== null && item.metadata !== undefined ? (
                        <details>
                          <summary>Metadata</summary>
                          <pre style={{ whiteSpace: "pre-wrap" }}>
                            {metadataText(item.metadata)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            {loading
              ? "Loading audit logs…"
              : "No audit events matched the filters."}
          </div>
        )}

        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              void load(queryFor(next));
            }}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          <span className={styles.meta}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={() => {
              const next = Math.min(totalPages, page + 1);
              setPage(next);
              void load(queryFor(next));
            }}
            disabled={loading || page >= totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
