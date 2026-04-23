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
});
