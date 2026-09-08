import type { Metadata } from "next";
import ResetPasswordClient from "./reset-password-client";

export const metadata: Metadata = {
  title: "Reset Password | FixTradeZone",
};

interface ResetPasswordPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = typeof rawToken === "string" ? rawToken.trim() : "";

  return <ResetPasswordClient token={token} />;
}
