"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Neighbor = { id: string } | null;

export function PrevNextKeys({
  prev,
  next,
  fromQuery,
}: {
  prev: Neighbor;
  next: Neighbor;
  fromQuery: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.push(`/f/${prev.id}?${fromQuery}`);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.push(`/f/${next.id}?${fromQuery}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, fromQuery, router]);

  return null;
}
