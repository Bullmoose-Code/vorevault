import styles from "./PrevNextNav.module.css";

type Neighbor = { id: string } | null;

export function PrevNextNav({
  prev,
  next,
  fromQuery,
}: {
  prev: Neighbor;
  next: Neighbor;
  fromQuery: string; // e.g. "from=folder/abc-123" — appended verbatim
}) {
  return (
    <nav className={styles.row} aria-label="prev/next file">
      {prev ? (
        <a href={`/f/${prev.id}?${fromQuery}`} className={styles.button}>← prev</a>
      ) : (
        <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">← prev</span>
      )}
      {next ? (
        <a href={`/f/${next.id}?${fromQuery}`} className={styles.button}>next →</a>
      ) : (
        <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">next →</span>
      )}
    </nav>
  );
}
