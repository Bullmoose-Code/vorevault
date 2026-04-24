"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import styles from "./FilterBar.module.css";

type Tag = { id: string; name: string; file_count: number };

export function FilterBar({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get("tag") ?? "";
  const activeTag = tags.find((t) => t.id === activeId) ?? null;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q ? tags.filter((t) => t.name.includes(q)) : tags;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function update(nextId: string): void {
    const params = new URLSearchParams(sp.toString());
    if (nextId) params.set("tag", nextId);
    else params.delete("tag");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        update(filtered[activeIndex].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.bar} ref={rootRef}>
      {activeTag ? (
        <button
          type="button"
          className={styles.chip}
          onClick={() => update("")}
          aria-label={`clear filter #${activeTag.name}`}
        >
          <span className={styles.chipLabel}>#{activeTag.name}</span>
          <span className={styles.chipX} aria-hidden="true">×</span>
        </button>
      ) : (
        <div className={styles.comboWrap}>
          <input
            type="text"
            className={styles.input}
            aria-label="filter by tag"
            aria-autocomplete="list"
            aria-expanded={open}
            placeholder="filter by tag…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKeyDown}
          />
          {open && (
            <ul role="listbox" className={styles.list}>
              {filtered.length === 0 ? (
                <li className={styles.empty}>no matching tags</li>
              ) : (
                filtered.map((t, i) => (
                  <li
                    key={t.id}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`${styles.option} ${
                      i === activeIndex ? styles.optionActive : ""
                    }`}
                    onMouseDown={(e) => {
                      // mousedown, not click, so it fires before input blur
                      e.preventDefault();
                      update(t.id);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className={styles.optionName}>#{t.name}</span>
                    <span className={styles.count}>{t.file_count}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
