import type { SelectedItem } from "@/components/SelectionContext";

export type NavItem = {
  el: HTMLElement;
  descriptor: SelectedItem;
};

export type NavKey = { kind: "file" | "folder"; id: string };

export function readNavItems(root: Document | HTMLElement = document): NavItem[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-nav-item]"));
  const items: NavItem[] = [];
  for (const el of nodes) {
    const raw = el.getAttribute("data-nav-descriptor");
    if (!raw) continue;
    try {
      const descriptor = JSON.parse(raw) as SelectedItem;
      if (!descriptor || typeof descriptor !== "object") continue;
      if (descriptor.kind !== "file" && descriptor.kind !== "folder") continue;
      if (typeof descriptor.id !== "string") continue;
      items.push({ el, descriptor });
    } catch {
      // malformed descriptor — skip
    }
  }
  return items;
}

function indexOfKey(items: NavItem[], key: NavKey): number {
  return items.findIndex((it) => it.descriptor.kind === key.kind && it.descriptor.id === key.id);
}

export function sliceBetween(anchor: NavKey, target: NavKey, items: NavItem[]): NavItem[] {
  const a = indexOfKey(items, anchor);
  const b = indexOfKey(items, target);
  if (a < 0 || b < 0) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return items.slice(lo, hi + 1);
}

type Direction = "up" | "down" | "left" | "right";

export function findNextInDirection(
  current: HTMLElement,
  direction: Direction,
  items: NavItem[],
): NavItem | null {
  const idx = items.findIndex((it) => it.el === current);
  if (idx < 0) return null;

  if (direction === "right") return items[idx + 1] ?? null;
  if (direction === "left") return items[idx - 1] ?? null;

  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentTop = currentRect.top;

  const candidates = items
    .filter((it) => it.el !== current)
    .map((it) => {
      const r = it.el.getBoundingClientRect();
      return { item: it, top: r.top, centerX: r.left + r.width / 2 };
    });

  const ROW_TOLERANCE = 5;

  if (direction === "down") {
    const below = candidates.filter((c) => c.top > currentTop + ROW_TOLERANCE);
    if (below.length === 0) return null;
    const minTop = Math.min(...below.map((c) => c.top));
    const nextRow = below.filter((c) => c.top <= minTop + ROW_TOLERANCE);
    nextRow.sort((a, b) => Math.abs(a.centerX - currentCenterX) - Math.abs(b.centerX - currentCenterX));
    return nextRow[0].item;
  }

  const above = candidates.filter((c) => c.top < currentTop - ROW_TOLERANCE);
  if (above.length === 0) return null;
  const maxTop = Math.max(...above.map((c) => c.top));
  const prevRow = above.filter((c) => c.top >= maxTop - ROW_TOLERANCE);
  prevRow.sort((a, b) => Math.abs(a.centerX - currentCenterX) - Math.abs(b.centerX - currentCenterX));
  return prevRow[0].item;
}
