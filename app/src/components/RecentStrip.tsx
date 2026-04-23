import Link from "next/link";
import type { FileWithUploader } from "@/lib/files";
import styles from "./RecentStrip.module.css";

export function RecentStrip({ files }: { files: FileWithUploader[] }) {
  if (files.length === 0) return null;
  return (
    <section className={styles.section} aria-label="recent uploads">
      <div className={styles.header}>
        <h2 className="vv-section-label">recent</h2>
        <Link href="/recent" className={styles.viewAll}>view all</Link>
      </div>
      <div className={styles.strip}>
        {files.map((f) => (
          <Link key={f.id} href={`/f/${f.id}`} className={styles.tile}>
            {f.thumbnail_path ? (
              <img src={`/api/thumbs/${f.id}`} alt={f.original_name} loading="lazy" />
            ) : (
              <div className={styles.tilePlaceholder} aria-hidden="true">{f.original_name.slice(0, 1)}</div>
            )}
            <div className={styles.tileLabel} title={f.original_name}>{f.original_name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
