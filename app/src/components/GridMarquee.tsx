"use client";

import { useEffect, useRef, useState } from "react";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { buildMarqueeRect, rectsOverlap, type MarqueeRect, type Point } from "@/lib/marquee";
import styles from "./GridMarquee.module.css";

// Minimum mouse travel before a mousedown promotes to a marquee drag. Without
// this, every click-without-move would clear the selection on mouseup.
const DRAG_THRESHOLD_PX = 4;

type DragState = {
  start: Point;
  current: Point;
  shiftKey: boolean;
  armed: boolean; // true after threshold exceeded
};

// Only start a marquee if the mousedown happens in the main content body,
// not on a card/button/input (existing rules) and not on text the user
// might want to select/copy. Sidebar + topbar live outside <main>, so the
// closest("main") check alone keeps the marquee off chrome.
function canStartMarquee(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (!target.closest("main")) return false;
  if (
    target.closest(
      "[data-nav-item], a, button, input, textarea, select, label, [role='menu'], [role='dialog'], [role='toolbar']",
    )
  ) {
    return false;
  }
  if (
    target.closest(
      "h1, h2, h3, h4, h5, h6, p, pre, code, strong, em, blockquote, figcaption",
    )
  ) {
    return false;
  }
  return true;
}

function collectOverlaps(rect: MarqueeRect): SelectedItem[] {
  const nodes = document.querySelectorAll<HTMLElement>("[data-nav-item]");
  const out: SelectedItem[] = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (!rectsOverlap(rect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) continue;
    const raw = el.getAttribute("data-nav-descriptor");
    if (!raw) continue;
    try {
      const desc = JSON.parse(raw) as SelectedItem;
      if (!desc || typeof desc !== "object") continue;
      if (desc.kind !== "file" && desc.kind !== "folder") continue;
      out.push(desc);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export function GridMarquee() {
  const selection = useSelection();
  // Drag state lives in a ref so event handlers can read/write without
  // triggering renders and without hitting setState-during-render warnings
  // when we call selection.* on mouseup.
  const dragRef = useRef<DragState | null>(null);
  // Mirror of dragRef.current used *only* for rendering the visible rect.
  const [visible, setVisible] = useState<MarqueeRect | null>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      if (!canStartMarquee(e.target)) return;
      dragRef.current = {
        start: { x: e.clientX, y: e.clientY },
        current: { x: e.clientX, y: e.clientY },
        shiftKey: e.shiftKey,
        armed: false,
      };
    }

    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      d.current = { x: e.clientX, y: e.clientY };
      if (!d.armed) {
        const dx = d.current.x - d.start.x;
        const dy = d.current.y - d.start.y;
        if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          d.armed = true;
        }
      }
      if (d.armed) {
        setVisible(buildMarqueeRect(d.start, d.current));
      }
    }

    function onMouseUp() {
      const d = dragRef.current;
      dragRef.current = null;
      setVisible(null);
      if (!d || !d.armed) return;
      const rect = buildMarqueeRect(d.start, d.current);
      const overlaps = collectOverlaps(rect);
      if (!d.shiftKey) selection.clear();
      if (overlaps.length > 0) selection.addRange(overlaps);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dragRef.current) {
        dragRef.current = null;
        setVisible(null);
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selection]);

  if (!visible) return null;

  const style: React.CSSProperties = {
    left: visible.left,
    top: visible.top,
    width: visible.right - visible.left,
    height: visible.bottom - visible.top,
  };

  return <div className={styles.marquee} style={style} aria-hidden="true" />;
}
