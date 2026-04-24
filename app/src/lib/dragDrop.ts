import type { SelectedItem } from "@/components/SelectionContext";

export const VV_DRAG_MIME = "application/x-vorevault-drag";

export function encodeDragPayload(dt: DataTransfer, items: SelectedItem[]): void {
  dt.setData(VV_DRAG_MIME, JSON.stringify(items));
  dt.effectAllowed = "move";
}

export function decodeDragPayload(dt: DataTransfer): SelectedItem[] | null {
  const raw = dt.getData(VV_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    for (const p of parsed) {
      if (!p || typeof p !== "object") return null;
      if (p.kind !== "file" && p.kind !== "folder") return null;
      if (typeof p.id !== "string") return null;
    }
    return parsed as SelectedItem[];
  } catch {
    return null;
  }
}

/**
 * Decide what a drag carries: the whole selection if origin is in it,
 * otherwise just the origin.
 */
export function resolveDraggedItems(
  origin: SelectedItem,
  selection: SelectedItem[],
): SelectedItem[] {
  const inSelection = selection.some((it) => it.kind === origin.kind && it.id === origin.id);
  if (inSelection && selection.length > 0) return selection;
  return [origin];
}

/**
 * Client-side drop validity: reject drops onto a folder that's in the payload.
 * Server handles cycle detection for folders-into-descendants.
 */
export function dropTargetIsValid(targetFolderId: string, items: SelectedItem[]): boolean {
  for (const it of items) {
    if (it.kind === "folder" && it.id === targetFolderId) return false;
  }
  return true;
}
