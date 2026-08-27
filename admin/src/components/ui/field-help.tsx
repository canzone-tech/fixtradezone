"use client";

import { useId } from "react";
import styles from "./field-help.module.css";

interface FieldHelpProps {
  content: string;
  label?: string;
}

export default function FieldHelp({
  content,
  label = "Field guidance",
}: FieldHelpProps) {
  const tooltipId = useId();

  return (
    <span className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <i className="iconoir-info-circle" aria-hidden="true" />
      </button>
      <span id={tooltipId} className={styles.tooltip} role="tooltip">
        {content}
      </span>
    </span>
  );
}

interface FieldErrorProps {
  id?: string;
  message: string | null | undefined;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;

  return (
    <small id={id} className={styles.error} role="alert">
      <i className="iconoir-warning-circle" aria-hidden="true" />
      <span>{message}</span>
    </small>
  );
}
