import styles from "./ProgressBar.module.css";

export function ProgressBar({
  pct,
  variant = "orange",
}: {
  pct: number;
  variant?: "orange" | "green" | "red";
}) {
  const cls = [styles.bar, variant === "green" && styles.green, variant === "red" && styles.red]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.track}>
      <div className={cls} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
