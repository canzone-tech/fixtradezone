"use client";

import { useParams } from "next/navigation";
import PackageDepositClient from "../package-deposit-client";

export default function PackageDepositPage() {
  const params = useParams<{ packagePlanItemId: string }>();
  return <PackageDepositClient packagePlanItemId={params.packagePlanItemId} />;
}
