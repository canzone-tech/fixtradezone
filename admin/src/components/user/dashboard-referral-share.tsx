"use client";

import { useEffect, useState } from "react";
import ReferralShareActions from "@/app/user/referrals/referral-share-actions";

interface ReferralProfile {
  referralCode: string | null;
}

export default function DashboardReferralShare() {
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadReferralCode() {
      try {
        const response = await fetch("/api/user/referrals", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const payload = (await response.json()) as ReferralProfile;
        if (mounted) {
          setReferralCode(payload.referralCode ?? null);
        }
      } catch {
        // Dashboard referral sharing is optional and must not block the workspace.
      }
    }

    void loadReferralCode();

    return () => {
      mounted = false;
    };
  }, []);

  if (!referralCode) return null;

  return (
    <section className="ftz-panel" aria-label="Share referral invite">
      <div className="ftz-panel-heading">
        <div>
          <h3>Share Your Referral Invite</h3>
          <p>Send your referral registration link directly from the dashboard.</p>
        </div>
      </div>
      <ReferralShareActions referralCode={referralCode} />
    </section>
  );
}
