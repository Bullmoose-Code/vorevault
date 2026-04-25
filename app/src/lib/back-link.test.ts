import { describe, expect, it } from "vitest";
import { backLinkForFile } from "./back-link";
import type { FolderRow } from "./folders";

function folder(id: string, name: string, parent_id: string | null = null): FolderRow {
  return {
    id,
    name,
    parent_id,
    created_by: "00000000-0000-4000-8000-000000000000",
    created_at: new Date("2026-04-25T00:00:00Z"),
    deleted_at: null,
  };
}

describe("backLinkForFile", () => {
  it("returns 'back to vault' when the file has no folder (empty breadcrumbs)", () => {
    expect(backLinkForFile([])).toEqual({
      href: "/",
      label: "back to vault",
    });
  });

  it("returns 'back to <folder>' when the file is in a top-level folder", () => {
    const crumbs = [folder("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Apex Clips")];
    expect(backLinkForFile(crumbs)).toEqual({
      href: "/d/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      label: "back to Apex Clips",
    });
  });

  it("returns 'back to <innermost folder>' when the file is in a nested folder", () => {
    const crumbs = [
      folder("11111111-1111-4111-8111-111111111111", "Clips"),
      folder("22222222-2222-4222-8222-222222222222", "Apex", "11111111-1111-4111-8111-111111111111"),
    ];
    expect(backLinkForFile(crumbs)).toEqual({
      href: "/d/22222222-2222-4222-8222-222222222222",
      label: "back to Apex",
    });
  });
});
