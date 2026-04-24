"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./FilterBar.module.css";

type Tag = { id: string; name: string; file_count: number };

export function FilterBar({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tagId = sp.get("tag") ?? "";

  function update(nextTag: string) {
    const params = new URLSearchParams(sp.toString());
    if (nextTag) params.set("tag", nextTag); else params.delete("tag");
    // reset to page 1 on any filter change
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <span className="vv-meta">tag</span>
        <select
          aria-label="filter by tag"
          value={tagId}
          onChange={(e) => update(e.target.value)}
          className={styles.select}
        >
          <option value="">all</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>#{t.name} ({t.file_count})</option>
          ))}
        </select>
      </label>
      {tagId && (
        <button type="button" onClick={() => update("")} className={styles.clear}>clear</button>
      )}
    </div>
  );
}
