import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import ContentManagementClient from "./content-management-client";
import EmailTemplateTestWorkbench from "./email-template-test-workbench";

export const metadata: Metadata = {
  title: "Templates / CMS",
};

export default async function TemplatesPage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has(ACCESS_COOKIE) || cookieStore.has(REFRESH_COOKIE);

  if (!hasSession) {
    redirect("/login");
  }

  return (
    <AdminShell>
      <div style={{ display: "grid", gap: 22 }}>
        <ContentManagementClient />
        <EmailTemplateTestWorkbench />
      </div>
    </AdminShell>
  );
}
