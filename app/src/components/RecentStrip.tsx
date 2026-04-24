import Link from "next/link";
import type { TopLevelItem } from "@/lib/files";
import styles from "./RecentStrip.module.css";

export function RecentStrip({ items }: { items: TopLevelItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section} aria-label="recent uploads">
      <div className={styles.header}>
        <h2 className="vv-section-label">recent</h2>
        <Link href="/recent" className={styles.viewAll}>view all</Link>
      </div>
      <div className={styles.strip}>
        {items.map((it) => it.kind === "folder" ? (
          <Link key={it.id} href={`/d/${it.id}`} className={`${styles.tile} ${styles.folderTile}`}>
            <div className={styles.folderGlyph} aria-hidden="true">▤</div>
            <div className={styles.tileLabel} title={it.name}>{it.name}</div>
          </Link>
        ) : (
          <Link key={it.id} href={`/f/${it.id}`} className={styles.tile}>
            {it.thumbnail_path ? (
              <img src={`/api/thumbs/${it.id}`} alt={it.original_name} loading="lazy" />
            ) : (
              <div className={styles.tilePlaceholder} aria-hidden="true">{it.original_name.slice(0, 1)}</div>
            )}
            <div className={styles.tileLabel} title={it.original_name}>{it.original_name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
