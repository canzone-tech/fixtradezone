"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import FieldHelp from "./field-help";

interface FieldHelpTargetProps {
  targetId: string;
  content: string;
  label?: string;
}

export default function FieldHelpTarget({
  targetId,
  content,
  label,
}: FieldHelpTargetProps) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let ownedMount: HTMLSpanElement | null = null;
    let observer: MutationObserver | null = null;

    const attach = () => {
      const control = document.getElementById(targetId);
      if (!control) return false;

      const form = control.closest("form") ?? document;
      const labels = Array.from(form.querySelectorAll<HTMLLabelElement>("label[for]"));
      const targetLabel = labels.find(
        (candidate) => candidate.htmlFor === targetId,
      );
      if (!targetLabel) return false;

      const existing = targetLabel.querySelector<HTMLElement>(
        `[data-field-help-target="${targetId}"]`,
      );
      if (existing) {
        setMount(existing);
        return true;
      }

      ownedMount = document.createElement("span");
      ownedMount.dataset.fieldHelpTarget = targetId;
      targetLabel.appendChild(ownedMount);
      setMount(ownedMount);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      ownedMount?.remove();
      setMount(null);
    };
  }, [targetId]);

  if (!mount) return null;

  return createPortal(
    <FieldHelp content={content} label={label} />,
    mount,
  );
}
