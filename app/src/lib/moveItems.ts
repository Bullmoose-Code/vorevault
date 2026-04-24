import type { SelectedItem } from "@/components/SelectionContext";

export type BatchMoveResult = { succeeded: number; failed: number };

export async function moveItems(
  items: SelectedItem[],
  folderId: string | null,
): Promise<BatchMoveResult> {
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    try {
      const res =
        it.kind === "file"
          ? await fetch(`/api/files/${it.id}/move`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderId }),
            })
          : await fetch(`/api/folders/${it.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ parentId: folderId }),
            });
      if (res.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { succeeded, failed };
}
