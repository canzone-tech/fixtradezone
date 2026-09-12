"use client";

import { useParams } from "next/navigation";
import TotalWalletPackagePurchaseClient from "../total-wallet-package-purchase-client";

export default function TotalWalletPackagePurchasePage() {
  const params = useParams<{ packagePlanItemId: string }>();
  return (
    <TotalWalletPackagePurchaseClient
      packagePlanItemId={params.packagePlanItemId}
    />
  );
}
