"use client";

import { useEffect } from "react";
import styles from "./flash-message.module.css";

interface FlashMessageProps {
  message: string;
  type: "success" | "error" | "warning" | "info";
  onClose: () => void;
  autoDismissMs?: number;
}

export default function FlashMessage({
  message,
  type,
  onClose,
  autoDismissMs,
}: FlashMessageProps) {
  useEffect(() => {
    if (!message || !autoDismissMs) {
      return;
    }

    const timer = window.setTimeout(onClose, autoDismissMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [autoDismissMs, message, onClose]);

  if (!message) {
    return null;
  }

  const icon =
    type === "success"
      ? "iconoir-check-circle"
      : type === "error"
        ? "iconoir-warning-circle"
        : type === "warning"
          ? "iconoir-warning-triangle"
          : "iconoir-info-circle";

  return (
    <div
      className={`${styles.toast} ${styles[type]}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <i className={icon} aria-hidden="true" />

      <div className={styles.content}>
        <strong>
          {type === "success"
            ? "Success"
            : type === "error"
              ? "Action failed"
              : type === "warning"
                ? "Attention"
                : "Information"}
        </strong>

        <span>{message}</span>
      </div>

      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        <i className="iconoir-xmark" />
      </button>
    </div>
  );
}
