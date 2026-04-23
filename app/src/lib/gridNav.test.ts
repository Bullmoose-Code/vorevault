// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readNavItems, sliceBetween, findNextInDirection, type NavItem } from "./gridNav";

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number; x: number; y: number; toJSON: () => unknown };

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

function resetBody() {
  document.body.replaceChildren();
}

describe("readNavItems", () => {
  beforeEach(resetBody);

  it("returns an empty array when no nav items exist", () => {
    expect(readNavItems()).toEqual([]);
  });

  it("returns items in DOM order with parsed descriptors", () => {
    makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(0, 0));
    makeAnchor({ kind: "folder", id: "b", name: "b", canManage: true, parentId: null }, rect(100, 0));
    const items = readNavItems();
    expect(items.length).toBe(2);
    expect(items[0].descriptor).toMatchObject({ kind: "file", id: "a" });
    expect(items[1].descriptor).toMatchObject({ kind: "folder", id: "b" });
  });

  it("skips items with malformed JSON descriptors gracefully", () => {
    const good = makeAnchor({ kind: "file", id: "g", name: "g", canManage: true, folderId: null }, rect(0, 0));
    const bad = document.createElement("a");
    bad.setAttribute("data-nav-item", "");
    bad.setAttribute("data-nav-descriptor", "not-json");
    document.body.appendChild(bad);
    const items = readNavItems();
    expect(items.length).toBe(1);
    expect(items[0].el).toBe(good);
  });
});

describe("sliceBetween", () => {
  it("returns inclusive slice from anchor to target", () => {
    const items: NavItem[] = [
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "a", name: "a", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "b", name: "b", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "c", name: "c", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "d", name: "d", canManage: true, folderId: null } },
    ];
    const slice = sliceBetween({ kind: "file", id: "b" }, { kind: "file", id: "d" }, items);
    expect(slice.map((it) => it.descriptor.id)).toEqual(["b", "c", "d"]);
  });

  it("handles anchor after target (reverse range)", () => {
    const items: NavItem[] = [
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "a", name: "a", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "b", name: "b", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "c", name: "c", canManage: true, folderId: null } },
    ];
    const slice = sliceBetween({ kind: "file", id: "c" }, { kind: "file", id: "a" }, items);
    expect(slice.map((it) => it.descriptor.id)).toEqual(["a", "b", "c"]);
  });

  it("returns empty if anchor not in items", () => {
    const items: NavItem[] = [
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "a", name: "a", canManage: true, folderId: null } },
    ];
    const slice = sliceBetween({ kind: "file", id: "missing" }, { kind: "file", id: "a" }, items);
    expect(slice).toEqual([]);
  });
});

describe("findNextInDirection", () => {
  beforeEach(resetBody);

  it("right: moves to the next item in DOM order", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const b = makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    const items = readNavItems();
    const next = findNextInDirection(a, "right", items);
    expect(next?.el).toBe(b);
  });

  it("left: moves to previous item in DOM order", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const b = makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    const items = readNavItems();
    const prev = findNextInDirection(b, "left", items);
    expect(prev?.el).toBe(a);
  });

  it("down: picks next-row item whose X-center is closest", () => {
    // Row 0: a (x=0-100), b (x=120-220), c (x=240-340)
    // Row 1: d (x=0-100), e (x=120-220), f (x=240-340)
    makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    makeAnchor({ kind: "file", id: "c", name: "", canManage: true, folderId: null }, rect(240, 0));
    makeAnchor({ kind: "file", id: "d", name: "", canManage: true, folderId: null }, rect(0, 120));
    const e = makeAnchor({ kind: "file", id: "e", name: "", canManage: true, folderId: null }, rect(120, 120));
    makeAnchor({ kind: "file", id: "f", name: "", canManage: true, folderId: null }, rect(240, 120));
    const items = readNavItems();
    // Down from b (x-center 170) should land on e (x-center 170).
    const bEl = items[1].el;
    const next = findNextInDirection(bEl, "down", items);
    expect(next?.el).toBe(e);
  });

  it("up: picks prev-row item whose X-center is closest", () => {
    makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const b = makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    makeAnchor({ kind: "file", id: "c", name: "", canManage: true, folderId: null }, rect(0, 120));
    const e = makeAnchor({ kind: "file", id: "e", name: "", canManage: true, folderId: null }, rect(120, 120));
    const items = readNavItems();
    const next = findNextInDirection(e, "up", items);
    expect(next?.el).toBe(b);
  });

  it("returns null at grid edges", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const items = readNavItems();
    expect(findNextInDirection(a, "left", items)).toBeNull();
    expect(findNextInDirection(a, "up", items)).toBeNull();
  });
});
