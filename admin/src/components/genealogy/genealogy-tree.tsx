"use client";

import { useCallback, useEffect, useState } from "react";
import {
  genealogyDisplayName,
  type GenealogyNode,
  type GenealogyPage,
} from "@/lib/genealogy";
import styles from "./genealogy-tree.module.css";

interface GenealogyTreeProps {
  apiPath: string;
  rootUserId?: string;
  onAccessError?: (status: number) => void;
}

interface PageState {
  page: number;
  totalPages: number;
  total: number;
}

interface ErrorPayload {
  message?: string;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function GenealogyTree({
  apiPath,
  rootUserId,
  onAccessError,
}: GenealogyTreeProps) {
  const [root, setRoot] = useState<GenealogyNode | null>(null);
  const [childrenByParent, setChildrenByParent] = useState<
    Record<string, GenealogyNode[]>
  >({});
  const [pagesByParent, setPagesByParent] = useState<Record<string, PageState>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  const requestPage = useCallback(
    async (parentUserId?: string, page = 1): Promise<GenealogyPage> => {
      const params = new URLSearchParams();
      if (rootUserId) params.set("rootUserId", rootUserId);
      if (parentUserId) params.set("parentUserId", parentUserId);
      params.set("page", String(page));
      params.set("limit", "25");

      const response = await fetch(`${apiPath}?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await readPayload<GenealogyPage & ErrorPayload>(response);

      if (response.status === 401 || response.status === 403) {
        onAccessError?.(response.status);
      }

      if (!response.ok || !payload?.parent || !payload.pagination) {
        throw new Error(payload?.message || "Unable to load genealogy tree.");
      }

      return payload;
    },
    [apiPath, onAccessError, rootUserId],
  );

  const loadRoot = useCallback(async () => {
    try {
      setError("");
      const payload = await requestPage(undefined, 1);
      setRoot(payload.parent);
      setChildrenByParent({ [payload.parent.id]: payload.children });
      setPagesByParent({
        [payload.parent.id]: {
          page: payload.pagination.page,
          totalPages: payload.pagination.totalPages,
          total: payload.pagination.total,
        },
      });
      setExpanded(new Set([payload.parent.id]));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load genealogy.",
      );
    } finally {
      setInitialLoading(false);
    }
  }, [requestPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRoot();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRoot]);

  async function loadChildren(parentUserId: string, page = 1) {
    setLoadingIds((current) => new Set(current).add(parentUserId));
    setError("");

    try {
      const payload = await requestPage(parentUserId, page);
      setChildrenByParent((current) => ({
        ...current,
        [parentUserId]:
          page === 1
            ? payload.children
            : [...(current[parentUserId] ?? []), ...payload.children],
      }));
      setPagesByParent((current) => ({
        ...current,
        [parentUserId]: {
          page: payload.pagination.page,
          totalPages: payload.pagination.totalPages,
          total: payload.pagination.total,
        },
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to expand member.",
      );
      throw caught;
    } finally {
      setLoadingIds((current) => {
        const next = new Set(current);
        next.delete(parentUserId);
        return next;
      });
    }
  }

  async function toggleNode(node: GenealogyNode) {
    if (!node.hasChildren) return;

    if (expanded.has(node.id)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(node.id);
        return next;
      });
      return;
    }

    if (!childrenByParent[node.id]) {
      try {
        await loadChildren(node.id, 1);
      } catch {
        return;
      }
    }

    setExpanded((current) => new Set(current).add(node.id));
  }

  async function loadMore(parentUserId: string) {
    const pageState = pagesByParent[parentUserId];
    if (!pageState || pageState.page >= pageState.totalPages) return;

    try {
      await loadChildren(parentUserId, pageState.page + 1);
    } catch {
      // The tree keeps the already-loaded children visible on a failed next page.
    }
  }

  function renderNode(node: GenealogyNode, depth: number) {
    const isExpanded = expanded.has(node.id);
    const isLoading = loadingIds.has(node.id);
    const children = childrenByParent[node.id] ?? [];
    const pageState = pagesByParent[node.id];
    const canLoadMore =
      isExpanded &&
      pageState !== undefined &&
      pageState.page < pageState.totalPages;

    return (
      <div className={styles.branch} key={node.id}>
        <div
          className={`${styles.node} ${depth === 0 ? styles.rootNode : ""}`}
          style={{ marginLeft: `${Math.min(depth, 10) * 22}px` }}
        >
          <div className={styles.identity}>
            <div className={styles.avatar}>
              {genealogyDisplayName(node).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <strong>{genealogyDisplayName(node)}</strong>
              <span>@{node.username}</span>
            </div>
          </div>

          <div className={styles.badges}>
            <span>{node.status}</span>
            <span>{node.assignmentStatus}</span>
            <span className={node.hasActivePackage ? styles.activePackage : ""}>
              {node.activePackageCount} active package
              {node.activePackageCount === 1 ? "" : "s"}
            </span>
            <span>
              {node.directReferralCount} direct referral
              {node.directReferralCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className={styles.actions}>
            <small>{node.referralCode}</small>
            {node.hasChildren ? (
              <button
                type="button"
                onClick={() => void toggleNode(node)}
                disabled={isLoading}
                aria-expanded={isExpanded}
              >
                <i
                  className={
                    isExpanded ? "iconoir-nav-arrow-up" : "iconoir-nav-arrow-down"
                  }
                />
                {isLoading ? "Loading…" : isExpanded ? "Collapse" : "Expand"}
              </button>
            ) : (
              <span className={styles.leaf}>Leaf member</span>
            )}
          </div>
        </div>

        {isExpanded ? (
          <div className={styles.children}>
            {children.map((child) => renderNode(child, depth + 1))}
            {canLoadMore ? (
              <button
                type="button"
                className={styles.loadMore}
                onClick={() => void loadMore(node.id)}
                disabled={isLoading}
              >
                Load more direct referrals ({pageState.total} total)
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className={styles.loading}>
        <span />
        <p>Loading genealogy tree…</p>
      </div>
    );
  }

  if (!root) {
    return (
      <div className={styles.empty}>
        <i className="iconoir-community" />
        <strong>Genealogy unavailable</strong>
        <p>{error || "No enrolled referral root is available."}</p>
      </div>
    );
  }

  return (
    <section className={styles.treeCard}>
      <div className={styles.treeHeader}>
        <div>
          <span>LAZY-LOADED NETWORK</span>
          <h3>Genealogy tree</h3>
        </div>
        <b>Expand members to load the next level</b>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.tree}>{renderNode(root, 0)}</div>
    </section>
  );
}
