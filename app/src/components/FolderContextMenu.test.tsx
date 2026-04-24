// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { FolderContextMenu } from "./FolderContextMenu";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";
import { SelectionProvider, useSelection } from "./SelectionContext";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function wrap(createdBy: string, user: { id: string; isAdmin: boolean }) {
  return render(
    <CurrentUserProvider value={user}>
      <SelectionProvider>
        <ItemActionProvider>
          <FolderContextMenu folder={{ id: "fo-1", name: "pics", createdBy, parentId: null }}>
            <div data-testid="target">x</div>
          </FolderContextMenu>
        </ItemActionProvider>
      </SelectionProvider>
    </CurrentUserProvider>,
  );
}

describe("FolderContextMenu", () => {
  it("owner sees all actions", async () => {
    wrap("u-o", { id: "u-o", isAdmin: false });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(/download as zip/i)).toBeInTheDocument();
    expect(screen.getByText(/^rename$/i)).toBeInTheDocument();
    expect(screen.getByText(/^move to…$/i)).toBeInTheDocument();
    expect(screen.getByText(/move to trash/i)).toBeInTheDocument();
  });

  it("non-owner non-admin sees open and download as zip", async () => {
    wrap("u-o", { id: "u-x", isAdmin: false });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(/download as zip/i)).toBeInTheDocument();
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/move to trash/i)).not.toBeInTheDocument();
  });

  it("single mode: shows Download as zip action", async () => {
    wrap("u", { id: "u", isAdmin: false });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/download as zip/i)).toBeInTheDocument();
  });

  it("admin sees all actions", async () => {
    wrap("u-o", { id: "u-a", isAdmin: true });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^rename$/i)).toBeInTheDocument();
  });

  it("batch mode: right-click a selected folder when selection > 1 shows only move + trash", async () => {
    function Seed() {
      const sel = useSelection();
      useEffect(() => {
        sel.toggle({ kind: "folder", id: "fo-1", name: "pics", canManage: true, parentId: null });
        sel.toggle({ kind: "folder", id: "fo-2", name: "docs", canManage: true, parentId: null });
        // run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    render(
      <CurrentUserProvider value={{ id: "u", isAdmin: false }}>
        <SelectionProvider>
          <ItemActionProvider>
            <Seed />
            <FolderContextMenu folder={{ id: "fo-1", name: "pics", createdBy: "u", parentId: null }}>
              <div data-testid="target">t</div>
            </FolderContextMenu>
          </ItemActionProvider>
        </SelectionProvider>
      </CurrentUserProvider>,
    );
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^move to…$/i)).toBeInTheDocument();
    expect(screen.getByText(/move to trash/i)).toBeInTheDocument();
    expect(screen.queryByText(/^open$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/download as zip/i)).not.toBeInTheDocument();
  });
});
