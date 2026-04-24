// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { FolderTile } from "./FolderTile";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";
import { SelectionProvider } from "./SelectionContext";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderIt(props: Partial<React.ComponentProps<typeof FolderTile>> = {}) {
  return render(
    <CurrentUserProvider value={{ id: "u", isAdmin: false }}>
      <SelectionProvider>
        <ItemActionProvider>
          <FolderTile
            id="fo-1"
            name="pics"
            fileCount={2}
            subfolderCount={0}
            createdBy="u"
            parentId={null}
            {...props}
          />
        </ItemActionProvider>
      </SelectionProvider>
    </CurrentUserProvider>,
  );
}

describe("FolderTile", () => {
  it("renders name and counts", () => {
    const { container } = renderIt();
    expect(container.textContent).toContain("pics");
    expect(container.textContent).toContain("2");
  });

  it("plain click does not preventDefault", () => {
    const { container } = renderIt();
    const a = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("meta-click selects and prevents navigation", () => {
    const { container } = renderIt();
    const a = container.querySelector("a")!;
    fireEvent.click(a, { metaKey: true });
    expect(container.querySelector("a")!.className).toMatch(/selected/);
  });

  it("shift-click after a cmd-click adds the range between the two", () => {
    const { container } = render(
      <CurrentUserProvider value={{ id: "u", isAdmin: false }}>
        <SelectionProvider>
          <ItemActionProvider>
            <FolderTile id="fo-1" name="a" fileCount={0} subfolderCount={0} createdBy="u" parentId={null} />
            <FolderTile id="fo-2" name="b" fileCount={0} subfolderCount={0} createdBy="u" parentId={null} />
          </ItemActionProvider>
        </SelectionProvider>
      </CurrentUserProvider>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    const [linkA, linkB] = links;
    fireEvent.click(linkA, { metaKey: true });
    fireEvent.click(linkB, { shiftKey: true });
    expect(linkA.className).toMatch(/selected/);
    expect(linkB.className).toMatch(/selected/);
  });

  it("is draggable when canManage is true", () => {
    const { container } = renderIt({ createdBy: "u" });
    const a = container.querySelector("a")!;
    expect(a.getAttribute("draggable")).toBe("true");
  });

  it("is NOT draggable when canManage is false", () => {
    const { container } = renderIt({ createdBy: "someone-else" });
    const a = container.querySelector("a")!;
    expect(a.getAttribute("draggable")).toBe("false");
  });

  it("onDrop calls fetch to move the dragged file into this folder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { container } = renderIt({ id: "target-folder" });
      const a = container.querySelector("a")!;
      const dt = new DataTransfer();
      dt.setData(
        "application/x-vorevault-drag",
        JSON.stringify([{ kind: "file", id: "dragged-file", name: "x", canManage: true, folderId: null }]),
      );
      a.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/dragged-file/move",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("drop on self is rejected (no fetch call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { container } = renderIt({ id: "fo-self" });
      const a = container.querySelector("a")!;
      const dt = new DataTransfer();
      dt.setData(
        "application/x-vorevault-drag",
        JSON.stringify([{ kind: "folder", id: "fo-self", name: "x", canManage: true, parentId: null }]),
      );
      a.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
