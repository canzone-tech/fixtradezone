"use client";

import { useState, type FormEvent } from "react";
import ContentManagementClient from "./content-management-client";
import EmailTemplateTestWorkbench from "./email-template-test-workbench";

const EMAIL_TEMPLATE_KEYS = new Set([
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "WELCOME",
  "MARKETING_OFFER",
  "DELIVERY_TEST",
]);

export default function TemplatesClientWorkspace() {
  const [selectedEmailKey, setSelectedEmailKey] = useState("");

  function syncEmailSelection(event: FormEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!EMAIL_TEMPLATE_KEYS.has(target.value)) return;

    setSelectedEmailKey(target.value);
  }

  return (
    <div style={{ display: "grid", gap: 22 }} onChange={syncEmailSelection}>
      <ContentManagementClient />
      <EmailTemplateTestWorkbench selectedContentKey={selectedEmailKey} />
    </div>
  );
}
