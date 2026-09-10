"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UserDepositsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/user/packages");
  }, [router]);

  return null;
}
