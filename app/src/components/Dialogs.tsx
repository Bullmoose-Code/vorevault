"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import styles from "./Dialogs.module.css";

type BaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
};

type ConfirmVariant = "primary" | "danger";

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "confirm",
  cancelLabel = "cancel",
  variant = "primary",
  onConfirm,
}: BaseProps & {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className={styles.message}>{message}</p>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={variant === "danger" ? styles.confirmDanger : styles.confirmPrimary}
          onClick={handleConfirm}
          disabled={busy}
          autoFocus
        >
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  open,
  onClose,
  title,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "save",
  onConfirm,
}: BaseProps & {
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setBusy(false);
      setError(null);
    }
  }, [open, initialValue]);

  const trimmed = value.trim();
  const disabled = busy || trimmed.length === 0 || trimmed === initialValue;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          {label}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className={styles.input}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
            cancel
          </button>
          <button type="submit" className={styles.confirmPrimary} disabled={disabled}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function InfoDialog({
  open,
  onClose,
  title,
  message,
}: BaseProps & { message: string }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.confirmPrimary} onClick={onClose} autoFocus>
          okay
        </button>
      </div>
    </Modal>
  );
}
