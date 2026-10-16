"use client";

import { useEffect, useState } from "react";
import { genealogyDisplayName } from "@/lib/genealogy";
import styles from "./user-genealogy.module.css";

interface LevelMember {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  referralCode: string;
  sponsorUserId: string | null;
  sponsorUsername: string | null;
  sponsorFirstName: string | null;
  sponsorLastName: string | null;
}

interface LevelResponse {
  selectedLevel: number;
  directCount: number;
  teamCount: number;
  levels: Array<{ level: number; count: number }>;
  members: LevelMember[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  message?: string;
}

interface Props {
  onAccessError: (status: number) => void;
}

export default function LevelWiseMembers({ onAccessError }: Props) {
  const [level, setLevel] = useState(1);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LevelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      level: String(level),
      page: String(page),
      limit: "25",
    });

    void (async () => {
      try {
        const response = await fetch(
          `/api/user/referrals/genealogy/levels?${params}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (!response.ok) {
          onAccessError(response.status);
          throw new Error("Unable to load members for this level.");
        }
        const payload = (await response.json()) as LevelResponse;
        if (!controller.signal.aborted) setData(payload);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load level members.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [level, page, onAccessError]);

  return (
    <section className={styles.listCard}>
      <div className={styles.listHeading}>
        <div>
          <span className={styles.listEyebrow}>LEVEL-WISE DOWNLINE</span>
          <h3>Members by Level</h3>
          <p>Browse your own referral team and see each member&apos;s direct sponsor.</p>
        </div>
        <label className={styles.levelPicker}>
          <span>Select level</span>
          <select
            value={level}
            onChange={(event) => {
              setLevel(Number(event.target.value));
              setPage(1);
            }}
          >
            {(data?.levels.length ? data.levels : [{ level: 1, count: 0 }]).map(
              (item) => (
                <option key={item.level} value={item.level}>
                  Level {item.level} ({item.count})
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      {data ? (
        <div className={styles.counts}>
          <span>Direct Members: <strong>{data.directCount}</strong></span>
          <span>Total Team Members: <strong>{data.teamCount}</strong></span>
          <span>Level {level} Members: <strong>{data.levels.find((item) => item.level === level)?.count ?? 0}</strong></span>
        </div>
      ) : null}

      {error ? <div className={styles.listError} role="alert">{error}</div> : null}
      {loading ? <p className={styles.listMessage}>Loading members…</p> : null}
      {!loading && data?.members.length === 0 ? (
        <p className={styles.listMessage}>No members found at this level.</p>
      ) : null}
      {!loading && data && data.members.length > 0 ? (
        <>
          <div className={styles.memberTableWrap}>
            <table className={styles.memberTable}>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Direct Sponsor</th>
                  <th>Status</th>
                  <th>Referral Code</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{genealogyDisplayName(member)}</strong>
                      <small>@{member.username}</small>
                    </td>
                    <td>
                      {member.sponsorUsername ? (
                        <>
                          <strong>
                            {genealogyDisplayName({
                              username: member.sponsorUsername,
                              firstName: member.sponsorFirstName,
                              lastName: member.sponsorLastName,
                            })}
                          </strong>
                          <small>@{member.sponsorUsername}</small>
                        </>
                      ) : "—"}
                    </td>
                    <td>{member.status}</td>
                    <td>{member.referralCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.listPagination}>
            <span>
              {data.pagination.total} members · Page {data.pagination.page} of {data.pagination.totalPages}
            </span>
            <div>
              <button
                type="button"
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((previous) => previous + 1)}
                disabled={page >= data.pagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
