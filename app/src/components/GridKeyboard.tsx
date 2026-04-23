"use client";

import { useEffect, useRef } from "react";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { readNavItems, findNextInDirection } from "@/lib/gridNav";

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  return false;
}

function getFocusedNavItem(): HTMLElement | null {
  const active = document.activeElement;
  if (!active) return null;
  if (!(active instanceof HTMLElement)) return null;
  if (!active.hasAttribute("data-nav-item")) return null;
  return active;
}

function parseDescriptor(el: HTMLElement): SelectedItem | null {
  const raw = el.getAttribute("data-nav-descriptor");
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as SelectedItem;
    if (!d || typeof d !== "object") return null;
    if (d.kind !== "file" && d.kind !== "folder") return null;
    return d;
  } catch {
    return null;
  }
}

export function GridKeyboard() {
  const selection = useSelection();
  // Keep a ref to the latest selection so the stable keydown listener always
  // calls the current callbacks. The Ctx object's data properties (size,
  // items) use getter indirection into a live store, so they're always fresh.
  const selRef = useRef(selection);
  selRef.current = selection;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const sel = selRef.current;
      const active = document.activeElement as HTMLElement | null;
      const focused = getFocusedNavItem();

      // Cmd/Ctrl + A
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (isTyping(active)) return;
        e.preventDefault();
        const items = readNavItems();
        sel.addRange(items.map((it) => it.descriptor));
        return;
      }

      // `/`
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        if (isTyping(active)) return;
        const input = document.getElementById("vv-search");
        if (input && input instanceof HTMLElement) {
          e.preventDefault();
          input.focus();
        }
        return;
      }

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isTyping(active)) return;
        if (sel.size === 0) return;
        if (!sel.items.every((it) => it.canManage)) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("vv:batch-trash"));
        return;
      }

      // Space
      if (e.key === " ") {
        if (!focused) return;
        const desc = parseDescriptor(focused);
        if (!desc) return;
        e.preventDefault();
        sel.toggle(desc);
        return;
      }

      // Arrow keys
      let direction: "up" | "down" | "left" | "right" | null = null;
      if (e.key === "ArrowRight") direction = "right";
      else if (e.key === "ArrowLeft") direction = "left";
      else if (e.key === "ArrowUp") direction = "up";
      else if (e.key === "ArrowDown") direction = "down";
      if (direction && focused) {
        const items = readNavItems();
        const next = findNextInDirection(focused, direction, items);
        if (!next) return;
        e.preventDefault();
        next.el.focus();
        if (e.shiftKey) {
          sel.toggle(next.descriptor);
        }
        return;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable listener; reads latest via selRef (getters into live store)

  return null;
}
