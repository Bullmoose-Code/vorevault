import Link from "next/link";
import styles from "./PrevNextNav.module.css";

type Neighbor = { id: string } | null;

export function PrevNextNav({
  prev,
  next,
  fromQuery,
}: {
  prev: Neighbor;
  next: Neighbor;
  fromQuery: string; // e.g. "from=tagged&tag=<uuid>" — appended verbatim to neighbor links
}) {
  return (
    <nav className={styles.row} aria-label="file navigation">
      {prev ? (
        <Link href={`/f/${prev.id}?${fromQuery}`} className={styles.button} aria-label="previous file">
          ← prev
        </Link>
      ) : (
        <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true" aria-label="previous file">
          ← prev
        </span>
      )}
      {next ? (
        <Link href={`/f/${next.id}?${fromQuery}`} className={styles.button} aria-label="next file">
          next →
        </Link>
      ) : (
        <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true" aria-label="next file">
          next →
        </span>
      )}
    </nav>
  );
}
