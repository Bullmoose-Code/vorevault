// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FolderContextMenu } from "./FolderContextMenu";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function wrap(createdBy: string, user: { id: string; isAdmin: boolean }) {
  return render(
    <CurrentUserProvider value={user}>
      <ItemActionProvider>
        <FolderContextMenu folder={{ id: "fo-1", name: "pics", createdBy, parentId: null }}>
          <div data-testid="target">x</div>
        </FolderContextMenu>
      </ItemActionProvider>
    </CurrentUserProvider>,
  );
}

describe("FolderContextMenu", () => {
  it("owner sees all actions", async () => {
    wrap("u-o", { id: "u-o", isAdmin: false });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument();
    expect(screen.getByText(/^rename$/i)).toBeInTheDocument();
    expect(screen.getByText(/^move to…$/i)).toBeInTheDocument();
    expect(screen.getByText(/move to trash/i)).toBeInTheDocument();
  });

  it("non-owner non-admin only sees open", async () => {
    wrap("u-o", { id: "u-x", isAdmin: false });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^open$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/move to trash/i)).not.toBeInTheDocument();
  });

  it("admin sees all actions", async () => {
    wrap("u-o", { id: "u-a", isAdmin: true });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/^rename$/i)).toBeInTheDocument();
  });
});
