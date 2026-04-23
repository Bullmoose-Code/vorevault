// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";

function file(id: string, canManage = true): SelectedItem {
  return { kind: "file", id, name: `f-${id}`, canManage, folderId: null };
}
function folder(id: string, canManage = true): SelectedItem {
  return { kind: "folder", id, name: `d-${id}`, canManage, parentId: null };
}

describe("SelectionContext", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SelectionProvider>{children}</SelectionProvider>
  );

  it("starts empty", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current.size).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it("toggle adds then removes", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.toggle(file("a")));
    expect(result.current.size).toBe(1);
    expect(result.current.isSelected("file", "a")).toBe(true);
    act(() => result.current.toggle(file("a")));
    expect(result.current.size).toBe(0);
  });

  it("toggle tracks anchor for shift-range", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.toggle(file("a")));
    expect(result.current.anchorId).toEqual({ kind: "file", id: "a" });
    act(() => result.current.toggle(folder("b")));
    expect(result.current.anchorId).toEqual({ kind: "folder", id: "b" });
  });

  it("addRange adds items and sets new anchor", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    const items = [file("a"), file("b"), file("c")];
    act(() => result.current.addRange(items));
    expect(result.current.size).toBe(3);
    expect(result.current.anchorId).toEqual({ kind: "file", id: "c" });
  });

  it("clear empties selection and resets anchor", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.toggle(file("a")));
    act(() => result.current.clear());
    expect(result.current.size).toBe(0);
    expect(result.current.anchorId).toBeNull();
  });

  it("throws when used outside provider", () => {
    function Probe() {
      useSelection();
      return null;
    }
    const err = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(/SelectionProvider/);
    } finally {
      console.error = err;
    }
  });
});
