// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionToolbar } from "./SelectionToolbar";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function Seed({ items }: { items: SelectedItem[] }) {
  const sel = useSelection();
  const seeded = React.useRef(false);
  if (!seeded.current && items.length > 0) {
    seeded.current = true;
    items.forEach((it) => sel.toggle(it));
  }
  return null;
}

function renderWith(items: SelectedItem[]) {
  return render(
    <CurrentUserProvider value={{ id: "u", isAdmin: false }}>
      <ItemActionProvider>
        <SelectionProvider>
          <Seed items={items} />
          <SelectionToolbar />
        </SelectionProvider>
      </ItemActionProvider>
    </CurrentUserProvider>,
  );
}

const fileItem: SelectedItem = {
  kind: "file", id: "a", name: "a.mp4", canManage: true, folderId: null,
};

describe("SelectionToolbar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing when selection empty", () => {
    renderWith([]);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("shows '1 selected' after one item is seeded", () => {
    renderWith([fileItem]);
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText(/selected/i)).toBeInTheDocument();
  });

  it("Clear button empties the selection", async () => {
    const user = userEvent.setup();
    renderWith([fileItem]);
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("Trash button is hidden unless all selected items are manageable", () => {
    renderWith([{ ...fileItem, canManage: false }]);
    expect(screen.queryByRole("button", { name: /move to trash/i })).not.toBeInTheDocument();
  });

  it("Trash button opens a confirm dialog", async () => {
    const user = userEvent.setup();
    renderWith([fileItem]);
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("Move button opens a folder picker modal", async () => {
    const user = userEvent.setup();
    renderWith([fileItem]);
    await user.click(screen.getByRole("button", { name: /^move to…$/i }));
    expect(await screen.findByRole("dialog", { name: /move/i })).toBeInTheDocument();
  });

  it("Download zip button is hidden if selection contains a folder", () => {
    renderWith([fileItem, { kind: "folder", id: "fo", name: "d", canManage: true, parentId: null }]);
    expect(screen.queryByRole("button", { name: /download as zip/i })).not.toBeInTheDocument();
  });

  it("Download zip button is visible when selection is files only", () => {
    renderWith([fileItem]);
    expect(screen.getByRole("button", { name: /download as zip/i })).toBeInTheDocument();
  });

  it("Download zip button is disabled if selection exceeds 50 files", () => {
    const many: SelectedItem[] = Array.from({ length: 51 }, (_, i) => ({
      kind: "file", id: `id-${i}`, name: `f${i}`, canManage: true, folderId: null,
    }));
    renderWith(many);
    const btn = screen.getByRole("button", { name: /download as zip/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
