import type { Metadata } from "next";
import UserGenealogyClient from "./user-genealogy-client";

export const metadata: Metadata = {
  title: "My Genealogy",
};

export default function UserGenealogyPage() {
  return <UserGenealogyClient />;
}
