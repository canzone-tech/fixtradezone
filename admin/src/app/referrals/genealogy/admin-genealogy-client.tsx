"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import GenealogyTree from "@/components/genealogy/genealogy-tree";
import {
  genealogyDisplayName,
  type GenealogySearchResponse,
} from "@/lib/genealogy";
import styles from "./admin-genealogy.module.css";

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

export default function AdminGenealogyClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GenealogySearchResponse["items"]>([]);
  const [rootUserId, setRootUserId] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      setSearchError("Enter at least 2 characters.");
      return;
    }

    setSearching(true);
    setSearchError("");

    try {
      const params = new URLSearchParams({ query: term });
      const response = await fetch(
        `/api/admin/referrals/genealogy/search?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = await readPayload<GenealogySearchResponse & ErrorPayload>(
        response,
      );

      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (!response.ok || !payload?.items) {
        throw new Error(payload?.message || "Unable to search referral members.");
      }

      setResults(payload.items);
    } catch (caught) {
      setSearchError(
        caught instanceof Error ? caught.message : "Unable to search members.",
      );
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function chooseRoot(userId: string) {
    setRootUserId(userId);
    setResults([]);
    setSearchError("");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>REFERRAL OPERATIONS</span>
          <h2>Genealogy Explorer</h2>
          <p>
            Read-only, lazy-loaded referral hierarchy. Search a member to inspect
            that member&apos;s subtree without changing sponsor assignments.
          </p>
        </div>
        <button type="button" onClick={() => setRootUserId(undefined)}>
          <i className="iconoir-community" />
          Primary referral root
        </button>
      </header>

      <section className={styles.searchCard}>
        <form onSubmit={(event) => void search(event)}>
          <div>
            <label htmlFor="genealogy-search">Find enrolled member</label>
            <p>Search by username, email, first name or last name.</p>
          </div>
          <div className={styles.searchControls}>
            <input
              id="genealogy-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="username or email"
              maxLength={100}
            />
            <button type="submit" disabled={searching}>
              <i className="iconoir-search" />
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        {searchError ? <div className={styles.error}>{searchError}</div> : null}

        {results.length > 0 ? (
          <div className={styles.results}>
            {results.map((member) => (
              <button
                type="button"
                key={member.id}
                onClick={() => chooseRoot(member.id)}
              >
                <div>
                  <strong>{genealogyDisplayName(member)}</strong>
                  <span>
                    @{member.username}
                    {member.email ? ` · ${member.email}` : ""}
                  </span>
                </div>
                <div className={styles.resultStats}>
                  <span>{member.status}</span>
                  <span>{member.directReferralCount} direct</span>
                  <span>{member.activePackageCount} active packages</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <GenealogyTree
        key={rootUserId ?? "configured-root"}
        apiPath="/api/admin/referrals/genealogy"
        rootUserId={rootUserId}
        onAccessError={(status) => {
          if (status === 401) {
            router.replace("/login");
            router.refresh();
          }
        }}
      />
    </div>
  );
}
