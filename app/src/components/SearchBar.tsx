"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./SearchBar.module.css";

type Hit = { type: "folder" | "file"; id: string; name: string };

type Props = {
  variant?: "inline" | "overlay";
  autoFocus?: boolean;
  onHitSelected?: () => void;
};

export function SearchBar({
  variant = "inline",
  autoFocus = false,
  onHitSelected,
}: Props = {}) {
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
    if (q.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
      onHitSelected?.();
    }
  }

  const formClass = variant === "overlay" ? styles.formOverlay : styles.formInline;
  const inputClass = variant === "overlay" ? styles.inputOverlay : styles.inputInline;
  const dropdownClass = variant === "overlay" ? styles.dropdownOverlay : styles.dropdownInline;

  return (
    <form onSubmit={onSubmit} className={`${styles.form} ${formClass}`} role="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="search files, folders, uploaders…"
        className={`${styles.input} ${inputClass}`}
        aria-label="Search"
        autoFocus={autoFocus}
      />
      {open && hits.length > 0 && (
        <ul className={`${styles.dropdown} ${dropdownClass}`} role="listbox">
          {hits.map((h) => (
            <li key={`${h.type}-${h.id}`}>
              <Link
                href={h.type === "folder" ? `/d/${h.id}` : `/f/${h.id}`}
                onClick={() => onHitSelected?.()}
              >
                <span className={styles.kind}>{h.type}</span> {h.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
