import Link from "next/link";
import styles from "./Breadcrumbs.module.css";

export type Crumb = { id: string | null; name: string };

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        <li>
          <Link href="/" className={styles.crumb}>home</Link>
        </li>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.id ?? i} {...(last ? { "aria-current": "page" } : {})}>
              <span className={styles.sep} aria-hidden="true">›</span>
              {last || !c.id ? (
                <span className={styles.here}>{c.name}</span>
              ) : (
                <Link href={`/d/${c.id}`} className={styles.crumb}>{c.name}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
