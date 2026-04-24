// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { moveItems } from "./moveItems";
import type { SelectedItem } from "@/components/SelectionContext";

const file = (id: string): SelectedItem => ({ kind: "file", id, name: id, canManage: true, folderId: null });
const folder = (id: string): SelectedItem => ({ kind: "folder", id, name: id, canManage: true, parentId: null });

describe("moveItems", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns {succeeded, failed} with all successes", async () => {
    const result = await moveItems([file("a"), file("b")], null);
    expect(result).toEqual({ succeeded: 2, failed: 0 });
  });

  it("files use POST /api/files/:id/move with { folderId }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await moveItems([file("a")], "folder-x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/a/move",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ folderId: "folder-x" }),
      }),
    );
  });

  it("folders use PATCH /api/folders/:id with { parentId }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await moveItems([folder("a")], "folder-x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/folders/a",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ parentId: "folder-x" }),
      }),
    );
  });

  it("counts per-item failures", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockRejectedValueOnce(new Error("network"))
    );
    const result = await moveItems([file("a"), file("b"), file("c")], null);
    expect(result).toEqual({ succeeded: 1, failed: 2 });
  });
});
