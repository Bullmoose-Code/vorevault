// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { GridMarquee } from "./GridMarquee";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";

type Rect = {
  top: number; left: number; right: number; bottom: number;
  width: number; height: number; x: number; y: number; toJSON: () => unknown;
};

function rect(x: number, y: number, w = 100, h = 100): Rect {
  return {
    top: y, left: x, right: x + w, bottom: y + h,
    width: w, height: h, x, y, toJSON: () => ({ x, y, w, h }),
  };
}

function makeAnchor(descriptor: object, r: Rect): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("data-nav-item", "");
  a.setAttribute("data-nav-descriptor", JSON.stringify(descriptor));
  a.getBoundingClientRect = () => r as DOMRect;
  document.body.appendChild(a);
  return a;
}

type SelectionRef = { current: ReturnType<typeof useSelection> | null };

function mount(): SelectionRef {
  const ref: SelectionRef = { current: null };
  function Capture() {
    ref.current = useSelection();
    return null;
  }
  render(
    <SelectionProvider>
      <Capture />
      <GridMarquee />
    </SelectionProvider>,
  );
  return ref;
}

function mouse(type: string, init: MouseEventInit) {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
}

describe("GridMarquee", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("mouse-drag across two cards selects both", () => {
    makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(10, 10, 100, 100));
    makeAnchor({ kind: "file", id: "b", name: "b", canManage: true, folderId: null }, rect(200, 10, 100, 100));
    const sel = mount();
    act(() => {
      document.dispatchEvent(mouse("mousedown", { clientX: 0, clientY: 0, button: 0 }));
      document.dispatchEvent(mouse("mousemove", { clientX: 350, clientY: 150, button: 0 }));
      document.dispatchEvent(mouse("mouseup", { clientX: 350, clientY: 150, button: 0 }));
    });
    expect(sel.current?.size).toBe(2);
  });

  it("mousedown on a nav-item does not start a marquee (no selection change on pure click)", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(10, 10, 100, 100));
    const sel = mount();
    act(() => {
      a.dispatchEvent(mouse("mousedown", { clientX: 50, clientY: 50, button: 0 }));
      document.dispatchEvent(mouse("mousemove", { clientX: 400, clientY: 400, button: 0 }));
      document.dispatchEvent(mouse("mouseup", { clientX: 400, clientY: 400, button: 0 }));
    });
    expect(sel.current?.size).toBe(0);
  });

  it("right-click (button 2) does not start a marquee", () => {
    makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(10, 10, 100, 100));
    const sel = mount();
    act(() => {
      document.dispatchEvent(mouse("mousedown", { clientX: 0, clientY: 0, button: 2 }));
      document.dispatchEvent(mouse("mousemove", { clientX: 200, clientY: 200, button: 2 }));
      document.dispatchEvent(mouse("mouseup", { clientX: 200, clientY: 200, button: 2 }));
    });
    expect(sel.current?.size).toBe(0);
  });

  it("plain click-without-drag on empty space does not clear selection", () => {
    makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(10, 10, 100, 100));
    const sel = mount();
    // pre-select something so we can detect a spurious clear
    act(() => {
      sel.current!.toggle({ kind: "file", id: "pre", name: "pre", canManage: true, folderId: null });
    });
    // Tiny mousedown + mouseup inside the drag threshold
    act(() => {
      document.dispatchEvent(mouse("mousedown", { clientX: 500, clientY: 500, button: 0 }));
      document.dispatchEvent(mouse("mouseup", { clientX: 500, clientY: 500, button: 0 }));
    });
    expect(sel.current?.size).toBe(1);
  });

  it("shift-drag adds to existing selection instead of replacing", () => {
    makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(200, 10, 100, 100));
    const sel = mount();
    act(() => {
      sel.current!.toggle({ kind: "file", id: "pre", name: "pre", canManage: true, folderId: null });
    });
    act(() => {
      document.dispatchEvent(mouse("mousedown", { clientX: 150, clientY: 0, button: 0, shiftKey: true }));
      document.dispatchEvent(mouse("mousemove", { clientX: 350, clientY: 150, button: 0, shiftKey: true }));
      document.dispatchEvent(mouse("mouseup", { clientX: 350, clientY: 150, button: 0, shiftKey: true }));
    });
    expect(sel.current?.size).toBe(2);
  });
});
