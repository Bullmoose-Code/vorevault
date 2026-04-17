import styles from "./MetaPanel.module.css";

type Row = { k: string; v: React.ReactNode };

export function MetaPanel({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <aside className={styles.panel}>
      <h3 className={styles.title}>{title}</h3>
      {rows.map((row, i) => (
        <div key={i} className={styles.row}>
          <span className={styles.k}>{row.k}</span>
          <span className={styles.v}>{row.v}</span>
        </div>
      ))}
    </aside>
  );
}

export function StatusPill({
  status,
}: {
  status: "pending" | "skipped" | "done" | "failed";
}) {
  return <span className={`${styles.status} ${styles[status]}`}>{status}</span>;
}
