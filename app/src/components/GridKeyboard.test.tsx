// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { GridKeyboard } from "./GridKeyboard";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";

type SelectionRef = { current: ReturnType<typeof useSelection> | null };

function mountWithCards(cards: SelectedItem[]): { selectionRef: SelectionRef } {
  const selectionRef: SelectionRef = { current: null };
  function Capture() {
    selectionRef.current = useSelection();
    return null;
  }
  render(
    <SelectionProvider>
      <Capture />
      <GridKeyboard />
      {cards.map((c) => (
        <a
          key={`${c.kind}:${c.id}`}
          href="#"
          data-nav-item
          data-nav-descriptor={JSON.stringify(c)}
          tabIndex={0}
          data-testid={`card-${c.id}`}
        />
      ))}
    </SelectionProvider>,
  );
  return { selectionRef };
}

const file = (id: string): SelectedItem => ({ kind: "file", id, name: id, canManage: true, folderId: null });

function dispatchKey(init: KeyboardEventInit & { key: string }) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

describe("GridKeyboard", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("Cmd+A selects all nav items", () => {
    const { selectionRef } = mountWithCards([file("a"), file("b"), file("c")]);
    dispatchKey({ key: "a", metaKey: true });
    expect(selectionRef.current?.size).toBe(3);
  });

  it("Cmd+A does NOT intercept when typing in an input", () => {
    const { selectionRef } = mountWithCards([file("a")]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    dispatchKey({ key: "a", metaKey: true });
    expect(selectionRef.current?.size).toBe(0);
  });

  it("Space on focused nav item toggles selection", () => {
    const { selectionRef } = mountWithCards([file("a")]);
    const card = document.querySelector<HTMLAnchorElement>('[data-testid="card-a"]')!;
    card.focus();
    dispatchKey({ key: " " });
    expect(selectionRef.current?.size).toBe(1);
  });

  it("Del with selection dispatches vv:batch-trash", () => {
    const handler = vi.fn();
    window.addEventListener("vv:batch-trash", handler);
    try {
      const { selectionRef } = mountWithCards([file("a")]);
      act(() => {
        selectionRef.current!.toggle(file("a"));
      });
      dispatchKey({ key: "Delete" });
      expect(handler).toHaveBeenCalled();
    } finally {
      window.removeEventListener("vv:batch-trash", handler);
    }
  });

  it("Del does nothing when selection empty", () => {
    const handler = vi.fn();
    window.addEventListener("vv:batch-trash", handler);
    try {
      mountWithCards([file("a")]);
      dispatchKey({ key: "Delete" });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("vv:batch-trash", handler);
    }
  });

  it("`/` focuses #vv-search", () => {
    const input = document.createElement("input");
    input.id = "vv-search";
    document.body.appendChild(input);
    mountWithCards([]);
    dispatchKey({ key: "/" });
    expect(document.activeElement).toBe(input);
  });
});
