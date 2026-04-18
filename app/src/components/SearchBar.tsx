"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./SearchBar.module.css";

type Hit = { type: "folder" | "file"; id: string; name: string };

export function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`);
      if (!res.ok) return;
      const body = await res.json();
      setHits([
        ...body.folders.map((f: { id: string; name: string }) => ({ type: "folder" as const, id: f.id, name: f.name })),
        ...body.files.map((f: { id: string; original_name: string }) => ({ type: "file" as const, id: f.id, name: f.original_name })),
      ]);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} role="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="search files, folders, uploaders…"
        className={styles.input}
        aria-label="Search"
      />
      {open && hits.length > 0 && (
        <ul className={styles.dropdown} role="listbox">
          {hits.map((h) => (
            <li key={`${h.type}-${h.id}`}>
              <Link href={h.type === "folder" ? `/d/${h.id}` : `/f/${h.id}`}>
                <span className={styles.kind}>{h.type}</span> {h.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
