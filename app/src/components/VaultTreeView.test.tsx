// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { VaultTreeView } from "./VaultTreeView";
import { ItemActionProvider } from "./ItemActionProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderTree(nodes: Parameters<typeof VaultTreeView>[0]["nodes"]) {
  return render(
    <ItemActionProvider>
      <VaultTreeView nodes={nodes} />
    </ItemActionProvider>,
  );
}

afterEach(() => cleanup());

const FIXTURE = [
  { id: "a", name: "stunts", parent_id: null },
  { id: "b", name: "raids",  parent_id: null },
  { id: "c", name: "epic",   parent_id: "a" },
  { id: "d", name: "deep",   parent_id: "c" },
];

describe("VaultTreeView", () => {
  it("renders top-level folders with collapse caret when they have children", () => {
    renderTree(FIXTURE);
    expect(screen.getByText("stunts")).toBeInTheDocument();
    expect(screen.getByText("raids")).toBeInTheDocument();
    expect(screen.queryByText("epic")).not.toBeInTheDocument();
  });

  it("expands a node on caret click", () => {
    renderTree(FIXTURE);
    fireEvent.click(screen.getByLabelText("expand stunts"));
    expect(screen.getByText("epic")).toBeInTheDocument();
    expect(screen.queryByText("deep")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("expand epic"));
    expect(screen.getByText("deep")).toBeInTheDocument();
  });

  it("renders folder names as links to /d/[id]", () => {
    renderTree(FIXTURE);
    expect(screen.getByText("stunts").closest("a")).toHaveAttribute("href", "/d/a");
  });
});
