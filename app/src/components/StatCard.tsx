import styles from "./StatCard.module.css";

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>{label}</div>
      <div className={`vv-mono ${styles.value}`}>{value}</div>
    </div>
  );
}
