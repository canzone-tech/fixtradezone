import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import FieldHelpTarget from "@/components/ui/field-help-target";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import DepositsClient from "./deposits-client";

export const metadata: Metadata = {
  title: "Deposits | FixTradeZone",
};

export default async function DepositsPage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <DepositsClient />
      <FieldHelpTarget
        targetId="account-qr"
        label="QR image requirements"
        content="Use PNG, JPG, WEBP, or SVG up to 256 KiB. The QR must encode the same public receiving address configured for this account."
      />
    </AdminShell>
  );
}
