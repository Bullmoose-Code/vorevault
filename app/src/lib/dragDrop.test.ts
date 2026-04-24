// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  VV_DRAG_MIME,
  encodeDragPayload,
  decodeDragPayload,
  resolveDraggedItems,
  dropTargetIsValid,
} from "./dragDrop";
import type { SelectedItem } from "@/components/SelectionContext";

const file = (id: string): SelectedItem => ({ kind: "file", id, name: id, canManage: true, folderId: null });
const folder = (id: string): SelectedItem => ({ kind: "folder", id, name: id, canManage: true, parentId: null });

describe("encodeDragPayload / decodeDragPayload", () => {
  it("round-trips items through a DataTransfer", () => {
    const dt = new DataTransfer();
    const items = [file("a"), folder("b")];
    encodeDragPayload(dt, items);
    expect(Array.from(dt.types)).toContain(VV_DRAG_MIME);
    const decoded = decodeDragPayload(dt);
    expect(decoded).toEqual(items);
  });

  it("decode returns null if MIME type not present", () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "hello");
    expect(decodeDragPayload(dt)).toBeNull();
  });

  it("decode returns null if payload is not valid JSON", () => {
    const dt = new DataTransfer();
    dt.setData(VV_DRAG_MIME, "not-json");
    expect(decodeDragPayload(dt)).toBeNull();
  });

  it("decode returns null if payload is not an array of SelectedItems", () => {
    const dt = new DataTransfer();
    dt.setData(VV_DRAG_MIME, JSON.stringify({ wrong: "shape" }));
    expect(decodeDragPayload(dt)).toBeNull();
  });
});

describe("resolveDraggedItems", () => {
  it("returns the whole selection if origin is in selection", () => {
    const origin = file("a");
    const selection = [file("a"), file("b")];
    expect(resolveDraggedItems(origin, selection)).toEqual(selection);
  });

  it("returns only origin if origin not in selection", () => {
    const origin = file("a");
    const selection = [file("b"), file("c")];
    expect(resolveDraggedItems(origin, selection)).toEqual([origin]);
  });

  it("returns only origin if selection is empty", () => {
    const origin = folder("x");
    expect(resolveDraggedItems(origin, [])).toEqual([origin]);
  });
});

describe("dropTargetIsValid", () => {
  it("returns true when target folder id is not in payload", () => {
    const items = [file("a"), folder("b")];
    expect(dropTargetIsValid("other-folder", items)).toBe(true);
  });

  it("returns false when target folder id matches a folder in payload (self-drop)", () => {
    const items = [folder("target")];
    expect(dropTargetIsValid("target", items)).toBe(false);
  });

  it("returns true when target folder id equals a file id (file ids and folder ids are different namespaces)", () => {
    const items = [file("same-id")];
    expect(dropTargetIsValid("same-id", items)).toBe(true);
  });
});
